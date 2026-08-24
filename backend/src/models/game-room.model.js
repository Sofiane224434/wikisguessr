import crypto from 'crypto';
import { query } from '../config/db.js';

const generateCode = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(6);
    let code = '';

    for (let i = 0; i < bytes.length; i += 1) {
        code += alphabet[bytes[i] % alphabet.length];
    }

    return code;
};

const GameRoom = {
    async ensureTable() {
        const sql = `
CREATE TABLE IF NOT EXISTS game_rooms (
    id INT NOT NULL AUTO_INCREMENT,
    code VARCHAR(12) NOT NULL,
    owner_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_game_rooms_owner (owner_id),
    UNIQUE KEY uniq_game_rooms_code (code),
    KEY idx_game_rooms_owner (owner_id),
    CONSTRAINT fk_game_rooms_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
)
`;
        await query(sql, []);
    },

    async ensureMembersTable() {
        const sql = `
CREATE TABLE IF NOT EXISTS game_room_members (
    id INT NOT NULL AUTO_INCREMENT,
    room_id INT NOT NULL,
    user_id INT NOT NULL,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_game_room_members (room_id, user_id),
    KEY idx_game_room_members_room (room_id),
    KEY idx_game_room_members_user (user_id),
    CONSTRAINT fk_game_room_members_room FOREIGN KEY (room_id) REFERENCES game_rooms(id) ON DELETE CASCADE,
    CONSTRAINT fk_game_room_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
`;
        await query(sql, []);
    },

    // Créer ou récupérer le salon personnel d'un utilisateur
    async getOrCreate(userId) {
        await this.ensureTable();
        try {
            // Chercher le salon existant
            const checkSql = 'SELECT * FROM game_rooms WHERE owner_id = ?';
            const existing = await query(checkSql, [userId]);

            if (existing && existing.length > 0) {
                return existing[0];
            }

            // Créer un nouveau salon
            const code = generateCode();
            const createSql = 'INSERT INTO game_rooms (code, owner_id) VALUES (?, ?)';
            await query(createSql, [code, userId]);

            // Récupérer et retourner
            const newRoom = await query(checkSql, [userId]);
            return newRoom[0];
        } catch (error) {
            console.error('[GameRoom] getOrCreate error:', error);
            throw error;
        }
    },

    // Rejoindre un salon via code
    async joinByCode(userId, roomCode) {
        await this.ensureMembersTable();
        try {
            // Chercher le salon avec ce code
            const roomSql = 'SELECT * FROM game_rooms WHERE code = ?';
            const rooms = await query(roomSql, [roomCode]);

            if (!rooms || rooms.length === 0) {
                throw { status: 404, message: 'Salon non trouvé' };
            }

            const room = rooms[0];

            // Ne pas permettre de rejoindre son propre salon
            if (room.owner_id === userId) {
                throw { status: 400, message: 'Vous êtes déjà dans ce salon' };
            }

            // Ajouter le membre
            const joinSql = 'INSERT IGNORE INTO game_room_members (room_id, user_id) VALUES (?, ?)';
            await query(joinSql, [room.id, userId]);

            return room;
        } catch (error) {
            console.error('[GameRoom] joinByCode error:', error);
            throw error;
        }
    },

    // Récupérer un salon par code
    async getByCode(roomCode) {
        await this.ensureTable();
        try {
            const sql = `
SELECT gr.id, gr.code, gr.owner_id, u.username as owner_username, gr.created_at
FROM game_rooms gr
JOIN users u ON u.id = gr.owner_id
WHERE gr.code = ?
`;
            const rooms = await query(sql, [roomCode]);
            return rooms && rooms.length > 0 ? rooms[0] : null;
        } catch (error) {
            console.error('[GameRoom] getByCode error:', error);
            throw error;
        }
    },

    // Récupérer tous les membres d'un salon
    async getMembers(roomId) {
        await this.ensureMembersTable();
        try {
            const sql = `
SELECT u.id, u.username, u.avatar_url
FROM game_room_members grm
JOIN users u ON u.id = grm.user_id
WHERE grm.room_id = ?
ORDER BY grm.joined_at ASC
`;
            return await query(sql, [roomId]);
        } catch (error) {
            console.error('[GameRoom] getMembers error:', error);
            throw error;
        }
    },

    // Quitter un salon (sauf si c'est le propriétaire)
    async leave(userId, roomId) {
        try {
            // Vérifier que ce n'est pas le propriétaire
            const roomSql = 'SELECT owner_id FROM game_rooms WHERE id = ?';
            const rooms = await query(roomSql, [roomId]);

            if (rooms && rooms.length > 0 && rooms[0].owner_id === userId) {
                throw { status: 400, message: 'Le propriétaire ne peut pas quitter son salon' };
            }

            const deleteSql = 'DELETE FROM game_room_members WHERE room_id = ? AND user_id = ?';
            await query(deleteSql, [roomId, userId]);
        } catch (error) {
            console.error('[GameRoom] leave error:', error);
            throw error;
        }
    }
};

export default GameRoom;
