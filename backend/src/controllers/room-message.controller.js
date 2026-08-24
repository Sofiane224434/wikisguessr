import RoomMessage from '../models/room-message.model.js';
import GameRoom from '../models/game-room.model.js';

export const sendMessage = async (req, res) => {
    try {
        const { roomId, message } = req.body;

        if (!roomId) {
            return res.status(400).json({ error: 'ID du salon requis' });
        }

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message vide' });
        }

        const msg = await RoomMessage.sendMessage(roomId, req.user.id, message);

        return res.json({
            ok: true,
            message: msg
        });
    } catch (error) {
        console.error('sendMessage error:', error);
        if (error.status === 400) {
            return res.status(400).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Impossible d\'envoyer le message' });
    }
};

export const getMessages = async (req, res) => {
    try {
        const { roomId } = req.query;
        const limit = req.query.limit || 50;

        if (!roomId) {
            return res.status(400).json({ error: 'ID du salon requis' });
        }

        const messages = await RoomMessage.getMessages(roomId, limit);

        return res.json({
            messages: messages || []
        });
    } catch (error) {
        console.error('getMessages error:', error);
        return res.status(500).json({ error: 'Impossible de récupérer les messages' });
    }
};

export const getNewMessages = async (req, res) => {
    try {
        const { roomId, since } = req.query;

        if (!roomId) {
            return res.status(400).json({ error: 'ID du salon requis' });
        }

        if (!since) {
            return res.status(400).json({ error: 'Date requise' });
        }

        const messages = await RoomMessage.getNewMessages(roomId, since);

        return res.json({
            messages: messages || []
        });
    } catch (error) {
        console.error('getNewMessages error:', error);
        return res.status(500).json({ error: 'Impossible de récupérer les nouveaux messages' });
    }
};
