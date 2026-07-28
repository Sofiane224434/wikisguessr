import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import {
    addFriend,
    getFriends,
    removeFriend,
    getFriendsWithStatus,
    updatePresence
} from '../controllers/friend.controller.js';

const router = Router();

router.post('/add', authMiddleware, addFriend);
router.get('/list', authMiddleware, getFriends);
router.get('/list-with-status', authMiddleware, getFriendsWithStatus);
router.post('/remove', authMiddleware, removeFriend);
router.post('/update-presence', authMiddleware, updatePresence);

export default router;
