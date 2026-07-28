import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import { sendReport, getReports, getReport, updateReport } from '../controllers/report.controller.js';

const adminOnly = (req, res, next) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }
    next();
};

const router = Router();

// Joueur : envoyer un signalement
router.post('/send', authMiddleware, sendReport);

// Admin : consulter / traiter les signalements
router.get('/', authMiddleware, adminOnly, getReports);
router.get('/:id', authMiddleware, adminOnly, getReport);
router.patch('/:id', authMiddleware, adminOnly, updateReport);

export default router;
