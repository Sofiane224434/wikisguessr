import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import {
    addFriend,
    getFriends,
    removeFriend
} from '../controllers/friend.controller.js';

const router = Router();

router.post('/add', authMiddleware, addFriend);
router.get('/list', authMiddleware, getFriends);
router.post('/remove', authMiddleware, removeFriend);

export default router;
