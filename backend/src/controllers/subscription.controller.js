import {
    getSubscriptionStatus,
    listPlans
} from '../services/subscription.service.js';
import {
    cancelSubscriptionSession,
    createBillingPortalSession,
    createCheckoutSession,
    handleStripeWebhook,
    syncUserStripeStatus
} from '../services/payment.service.js';

export const getPlans = (_req, res) => {
    return res.json({ plans: listPlans() });
};

export const getMySubscription = async (req, res) => {
    try {
        await syncUserStripeStatus(req.user.id);
        const subscription = await getSubscriptionStatus(req.user.id);
        return res.json({ subscription });
    } catch (error) {
        console.error('getMySubscription error:', error);
        return res.status(500).json({ error: 'Impossible de charger votre abonnement' });
    }
};

export const checkout = async (req, res) => {
    try {
        const originUrl = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null);
        const result = await createCheckoutSession(req.user.id, req.body.tier, originUrl);
        if (result?.upgraded || result?.downgraded) {
            return res.json(result);
        }
        return res.json({ url: result.url || result });
    } catch (error) {
        console.error('checkout error:', error);
        return res.status(error.status || 500).json({ error: error.message || 'Impossible de démarrer le paiement' });
    }
};

export const billingPortal = async (req, res) => {
    try {
        const originUrl = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null);
        const url = await createBillingPortalSession(req.user.id, originUrl);
        return res.json({ url });
    } catch (error) {
        console.error('billingPortal error:', error);
        return res.status(error.status || 500).json({ error: error.message || 'Impossible d’ouvrir la gestion de l’abonnement' });
    }
};

export const cancelSubscription = async (req, res) => {
    try {
        const result = await cancelSubscriptionSession(req.user.id);
        return res.json(result);
    } catch (error) {
        console.error('cancelSubscription error:', error);
        return res.status(error.status || 500).json({ error: error.message || 'Impossible d’annuler le renouvellement' });
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