import {
    getSubscriptionStatus,
    listPlans
} from '../services/subscription.service.js';
import {
    createBillingPortalSession,
    createCheckoutSession,
    handleStripeWebhook
} from '../services/payment.service.js';

export const getPlans = (_req, res) => {
    return res.json({ plans: listPlans() });
};

export const getMySubscription = async (req, res) => {
    try {
        const subscription = await getSubscriptionStatus(req.user.id);
        return res.json({ subscription });
    } catch (error) {
        console.error('getMySubscription error:', error);
        return res.status(500).json({ error: 'Impossible de charger votre abonnement' });
    }
};

export const checkout = async (req, res) => {
    try {
        const url = await createCheckoutSession(req.user.id, req.body.tier);
        return res.json({ url });
    } catch (error) {
        console.error('checkout error:', error);
        return res.status(error.status || 500).json({ error: error.message || 'Impossible de démarrer le paiement' });
    }
};

export const billingPortal = async (req, res) => {
    try {
        const url = await createBillingPortalSession(req.user.id);
        return res.json({ url });
    } catch (error) {
        console.error('billingPortal error:', error);
        return res.status(error.status || 500).json({ error: error.message || 'Impossible d’ouvrir la gestion de l’abonnement' });
    }
};

export const stripeWebhook = async (req, res) => {
    try {
        const type = await handleStripeWebhook(req.body, req.headers['stripe-signature']);
        return res.json({ received: true, type });
    } catch (error) {
        console.error('stripeWebhook error:', error.message);
        return res.status(error.status || 400).json({ error: error.message || 'Webhook Stripe invalide' });
    }
};