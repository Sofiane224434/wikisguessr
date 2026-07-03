import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import { createGame, getGameByCode, getMyGames, getRandomRoll } from '../controllers/game.controller.js';

const router = Router();

router.post('/', authMiddleware, createGame);
router.get('/random-roll', authMiddleware, getRandomRoll);
router.get('/my', authMiddleware, getMyGames);
router.get('/by-code/:code', authMiddleware, getGameByCode);

export default router;
