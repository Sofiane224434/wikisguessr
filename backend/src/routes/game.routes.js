import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import { createGame, getMyGames } from '../controllers/game.controller.js';

const router = Router();

router.post('/', authMiddleware, createGame);
router.get('/my', authMiddleware, getMyGames);

export default router;
