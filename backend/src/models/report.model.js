import { query } from '../config/db.js';

const Report = {
    // Créer un signalement
    async create(reporterId, reportedUserId, message, imageData = null) {
        // Valider le message
        if (!message || !message.trim()) {
            throw { status: 400, message: 'Un message est requis' };
        }
        if (message.trim().length > 1000) {
            throw { status: 400, message: 'Le message ne doit pas dépasser 1000 caractères' };
        }
        // Limiter la taille de l'image base64 (~5 Mo décodé)
        if (imageData && imageData.length > 7 * 1024 * 1024) {
            throw { status: 400, message: 'L\'image est trop volumineuse (max 5 Mo)' };
        }

        const sql = `
INSERT INTO reports (reporter_id, reported_user_id, message, image_data)
VALUES (?, ?, ?, ?)
`;
        const result = await query(sql, [reporterId, reportedUserId, message.trim(), imageData || null]);
        return { id: result.insertId };
    },

    // Récupérer tous les signalements (admin)
    async getAll({ status = null, limit = 50, offset = 0 } = {}) {
        const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 50));
        const safeOffset = Math.max(0, Number.parseInt(offset, 10) || 0);
        let sql = `
SELECT r.id, r.message, r.status, r.admin_note, r.created_at, r.reviewed_at,
       r.image_data IS NOT NULL as has_image,
       rep.id as reporter_id, rep.username as reporter_username,
       rep2.id as reported_user_id, rep2.username as reported_username
FROM reports r
JOIN users rep ON rep.id = r.reporter_id
JOIN users rep2 ON rep2.id = r.reported_user_id
`;
        const params = [];
        if (status) {
            sql += ' WHERE r.status = ?';
            params.push(status);
        }
        sql += ` ORDER BY r.created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;
        return await query(sql, params);
    },

    // Récupérer un signalement avec son image (admin)
    async getById(id) {
        const sql = `
SELECT r.id, r.message, r.image_data, r.status, r.admin_note, r.created_at, r.reviewed_at,
       rep.id as reporter_id, rep.username as reporter_username,
       rep2.id as reported_user_id, rep2.username as reported_username
FROM reports r
JOIN users rep ON rep.id = r.reporter_id
JOIN users rep2 ON rep2.id = r.reported_user_id
WHERE r.id = ?
LIMIT 1
`;
        const rows = await query(sql, [id]);
        return rows[0] || null;
    },

    // Mettre à jour le statut (admin)
    async updateStatus(id, status, adminNote = null) {
        const allowed = ['pending', 'reviewed', 'dismissed'];
        if (!allowed.includes(status)) {
            throw { status: 400, message: 'Statut invalide' };
        }
        const sql = `
UPDATE reports SET status = ?, admin_note = ?, reviewed_at = NOW()
WHERE id = ?
`;
        await query(sql, [status, adminNote || null, id]);
    },

    // Compter les signalements en attente
    async countPending() {
        const rows = await query('SELECT COUNT(*) as count FROM reports WHERE status = ?', ['pending']);
        return rows[0]?.count || 0;
    }
};

export default Report;
