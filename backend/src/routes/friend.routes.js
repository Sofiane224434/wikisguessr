import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import {
    addFriend,
    getFriendRequests,
    getFriends,
    removeFriend,
    getFriendsWithStatus,
    updatePresence,
    respondToFriendRequest
} from '../controllers/friend.controller.js';

const router = Router();

router.post('/add', authMiddleware, addFriend);
router.get('/requests', authMiddleware, getFriendRequests);
router.post('/requests/:requestId/respond', authMiddleware, respondToFriendRequest);
router.get('/list', authMiddleware, getFriends);
router.get('/list-with-status', authMiddleware, getFriendsWithStatus);
router.post('/remove', authMiddleware, removeFriend);
router.post('/update-presence', authMiddleware, updatePresence);

export default router;
