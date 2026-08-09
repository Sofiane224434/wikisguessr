import jwt from 'jsonwebtoken';
import { query } from './config/db.js';
import RoomMessage from './models/room-message.model.js';
import Friend from './models/friend.model.js';
import matchmakingService from './services/matchmaking.service.js';

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

    // Matchmaking timer: process queues every 30 seconds
    const MATCHMAKING_INTERVAL = 30000;
    setInterval(() => {
        const modes = ['normal', 'chrono', 'knowledge'];
        
        modes.forEach(mode => {
            const queueSize = matchmakingService.getQueueSize(mode);
            if (queueSize > 0) {
                console.log(`[Matchmaking] Processing ${mode} queue with ${queueSize} players`);
                
                matchmakingService.startMatchmakingTimeout(mode, MATCHMAKING_INTERVAL, (result) => {
                    const { match, queuePlayers } = result;

                    if (!match) {
                        // No one in queue, send solo notification
                        queuePlayers.forEach(player => {
                            const socket = io.sockets.sockets.get(player.socketId);
                            if (socket) {
                                socket.emit('matchmaking:solo-fallback', {
                                    message: 'Aucun adversaire trouvé. Vous avez été déplacé en mode solo.'
                                });
                            }
                        });
                    } else {
                        // Found players, notify them
                        const { realPlayers, botCount } = match;
                        const notifyData = {
                            players: realPlayers.map(p => ({ userId: p.userId, username: p.username })),
                            botCount,
                            totalPlayers: realPlayers.length + botCount
                        };

                        realPlayers.forEach(player => {
                            const socket = io.sockets.sockets.get(player.socketId);
                            if (socket) {
                                socket.emit('matchmaking:found', notifyData);
                            }
                        });

                        console.log(`[Matchmaking] ${mode}: matched ${realPlayers.length} players + ${botCount} bots`);
                    }
                });
            }
        });
    }, MATCHMAKING_INTERVAL);

    io.on('connection', (socket) => {
        const { id: userId, username } = socket.user;

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
        socket.on('matchmaking:start', ({ mode }) => {
            try {
                matchmakingService.joinQueue(userId, username, socket.id, mode);
                const queueSize = matchmakingService.getQueueSize(mode);
                socket.emit('matchmaking:joined', { mode, queueSize });
            } catch (err) {
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
