// routes/auth.routes.js
import { Router } from 'express'; // Import nommé ⬅️
import {
	register,
	login,
	getProfile,
	getUsers,
	verifyEmail,
	forgotPassword,
	resetPassword,
	banUser,
	unbanUser
} from '../controllers/auth.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
const router = Router();

const adminOnly = (req, res, next) => {
	if (req.user?.role !== 'admin') {
		return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
	}
	next()
};
// Routes publiques
router.post('/register', register);
router.post('/login', login);
router.get('/verify-email', verifyEmail);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
// Routes protégées
router.get('/me', authMiddleware, getProfile);
router.get('/users', authMiddleware, getUsers);

// Routes admin
router.post('/ban', authMiddleware, adminOnly, banUser);
router.post('/unban', authMiddleware, adminOnly, unbanUser);

export default router;