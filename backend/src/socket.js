import jwt from 'jsonwebtoken';
import { query } from './config/db.js';
import RoomMessage from './models/room-message.model.js';
import Friend from './models/friend.model.js';
import matchmakingService from './services/matchmaking.service.js';
import { createSharedGame } from './controllers/game.controller.js';
import GameRoom from './models/game-room.model.js';
import Game from './models/game.model.js';
import { normalizeWikiLanguage } from './services/wiki-language.service.js';

export function setupSocket(io) {
    const matchmakingTarget = 8;
    const replayVotes = new Map();

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

    const createMatch = async (players, mode, wikiLanguage = 'fr') => {
        const creator = players[0];
        const game = await createSharedGame({
            mode,
            creatorId: creator.userId,
            creatorUsername: creator.username,
            playerIds: players.map(({ userId: playerId }) => playerId),
            wikiLanguage
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

    const emitQueueState = (mode, wikiLanguage = 'fr') => {
        const queuedPlayers = matchmakingService.getQueuePlayers(mode, wikiLanguage);
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

    const createQueuedMatch = async (mode, wikiLanguage = 'fr') => {
        const players = matchmakingService.takePlayers(mode, matchmakingTarget, wikiLanguage);
        try {
            await createMatch(players, mode, wikiLanguage);
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

        socket.on('game:replay-ready', async (rawCode) => {
            const code = String(rawCode || '').trim().toUpperCase();
            try {
                const game = await Game.findByCode(code);
                if (!game || !game.room_id || !(await Game.isParticipant(game.id, userId))) {
                    throw new Error('Replay de groupe indisponible');
                }

                const participants = await Game.getParticipants(game.id);
                const requiredIds = participants.map(({ user_id: participantId }) => Number(participantId));
                const state = replayVotes.get(code) || { readyIds: new Set(), creating: false };
                state.readyIds.add(Number(userId));
                replayVotes.set(code, state);

                io.to(`game:${code}`).emit('game:replay-status', {
                    code,
                    readyCount: state.readyIds.size,
                    requiredCount: requiredIds.length
                });

                if (state.creating || !requiredIds.every((participantId) => state.readyIds.has(participantId))) {
                    return;
                }

                state.creating = true;
                const nextGame = await createSharedGame({
                    mode: game.mode,
                    creatorId: userId,
                    creatorUsername: username,
                    playerIds: requiredIds,
                    roomId: game.room_id,
                    wikiLanguage: game.wiki_lang
                });
                replayVotes.delete(code);
                io.to(`game:${code}`).emit('game:replay-started', { game: nextGame });
            } catch (error) {
                replayVotes.delete(code);
                socket.emit('game:replay-error', { error: error.message || 'Impossible de relancer la partie' });
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
            if (search?.mode) emitQueueState(search.mode, search.language);
        });

        // Matchmaking: player joins queue
        socket.on('matchmaking:start', async ({ mode, wikiLanguage: rawWikiLanguage }) => {
            try {
                const wikiLanguage = normalizeWikiLanguage(rawWikiLanguage);
                matchmakingService.joinQueue(userId, username, avatarUrl, socket.id, mode, wikiLanguage);
                const queueSize = matchmakingService.getQueueSize(mode, wikiLanguage);
                emitQueueState(mode, wikiLanguage);
                if (queueSize >= matchmakingTarget) {
                    await createQueuedMatch(mode, wikiLanguage);
                    return;
                }
            } catch (err) {
                matchmakingService.cancelSearch(userId);
                if (!err.matchmakingNotified) {
                    socket.emit('matchmaking:error', { error: err.message });
                }
            }
        });

        socket.on('matchmaking:start-now', async ({ mode, wikiLanguage: rawWikiLanguage }) => {
            try {
            const wikiLanguage = normalizeWikiLanguage(rawWikiLanguage);
            const queuedPlayers = matchmakingService.getQueuePlayers(mode, wikiLanguage);
                if (!queuedPlayers.some((player) => Number(player.userId) === Number(userId))) {
                    throw new Error('Recherche de partie introuvable');
                }
                await createQueuedMatch(mode, wikiLanguage);
            } catch (err) {
                if (!err.matchmakingNotified) {
                    socket.emit('matchmaking:error', { error: err.message });
                }
            }
        });

        // Matchmaking: player cancels search
        socket.on('matchmaking:cancel', () => {
            const canceled = matchmakingService.cancelSearch(userId);
            if (canceled?.mode) emitQueueState(canceled.mode, canceled.language);
            socket.emit('matchmaking:canceled', { canceled: Boolean(canceled) });
        });
    });
}
