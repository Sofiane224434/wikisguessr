import { query } from '../config/db.js';

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

    // Ajouter un ami par identifiant (username ou email)
    async addFriend(userId, friendIdentifier) {
        await this.ensureTable();
        try {
            // Chercher l'utilisateur par username ou email
            const findSql = 'SELECT id, username FROM users WHERE username = ? OR email = ? LIMIT 1';
            const users = await query(findSql, [friendIdentifier, friendIdentifier]);

            if (!users || users.length === 0) {
                throw { status: 404, message: 'Utilisateur non trouvé' };
            }

            const friend = users[0];

            // Ne pas pouvoir s'ajouter soi-même
            if (friend.id === userId) {
                throw { status: 400, message: 'Vous ne pouvez pas vous ajouter vous-même' };
            }

            // Ajouter l'amitié (unidirectionnelle pour l'instant)
            const addSql = 'INSERT IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?)';
            await query(addSql, [userId, friend.id]);

            return {
                id: friend.id,
                username: friend.username
            };
        } catch (error) {
            console.error('[Friend] addFriend error:', error);
            throw error;
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
            const sql = 'DELETE FROM friendships WHERE user_id = ? AND friend_id = ?';
            await query(sql, [userId, friendId]);
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
