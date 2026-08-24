import jwt from 'jsonwebtoken';
import { query } from './config/db.js';
import RoomMessage from './models/room-message.model.js';
import Friend from './models/friend.model.js';
import matchmakingService from './services/matchmaking.service.js';
import { createSharedGame } from './controllers/game.controller.js';
import GameRoom from './models/game-room.model.js';
import Game from './models/game.model.js';

export function setupSocket(io) {
    const matchmakingTarget = 8;

    // Middleware d'authentification JWT
    io.use(async (socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('Non autorisé'));
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const rows = await query('SELECT username, avatar_url FROM users WHERE id = ? LIMIT 1', [decoded.id]);
            decoded.username = rows?.[0]?.username || decoded.username || 'Inconnu';
            decoded.avatarUrl = rows?.[0]?.avatar_url || null;
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
            players: players.map(({ userId: playerId, username: playerUsername, avatarUrl }) => ({
                userId: playerId,
                username: playerUsername,
                avatar_url: avatarUrl
            }))
        };
        players.forEach(({ socketId }) => io.sockets.sockets.get(socketId)?.emit('matchmaking:found', payload));
    };

    const emitQueueState = (mode) => {
        const queuedPlayers = matchmakingService.getQueuePlayers(mode);
        const players = queuedPlayers.map(({ userId: playerId, username: playerUsername, avatarUrl }) => ({
            userId: playerId,
            username: playerUsername,
            avatar_url: avatarUrl
        }));
        queuedPlayers.forEach(({ socketId }) => {
            io.sockets.sockets.get(socketId)?.emit('matchmaking:updated', {
                mode,
                queueSize: players.length,
                targetSize: matchmakingTarget,
                players
            });
        });
    };

    const createQueuedMatch = async (mode) => {
        const players = matchmakingService.takePlayers(mode, matchmakingTarget);
        try {
            await createMatch(players, mode);
        } catch (error) {
            players.forEach(({ socketId }) => {
                io.sockets.sockets.get(socketId)?.emit('matchmaking:error', { error: error.message });
            });
            error.matchmakingNotified = true;
            throw error;
        }
    };

    io.on('connection', (socket) => {
        const { id: userId, username, avatarUrl } = socket.user;
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

        socket.on('game:join', async (rawCode) => {
            try {
                const code = String(rawCode || '').trim().toUpperCase();
                const game = await Game.findByCode(code);
                if (!game || !(await Game.isParticipant(game.id, userId))) {
                    throw new Error('Partie inaccessible');
                }
                socket.join(`game:${code}`);
                socket.emit('game:participants', {
                    code,
                    participants: await Game.getParticipants(game.id)
                });
            } catch (error) {
                socket.emit('game:error', { error: error.message });
            }
        });

        socket.on('game:leave', (rawCode) => {
            const code = String(rawCode || '').trim().toUpperCase();
            if (code) socket.leave(`game:${code}`);
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
            const search = matchmakingService.cancelSearch(userId);
            if (search?.mode) emitQueueState(search.mode);
        });

        // Matchmaking: player joins queue
        socket.on('matchmaking:start', async ({ mode }) => {
            try {
                matchmakingService.joinQueue(userId, username, avatarUrl, socket.id, mode);
                const queueSize = matchmakingService.getQueueSize(mode);
                emitQueueState(mode);
                if (queueSize >= matchmakingTarget) {
                    await createQueuedMatch(mode);
                    return;
                }
            } catch (err) {
                matchmakingService.cancelSearch(userId);
                if (!err.matchmakingNotified) {
                    socket.emit('matchmaking:error', { error: err.message });
                }
            }
        });

        socket.on('matchmaking:start-now', async ({ mode }) => {
            try {
                const queuedPlayers = matchmakingService.getQueuePlayers(mode);
                if (!queuedPlayers.some((player) => Number(player.userId) === Number(userId))) {
                    throw new Error('Recherche de partie introuvable');
                }
                await createQueuedMatch(mode);
            } catch (err) {
                if (!err.matchmakingNotified) {
                    socket.emit('matchmaking:error', { error: err.message });
                }
            }
        });

        // Matchmaking: player cancels search
        socket.on('matchmaking:cancel', () => {
            const canceled = matchmakingService.cancelSearch(userId);
            if (canceled?.mode) emitQueueState(canceled.mode);
            socket.emit('matchmaking:canceled', { canceled: Boolean(canceled) });
        });
    });
}
