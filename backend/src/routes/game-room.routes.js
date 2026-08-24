import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import {
    getMyRoom,
    joinRoom,
    leaveRoom,
    getRoomInfo,
    getRoomInvitations,
    inviteFriendToRoom,
    respondToRoomInvitation,
    startRoomGame
} from '../controllers/game-room.controller.js';

const router = Router();

router.get('/my', authMiddleware, getMyRoom);
router.get('/info', getRoomInfo);
router.post('/join', authMiddleware, joinRoom);
router.post('/leave', authMiddleware, leaveRoom);
router.get('/invitations', authMiddleware, getRoomInvitations);
router.post('/invitations', authMiddleware, inviteFriendToRoom);
router.post('/invitations/:invitationId/respond', authMiddleware, respondToRoomInvitation);
router.post('/:roomId/start', authMiddleware, startRoomGame);

export default router;
