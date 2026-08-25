// models/user.model.js
import { query } from '../config/db.js'; // Extension .js obligatoire ! ⬅️
import bcrypt from 'bcrypt';
const User = {
    // Trouver par username
    async findByUsername(username) {
        const sql = 'SELECT * FROM users WHERE username = ?';
        const results = await query(sql, [username]);
        return results[0] || null;
    },

    // Trouver par email
    async findByEmail(email) {
        const sql = 'SELECT * FROM users WHERE email = ?';
        const results = await query(sql, [email.toLowerCase()]);
        return results[0] || null;
    },

    // Trouver par email ou username (login)
    async findByEmailOrUsername(identifier) {
        const normalizedIdentifier = String(identifier || '').trim();
        const sql = 'SELECT * FROM users WHERE email = ? OR username = ? LIMIT 1';
        const results = await query(sql, [normalizedIdentifier.toLowerCase(), normalizedIdentifier]);
        return results[0] || null;
    },

    async findByVerificationToken(token) {
        const sql = `
SELECT id, username, email, role, email_verified, email_verification_expires_at
FROM users
WHERE email_verification_token = ?
LIMIT 1
`;
        const results = await query(sql, [token]);
        return results[0] || null;
    },

    async findByPasswordResetToken(token) {
        const sql = `
SELECT id, username, email, password_reset_expires_at
FROM users
WHERE password_reset_token = ?
LIMIT 1
`;
        const results = await query(sql, [token]);
        return results[0] || null;
    },

    // Trouver par ID (sans le password)
    async findById(id) {
        const sql = 'SELECT id, username, username_changed_at, email, role, subscription_tier, subscription_expires_at, avatar_url, email_verified, created_at FROM users WHERE id = ?';
        const results = await query(sql, [id]);
        return results[0] || null;
    },

    async findPrivateById(id) {
        const sql = 'SELECT * FROM users WHERE id = ?';
        const results = await query(sql, [id]);
        return results[0] || null;
    },

    async listForAdmin() {
        const sql = `
SELECT id, username, email, role, email_verified, subscription_tier,
       subscription_expires_at, banned_at, created_at
FROM users
ORDER BY created_at DESC, id DESC
`;
        return query(sql);
    },

    async setSubscriptionByAdmin(id, tier) {
        const expiresAtExpression = tier === 'free' ? 'NULL' : 'DATE_ADD(NOW(), INTERVAL 1 MONTH)';
        await query(`
UPDATE users
SET subscription_tier = ?, subscription_expires_at = ${expiresAtExpression}
WHERE id = ? AND role <> 'admin'
`, [tier, id]);
        return this.findById(id);
    },

    async setUserRole(id, role) {
        await query('UPDATE users SET role = ? WHERE id = ?', [role, id]);
        return this.findById(id);
    },

    // Créer un utilisateur
    async create({ username, email, password, role = 'user', emailVerified = 0, verificationToken = null, verificationExpiresAt = null }) {
        const hashedPassword = await bcrypt.hash(password, 10);
        const sql = `
INSERT INTO users (username, email, email_verified, email_verification_token, email_verification_expires_at, role, password)
VALUES (?, ?, ?, ?, ?, ?, ?)
`;
        const result = await query(sql, [
            username,
            email.toLowerCase(),
            emailVerified,
            verificationToken,
            verificationExpiresAt,
            role,
            hashedPassword
        ]);
        return {
            id: result.insertId,
            username,
            email: email.toLowerCase(),
            role,
            email_verified: Boolean(emailVerified)
        };
    },

    async markEmailVerified(id) {
        const sql = `
UPDATE users
SET email_verified = 1,
    email_verification_token = NULL,
    email_verification_expires_at = NULL
WHERE id = ?
`;
        await query(sql, [id]);
    },

    async deleteById(id) {
        const sql = 'DELETE FROM users WHERE id = ?';
        await query(sql, [id]);
    },

    async setPasswordResetToken(id, token, expiresAt) {
        const sql = `
UPDATE users
SET password_reset_token = ?,
    password_reset_expires_at = ?
WHERE id = ?
`;
        await query(sql, [token, expiresAt, id]);
    },

    async updatePassword(id, plainPassword) {
        const hashedPassword = await bcrypt.hash(plainPassword, 10);
        const sql = `
UPDATE users
SET password = ?,
    password_reset_token = NULL,
    password_reset_expires_at = NULL
WHERE id = ?
`;
        await query(sql, [hashedPassword, id]);
    },

    async updateProfile(id, { username, email, plainPassword }) {
        const assignments = [];
        const values = [];

        if (username !== undefined) {
            assignments.push('username = ?', 'username_changed_at = NOW()');
            values.push(username);
        }
        if (email !== undefined) {
            assignments.push('email = ?');
            values.push(email);
        }
        if (plainPassword !== undefined) {
            assignments.push('password = ?');
            values.push(await bcrypt.hash(plainPassword, 10));
        }

        values.push(id);
        await query(`UPDATE users SET ${assignments.join(', ')} WHERE id = ?`, values);
        return this.findById(id);
    },

    async updateAvatar(id, avatarUrl) {
        await query('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, id]);
        return this.findById(id);
    },

    // Vérifier le mot de passe
    async verifyPassword(plainPassword, hashedPassword) {
        return bcrypt.compare(plainPassword, hashedPassword);
    }
};
export default User;