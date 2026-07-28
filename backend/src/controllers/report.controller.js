import Report from '../models/report.model.js';
import { query } from '../config/db.js';

// POST /api/reports/send — joueur signale un autre joueur
export const sendReport = async (req, res) => {
    try {
        const { reportedUserId, message, imageData } = req.body;

        if (!reportedUserId) {
            return res.status(400).json({ error: 'Joueur signalé manquant' });
        }
        if (reportedUserId === req.user.id) {
            return res.status(400).json({ error: 'Vous ne pouvez pas vous signaler vous-même' });
        }

        // Vérifier que l'utilisateur signalé existe
        const rows = await query('SELECT id FROM users WHERE id = ?', [reportedUserId]);
        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: 'Joueur introuvable' });
        }

        const result = await Report.create(req.user.id, reportedUserId, message, imageData || null);
        return res.json({ ok: true, reportId: result.id });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ error: error.message });
        }
        console.error('[Report] sendReport error:', error);
        return res.status(500).json({ error: 'Impossible d\'envoyer le signalement' });
    }
};

// GET /api/reports — liste tous les signalements (admin)
export const getReports = async (req, res) => {
    try {
        const { status, limit = 50, offset = 0 } = req.query;
        const reports = await Report.getAll({ status, limit, offset });
        const pending = await Report.countPending();
        return res.json({ reports, pending });
    } catch (error) {
        console.error('[Report] getReports error:', error);
        return res.status(500).json({ error: 'Impossible de récupérer les signalements' });
    }
};

// GET /api/reports/:id — détail d'un signalement avec image (admin)
export const getReport = async (req, res) => {
    try {
        const report = await Report.getById(Number(req.params.id));
        if (!report) {
            return res.status(404).json({ error: 'Signalement introuvable' });
        }
        return res.json({ report });
    } catch (error) {
        console.error('[Report] getReport error:', error);
        return res.status(500).json({ error: 'Impossible de récupérer le signalement' });
    }
};

// PATCH /api/reports/:id — changer le statut (admin)
export const updateReport = async (req, res) => {
    try {
        const { status, adminNote } = req.body;
        if (!status) {
            return res.status(400).json({ error: 'Statut requis' });
        }
        await Report.updateStatus(Number(req.params.id), status, adminNote);
        return res.json({ ok: true });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ error: error.message });
        }
        console.error('[Report] updateReport error:', error);
        return res.status(500).json({ error: 'Impossible de mettre à jour le signalement' });
    }
};
