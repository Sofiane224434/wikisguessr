import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import {
    sendMessage,
    getMessages,
    getNewMessages
} from '../controllers/room-message.controller.js';

const router = Router();

router.post('/send', authMiddleware, sendMessage);
router.get('/list', authMiddleware, getMessages);
router.get('/new', authMiddleware, getNewMessages);

export default router;
