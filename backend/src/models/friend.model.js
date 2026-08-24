import pool, { query } from '../config/db.js';

const Friend = {
    async ensureTable() {
        const sql = `
CREATE TABLE IF NOT EXISTS friendships (
    id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    friend_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_friendships (user_id, friend_id),
    KEY idx_friendships_user (user_id),
    KEY idx_friendships_friend (friend_id),
    CONSTRAINT fk_friendships_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_friendships_friend FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_friendships_different CHECK (user_id != friend_id)
)
`;
        await query(sql, []);
    },

    async ensureRequestsTable() {
        await this.ensureTable();
        await query(`
CREATE TABLE IF NOT EXISTS friend_requests (
    id INT NOT NULL AUTO_INCREMENT,
    sender_id INT NOT NULL,
    recipient_id INT NOT NULL,
    status ENUM('pending','accepted','declined') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_friend_requests_recipient_status (recipient_id, status),
    KEY idx_friend_requests_sender_status (sender_id, status),
    CONSTRAINT fk_friend_requests_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_friend_requests_recipient FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_friend_requests_different CHECK (sender_id != recipient_id)
)
`, []);
    },

    async sendRequest(userId, friendIdentifier) {
        await this.ensureRequestsTable();
        try {
            const findSql = 'SELECT id, username FROM users WHERE username = ? OR email = ? LIMIT 1';
            const users = await query(findSql, [friendIdentifier, friendIdentifier]);

            if (!users || users.length === 0) {
                throw { status: 404, message: 'Utilisateur non trouvé' };
            }

            const friend = users[0];

            if (friend.id === userId) {
                throw { status: 400, message: 'Vous ne pouvez pas vous ajouter vous-même' };
            }

            if (await this.areFriends(userId, friend.id)) {
                throw { status: 409, message: 'Vous êtes déjà amis' };
            }

            const pending = await query(`
SELECT id FROM friend_requests
WHERE status = 'pending'
  AND ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?))
LIMIT 1
`, [userId, friend.id, friend.id, userId]);

            if (pending.length > 0) {
                throw { status: 409, message: 'Une demande est déjà en attente' };
            }

            const result = await query(
                'INSERT INTO friend_requests (sender_id, recipient_id) VALUES (?, ?)',
                [userId, friend.id]
            );

            return {
                id: result.insertId,
                recipient_id: friend.id,
                username: friend.username
            };
        } catch (error) {
            console.error('[Friend] addFriend error:', error);
            throw error;
        }
    },

    async getIncomingRequests(userId) {
        await this.ensureRequestsTable();
        return query(`
SELECT fr.id, fr.sender_id, fr.created_at, u.username, u.avatar_url
FROM friend_requests fr
JOIN users u ON u.id = fr.sender_id
WHERE fr.recipient_id = ? AND fr.status = 'pending'
ORDER BY fr.created_at DESC
`, [userId]);
    },

    async respondToRequest(userId, requestId, accept) {
        await this.ensureRequestsTable();
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const [requests] = await connection.execute(`
SELECT id, sender_id, recipient_id
FROM friend_requests
WHERE id = ? AND recipient_id = ? AND status = 'pending'
FOR UPDATE
`, [requestId, userId]);
            const request = requests[0];
            if (!request) {
                throw { status: 404, message: 'Demande introuvable' };
            }

            await connection.execute(
                "UPDATE friend_requests SET status = ?, responded_at = NOW() WHERE id = ?",
                [accept ? 'accepted' : 'declined', requestId]
            );

            if (accept) {
                await connection.execute(
                    'INSERT IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?), (?, ?)',
                    [request.sender_id, request.recipient_id, request.recipient_id, request.sender_id]
                );
            }

            await connection.commit();
            return { accepted: accept, friendId: request.sender_id };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    },

    // Récupérer la liste des amis
    async getFriends(userId) {
        await this.ensureTable();
        try {
            const sql = `
SELECT u.id, u.username, u.avatar_url
FROM friendships f
JOIN users u ON u.id = f.friend_id
WHERE f.user_id = ?
ORDER BY f.created_at DESC
`;
            return await query(sql, [userId]);
        } catch (error) {
            console.error('[Friend] getFriends error:', error);
            throw error;
        }
    },

    // Supprimer un ami
    async removeFriend(userId, friendId) {
        try {
            const sql = 'DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)';
            await query(sql, [userId, friendId, friendId, userId]);
        } catch (error) {
            console.error('[Friend] removeFriend error:', error);
            throw error;
        }
    },

    // Vérifier si deux utilisateurs sont amis
    async areFriends(userId1, userId2) {
        try {
            const sql = 'SELECT id FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)';
            const result = await query(sql, [userId1, userId2, userId2, userId1]);
            return result && result.length > 0;
        } catch (error) {
            console.error('[Friend] areFriends error:', error);
            return false;
        }
    },

    // Récupérer amis avec leur statut de connexion (5 minutes = online)
    async getFriendsWithStatus(userId) {
        await this.ensureTable();
        try {
            const sql = `
SELECT u.id, u.username, u.avatar_url, u.last_seen,
       IF(u.last_seen IS NOT NULL AND u.last_seen > DATE_SUB(NOW(), INTERVAL 5 MINUTE), 1, 0) as is_online
FROM friendships f
JOIN users u ON u.id = f.friend_id
WHERE f.user_id = ?
ORDER BY is_online DESC, f.created_at DESC
`;
            return await query(sql, [userId]);
        } catch (error) {
            console.error('[Friend] getFriendsWithStatus error:', error);
            throw error;
        }
    },

    // Mettre à jour last_seen pour un utilisateur
    async updateLastSeen(userId) {
        try {
            const sql = 'UPDATE users SET last_seen = NOW() WHERE id = ?';
            await query(sql, [userId]);
        } catch (error) {
            console.error('[Friend] updateLastSeen error:', error);
            throw error;
        }
    }
};

export default Friend;
