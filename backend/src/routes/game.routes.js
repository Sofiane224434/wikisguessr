import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import {
	createGame,
	generateKnowledgeQuizForGame,
	getKnowledgeQuizUsage,
	getGameByCode,
	getMyGames,
	getRandomRoll
} from '../controllers/game.controller.js';

const router = Router();

router.post('/', authMiddleware, createGame);
router.get('/random-roll', authMiddleware, getRandomRoll);
router.get('/my', authMiddleware, getMyGames);
router.get('/knowledge-quiz/usage', authMiddleware, getKnowledgeQuizUsage);
router.get('/by-code/:code', authMiddleware, getGameByCode);
router.post('/:code/knowledge-quiz', authMiddleware, generateKnowledgeQuizForGame);

export default router;
