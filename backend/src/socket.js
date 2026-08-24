import jwt from 'jsonwebtoken';
import { query } from './config/db.js';
import RoomMessage from './models/room-message.model.js';
import Friend from './models/friend.model.js';
import matchmakingService from './services/matchmaking.service.js';
import { createSharedGame } from './controllers/game.controller.js';
import GameRoom from './models/game-room.model.js';

export function setupSocket(io) {
    // Middleware d'authentification JWT
    io.use(async (socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('Non autorisé'));
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            // Compatibilité : anciens tokens sans username → requête DB
            if (!decoded.username) {
                const rows = await query('SELECT username FROM users WHERE id = ? LIMIT 1', [decoded.id]);
                decoded.username = rows?.[0]?.username || 'Inconnu';
            }
            socket.user = decoded;
            next();
        } catch {
            next(new Error('Token invalide'));
        }
    });

    const createMatch = async (players, mode) => {
        const creator = players[0];
        const game = await createSharedGame({
            mode,
            creatorId: creator.userId,
            creatorUsername: creator.username,
            playerIds: players.map(({ userId: playerId }) => playerId)
        });
        const payload = {
            game,
            players: players.map(({ userId: playerId, username: playerUsername }) => ({ userId: playerId, username: playerUsername }))
        };
        players.forEach(({ socketId }) => io.sockets.sockets.get(socketId)?.emit('matchmaking:found', payload));
    };

    io.on('connection', (socket) => {
        const { id: userId, username } = socket.user;
        socket.join(`user:${userId}`);

        // Mettre à jour la présence à la connexion
        Friend.updateLastSeen(userId).catch(console.error);

        // Rejoindre un salon de chat
        socket.on('room:join', (roomId) => {
            if (!roomId) return;
            socket.join(`room:${roomId}`);
        });

        // Quitter un salon de chat
        socket.on('room:leave', (roomId) => {
            if (!roomId) return;
            socket.leave(`room:${roomId}`);
        });

        socket.on('disconnecting', async () => {
            const roomIds = [...socket.rooms]
                .filter((roomName) => roomName.startsWith('room:'))
                .map((roomName) => Number(roomName.slice(5)))
                .filter(Number.isInteger);
            for (const roomId of roomIds) {
                try {
                    const result = await GameRoom.leave(userId, roomId);
                    io.to(`room:${roomId}`).emit(result.closed ? 'room:closed' : 'room:updated', { roomId });
                } catch (error) {
                    if (error.status !== 404) console.error('[Room] disconnect cleanup:', error);
                }
            }
        });

        // Envoyer un message de chat
        socket.on('chat:send', async ({ roomId, message }) => {
            if (!message?.trim() || !roomId) return;
            try {
                const result = await RoomMessage.sendMessage(roomId, userId, message.trim());
                const msg = {
                    id: result.insertId,
                    room_id: roomId,
                    user_id: userId,
                    username,
                    message: message.trim(),
                    created_at: new Date().toISOString()
                };
                // Broadcaster à tous dans le salon (expéditeur inclus)
                io.to(`room:${roomId}`).emit('chat:message', msg);
            } catch (err) {
                socket.emit('chat:error', { error: err.message || 'Erreur envoi message' });
            }
        });

        // Déconnexion: mettre à jour last_seen
        socket.on('disconnect', () => {
            Friend.updateLastSeen(userId).catch(console.error);
            // Cancel any active matchmaking search
            matchmakingService.cancelSearch(userId);
        });

        // Matchmaking: player joins queue
        socket.on('matchmaking:start', async ({ mode }) => {
            try {
                matchmakingService.joinQueue(userId, username, socket.id, mode);
                const queueSize = matchmakingService.getQueueSize(mode);
                socket.emit('matchmaking:joined', { mode, queueSize });
                if (queueSize >= 2) {
                    await createMatch(matchmakingService.takePlayers(mode, 2), mode);
                    return;
                }
                matchmakingService.scheduleSolo(userId, mode, 30000, async (player) => {
                    try {
                        await createMatch([player], mode);
                    } catch (error) {
                        io.sockets.sockets.get(player.socketId)?.emit('matchmaking:error', { error: error.message });
                    }
                });
            } catch (err) {
                matchmakingService.cancelSearch(userId);
                socket.emit('matchmaking:error', { error: err.message });
            }
        });

        // Matchmaking: player cancels search
        socket.on('matchmaking:cancel', () => {
            const canceled = matchmakingService.cancelSearch(userId);
            socket.emit('matchmaking:canceled', { canceled });
        });
    });
}
