import { Router } from 'express';
import { fetchWikiMobileHtml, proxyWikiPage } from '../controllers/wiki.controller.js';

const router = Router();

router.get('/mobile-html', fetchWikiMobileHtml);
router.get('/page', proxyWikiPage);

export default router;
