import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import { createGame, getGameByCode, getMyGames } from '../controllers/game.controller.js';

const router = Router();

router.post('/', authMiddleware, createGame);
router.get('/my', authMiddleware, getMyGames);
router.get('/:code', authMiddleware, getGameByCode);

export default router;
