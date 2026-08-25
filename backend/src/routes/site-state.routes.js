import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import { getSiteState, updateSiteOfflineMode, updateSiteCheatMode } from '../controllers/site-state.controller.js';

const router = Router();

router.get('/', getSiteState);
router.put('/offline', authMiddleware, updateSiteOfflineMode);
router.put('/cheat-mode', authMiddleware, updateSiteCheatMode);

export default router;
