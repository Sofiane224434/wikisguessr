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
        await this.ensureTable();
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

    async ensureInvitationsTable() {
        await this.ensureMembersTable();
        await query(`
CREATE TABLE IF NOT EXISTS game_room_invitations (
    id INT NOT NULL AUTO_INCREMENT,
    room_id INT NOT NULL,
    inviter_id INT NOT NULL,
    invitee_id INT NOT NULL,
    status ENUM('pending','accepted','declined') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_room_invitations_invitee_status (invitee_id, status),
    CONSTRAINT fk_room_invitations_room FOREIGN KEY (room_id) REFERENCES game_rooms(id) ON DELETE CASCADE,
    CONSTRAINT fk_room_invitations_inviter FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_room_invitations_invitee FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE
)
`, []);
    },

    // Créer ou récupérer le salon personnel d'un utilisateur
    async getOrCreate(userId) {
        await this.ensureMembersTable();
        try {
            const memberships = await query(`
SELECT gr.*, u.username AS owner_username
FROM game_room_members grm
JOIN game_rooms gr ON gr.id = grm.room_id
JOIN users u ON u.id = gr.owner_id
WHERE grm.user_id = ?
ORDER BY grm.joined_at DESC
LIMIT 1
`, [userId]);
            if (memberships.length > 0) {
                return memberships[0];
            }

            // Chercher le salon existant
            const checkSql = `
SELECT gr.*, u.username AS owner_username
FROM game_rooms gr
JOIN users u ON u.id = gr.owner_id
WHERE gr.owner_id = ?
`;
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

            const previousMemberships = await query(
                'SELECT room_id FROM game_room_members WHERE user_id = ? AND room_id != ?',
                [userId, room.id]
            );
            await query('DELETE FROM game_room_members WHERE user_id = ?', [userId]);
            const joinSql = 'INSERT IGNORE INTO game_room_members (room_id, user_id) VALUES (?, ?)';
            await query(joinSql, [room.id, userId]);

            return { ...room, leftRoomIds: previousMemberships.map(({ room_id: previousRoomId }) => previousRoomId) };
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
SELECT u.id, u.username, u.avatar_url, gr.created_at AS joined_at
FROM game_rooms gr
JOIN users u ON u.id = gr.owner_id
WHERE gr.id = ?
UNION ALL
SELECT u.id, u.username, u.avatar_url, grm.joined_at
FROM game_room_members grm
JOIN users u ON u.id = grm.user_id
WHERE grm.room_id = ?
ORDER BY joined_at ASC
`;
            return await query(sql, [roomId, roomId]);
        } catch (error) {
            console.error('[GameRoom] getMembers error:', error);
            throw error;
        }
    },

    async getById(roomId) {
        await this.ensureTable();
        const rooms = await query(`
SELECT gr.id, gr.code, gr.owner_id, u.username AS owner_username, gr.created_at
FROM game_rooms gr
JOIN users u ON u.id = gr.owner_id
WHERE gr.id = ?
LIMIT 1
`, [roomId]);
        return rooms[0] || null;
    },

    async isParticipant(roomId, userId) {
        const rows = await query(`
SELECT 1 FROM game_rooms WHERE id = ? AND owner_id = ?
UNION ALL
SELECT 1 FROM game_room_members WHERE room_id = ? AND user_id = ?
LIMIT 1
`, [roomId, userId, roomId, userId]);
        return rows.length > 0;
    },

    async createInvitation(roomId, inviterId, inviteeId) {
        await this.ensureInvitationsTable();
        if (!(await this.isParticipant(roomId, inviterId))) {
            throw { status: 403, message: 'Vous ne faites pas partie de ce salon' };
        }
        if (await this.isParticipant(roomId, inviteeId)) {
            throw { status: 409, message: 'Cet ami est déjà dans le salon' };
        }
        const existing = await query(`
SELECT id FROM game_room_invitations
WHERE room_id = ? AND invitee_id = ? AND status = 'pending'
LIMIT 1
`, [roomId, inviteeId]);
        if (existing.length > 0) {
            throw { status: 409, message: 'Une invitation est déjà en attente' };
        }
        const result = await query(
            'INSERT INTO game_room_invitations (room_id, inviter_id, invitee_id) VALUES (?, ?, ?)',
            [roomId, inviterId, inviteeId]
        );
        return result.insertId;
    },

    async getInvitations(userId) {
        await this.ensureInvitationsTable();
        return query(`
SELECT gri.id, gri.room_id, gri.created_at, gr.code, u.username AS inviter_username
FROM game_room_invitations gri
JOIN game_rooms gr ON gr.id = gri.room_id
JOIN users u ON u.id = gri.inviter_id
WHERE gri.invitee_id = ? AND gri.status = 'pending'
ORDER BY gri.created_at DESC
`, [userId]);
    },

    async respondToInvitation(userId, invitationId, accept) {
        await this.ensureInvitationsTable();
        const invitations = await query(`
SELECT id, room_id FROM game_room_invitations
WHERE id = ? AND invitee_id = ? AND status = 'pending'
LIMIT 1
`, [invitationId, userId]);
        const invitation = invitations[0];
        if (!invitation) {
            throw { status: 404, message: 'Invitation introuvable' };
        }
        await query(
            "UPDATE game_room_invitations SET status = ?, responded_at = NOW() WHERE id = ?",
            [accept ? 'accepted' : 'declined', invitationId]
        );
        if (accept) {
            const previousMemberships = await query(
                'SELECT room_id FROM game_room_members WHERE user_id = ? AND room_id != ?',
                [userId, invitation.room_id]
            );
            await query('DELETE FROM game_room_members WHERE user_id = ?', [userId]);
            await query(
                'INSERT IGNORE INTO game_room_members (room_id, user_id) VALUES (?, ?)',
                [invitation.room_id, userId]
            );
            return {
                accepted: true,
                roomId: invitation.room_id,
                leftRoomIds: previousMemberships.map(({ room_id: previousRoomId }) => previousRoomId)
            };
        }
        return { accepted: false, roomId: invitation.room_id, leftRoomIds: [] };
    },

    async leave(userId, roomId) {
        try {
            // Vérifier que ce n'est pas le propriétaire
            const roomSql = 'SELECT owner_id FROM game_rooms WHERE id = ?';
            const rooms = await query(roomSql, [roomId]);

            if (!rooms || rooms.length === 0) {
                throw { status: 404, message: 'Salon introuvable' };
            }

            if (rooms[0].owner_id === userId) {
                await query('DELETE FROM game_rooms WHERE id = ?', [roomId]);
                return { closed: true };
            }

            const deleteSql = 'DELETE FROM game_room_members WHERE room_id = ? AND user_id = ?';
            await query(deleteSql, [roomId, userId]);
            return { closed: false };
        } catch (error) {
            console.error('[GameRoom] leave error:', error);
            throw error;
        }
    }
};

export default GameRoom;
