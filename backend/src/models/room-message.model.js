import { query } from '../config/db.js';

const RoomMessage = {
    async ensureTable() {
        const sql = `
CREATE TABLE IF NOT EXISTS room_messages (
    id INT NOT NULL AUTO_INCREMENT,
    room_id INT NOT NULL,
    user_id INT NOT NULL,
    message VARCHAR(500) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_room_messages_room (room_id),
    KEY idx_room_messages_user (user_id),
    KEY idx_room_messages_created (created_at),
    CONSTRAINT fk_room_messages_room FOREIGN KEY (room_id) REFERENCES game_rooms(id) ON DELETE CASCADE,
    CONSTRAINT fk_room_messages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
`;
        await query(sql, []);
    },

    // Envoyer un message
    async sendMessage(roomId, userId, message) {
        await this.ensureTable();
        try {
            // Valider le message
            if (!message || !message.trim()) {
                throw { status: 400, message: 'Le message ne peut pas être vide' };
            }

            if (message.trim().length > 500) {
                throw { status: 400, message: 'Le message est trop long (max 500 caractères)' };
            }

            const sql = 'INSERT INTO room_messages (room_id, user_id, message) VALUES (?, ?, ?)';
            const result = await query(sql, [roomId, userId, message.trim()]);

            return {
                id: result.insertId,
                room_id: roomId,
                user_id: userId,
                message: message.trim(),
                created_at: new Date().toISOString()
            };
        } catch (error) {
            console.error('[RoomMessage] sendMessage error:', error);
            throw error;
        }
    },

    // Récupérer les messages d'une room (avec limite pour les performances)
    async getMessages(roomId, limit = 50) {
        await this.ensureTable();
        try {
            const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 50));
            const sql = `
SELECT rm.id, rm.room_id, rm.user_id, rm.message, rm.created_at, u.username
FROM room_messages rm
JOIN users u ON u.id = rm.user_id
WHERE rm.room_id = ?
ORDER BY rm.created_at DESC
LIMIT ${limitNum}
`;
            const messages = await query(sql, [roomId]);
            return messages ? messages.reverse() : [];
        } catch (error) {
            console.error('[RoomMessage] getMessages error:', error);
            throw error;
        }
    },

    // Récupérer les messages plus récents depuis une certaine date (pour le polling)
    async getNewMessages(roomId, since) {
        await this.ensureTable();
        try {
            const sql = `
SELECT rm.id, rm.room_id, rm.user_id, rm.message, rm.created_at, u.username
FROM room_messages rm
JOIN users u ON u.id = rm.user_id
WHERE rm.room_id = ? AND rm.created_at > ?
ORDER BY rm.created_at ASC
`;
            return await query(sql, [roomId, since]);
        } catch (error) {
            console.error('[RoomMessage] getNewMessages error:', error);
            throw error;
        }
    },

    // Supprimer les anciens messages (cleanup)
    async cleanOldMessages(daysOld = 30) {
        try {
            const sql = 'DELETE FROM room_messages WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)';
            await query(sql, [daysOld]);
        } catch (error) {
            console.error('[RoomMessage] cleanOldMessages error:', error);
            throw error;
        }
    }
};

export default RoomMessage;
