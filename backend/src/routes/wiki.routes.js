import { Router } from 'express';
import { proxyWikiPage } from '../controllers/wiki.controller.js';

const router = Router();

router.get('/page', proxyWikiPage);

export default router;
