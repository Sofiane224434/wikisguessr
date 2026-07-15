import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import { getSiteState, updateSiteOfflineMode } from '../controllers/site-state.controller.js';

const router = Router();

router.get('/', getSiteState);
router.put('/offline', authMiddleware, updateSiteOfflineMode);

export default router;
