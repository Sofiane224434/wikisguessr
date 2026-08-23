import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import { billingPortal, checkout, getMySubscription, getPlans } from '../controllers/subscription.controller.js';

const router = Router();

router.get('/plans', getPlans);
router.get('/me', authMiddleware, getMySubscription);
router.post('/checkout', authMiddleware, checkout);
router.post('/portal', authMiddleware, billingPortal);

export default router;