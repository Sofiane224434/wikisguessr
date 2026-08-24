import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import {
    getMyRoom,
    joinRoom,
    leaveRoom,
    getRoomInfo
} from '../controllers/game-room.controller.js';

const router = Router();

router.get('/my', authMiddleware, getMyRoom);
router.get('/info', getRoomInfo);
router.post('/join', authMiddleware, joinRoom);
router.post('/leave', authMiddleware, leaveRoom);

export default router;
