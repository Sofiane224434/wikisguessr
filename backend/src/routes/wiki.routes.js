import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import { createWikiArticle, deleteWikiArticle, fetchWikiMobileHtml, getWikiArticlesList, getWikiDisambiguationPending, proxyWikiPage, rejectWikiDisambiguation, resolveWikiDisambiguation, unrejectWikiDisambiguation, updateWikiArticle, validateWikiArticles, validateWikiArticlesStream } from '../controllers/wiki.controller.js';

const router = Router();

const adminOnly = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acces admin requis' });
    }

    return next();
};

router.get('/articles', authMiddleware, adminOnly, getWikiArticlesList);
router.post('/articles', authMiddleware, adminOnly, createWikiArticle);
router.post('/articles/validate', authMiddleware, adminOnly, validateWikiArticles);
router.post('/articles/validate-stream', authMiddleware, adminOnly, validateWikiArticlesStream);
router.get('/articles/disambiguation-pending', authMiddleware, adminOnly, getWikiDisambiguationPending);
router.post('/articles/:articleId/resolve-disambiguation', authMiddleware, adminOnly, resolveWikiDisambiguation);
router.post('/articles/:articleId/reject-disambiguation', authMiddleware, adminOnly, rejectWikiDisambiguation);
router.post('/articles/:articleId/unreject-disambiguation', authMiddleware, adminOnly, unrejectWikiDisambiguation);
router.put('/articles/:articleId', authMiddleware, adminOnly, updateWikiArticle);
router.delete('/articles/:articleId', authMiddleware, adminOnly, deleteWikiArticle);

router.get('/mobile-html', fetchWikiMobileHtml);
router.get('/page', proxyWikiPage);

export default router;
