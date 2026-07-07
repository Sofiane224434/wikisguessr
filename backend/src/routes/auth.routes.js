// routes/auth.routes.js
import { Router } from 'express'; // Import nommé ⬅️
import {
	register,
	login,
	getProfile,
	getUsers,
	verifyEmail,
	forgotPassword,
	resetPassword
} from '../controllers/auth.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
const router = Router();
// Routes publiques
router.post('/register', register);
router.post('/login', login);
router.get('/verify-email', verifyEmail);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
// Routes protégées
router.get('/me', authMiddleware, getProfile);
router.get('/users', authMiddleware, getUsers);
export default router;