import jwt from 'jsonwebtoken';
import { query } from './config/db.js';
import RoomMessage from './models/room-message.model.js';
import Friend from './models/friend.model.js';

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
        });
    });
}
