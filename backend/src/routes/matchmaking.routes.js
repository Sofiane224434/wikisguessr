import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import matchmakingService from '../services/matchmaking.service.js';

const router = Router();

/**
 * POST /api/matchmaking/join
 * Player joins matchmaking queue for a mode
 */
router.post('/join', authMiddleware, (req, res) => {
    try {
        const { mode } = req.body;
        const userId = req.user.id;
        const username = req.user.username;

        if (!mode || !['normal', 'chrono', 'knowledge'].includes(mode)) {
            return res.status(400).json({ error: 'Mode invalide' });
        }

        // Get socket.io instance from app
        const io = req.app.locals.io;
        if (!io) {
            return res.status(500).json({ error: 'Socket.io not initialized' });
        }

        // Find this user's socket ID
        const socket = io.sockets.sockets.get(req.user.id);
        if (!socket) {
            return res.status(400).json({ error: 'Socket not connected' });
        }

        matchmakingService.joinQueue(userId, username, socket.id, mode);
        const queueSize = matchmakingService.getQueueSize(mode);

        res.json({
            success: true,
            message: `Matchmaking commencé en mode ${mode}`,
            queueSize
        });
    } catch (err) {
        console.error('[Matchmaking] Error joining queue:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/matchmaking/cancel
 * Player cancels current matchmaking search
 */
router.post('/cancel', authMiddleware, (req, res) => {
    try {
        const userId = req.user.id;
        const canceled = matchmakingService.cancelSearch(userId);

        res.json({
            success: true,
            message: canceled ? 'Recherche annulée' : 'Aucune recherche active',
            canceled
        });
    } catch (err) {
        console.error('[Matchmaking] Error canceling search:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/matchmaking/queue/:mode
 * Get current queue size for a mode (for UI display)
 */
router.get('/queue/:mode', (req, res) => {
    try {
        const { mode } = req.params;
        const size = matchmakingService.getQueueSize(mode);
        res.json({ queueSize: size });
    } catch (err) {
        console.error('[Matchmaking] Error getting queue size:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
