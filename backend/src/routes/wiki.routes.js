import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import { proxyWikiPage } from '../controllers/wiki.controller.js';

const router = Router();

router.get('/page', authMiddleware, proxyWikiPage);

export default router;
