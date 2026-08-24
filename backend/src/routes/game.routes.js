import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import {
    createGame,
    generateKnowledgeQuizForGame,
    getKnowledgeQuizUsage,
    getGameByCode,
    getMyGames,
    getRandomRoll,
    submitGameResult,
    updateKnowledgeScore,
    getMyHistory,
    getLeaderboard
} from '../controllers/game.controller.js';

const router = Router();

router.get('/random-roll', authMiddleware, getRandomRoll);
router.get('/my', authMiddleware, getMyGames);
router.get('/history', authMiddleware, getMyHistory);
router.get('/leaderboard', getLeaderboard);
router.get('/knowledge-quiz/usage', authMiddleware, getKnowledgeQuizUsage);
router.get('/by-code/:code', authMiddleware, getGameByCode);
router.post('/', authMiddleware, createGame);
router.post('/:code/result', authMiddleware, submitGameResult);
router.patch('/:code/result/knowledge-score', authMiddleware, updateKnowledgeScore);
router.post('/:code/knowledge-quiz', authMiddleware, generateKnowledgeQuizForGame);

export default router;
