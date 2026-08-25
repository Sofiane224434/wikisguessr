import Stripe from 'stripe';
import { query } from '../config/db.js';
import { SUBSCRIPTION_PLANS } from './subscription.service.js';

const PAID_TIERS = new Set(['silver', 'gold']);
const ENTITLED_STATUSES = new Set(['active', 'trialing']);

const getStripe = () => {
    if (!process.env.STRIPE_SECRET_KEY) {
        const error = new Error('Stripe n’est pas configuré sur le serveur');
        error.status = 503;
        throw error;
    }

    return new Stripe(process.env.STRIPE_SECRET_KEY);
};

const getUser = async (userId) => {
    const users = await query(`
SELECT id, email, role, stripe_customer_id, stripe_subscription_status
FROM users
WHERE id = ?
LIMIT 1
`, [userId]);

    if (!users[0]) {
        const error = new Error('Utilisateur introuvable');
        error.status = 404;
        throw error;
    }

    return users[0];
};

const getLineItem = (tier) => {
    const priceId = tier === 'silver'
        ? process.env.STRIPE_SILVER_PRICE_ID
        : process.env.STRIPE_GOLD_PRICE_ID;

    if (priceId) {
        return { price: priceId, quantity: 1 };
    }

    const plan = SUBSCRIPTION_PLANS[tier];
    return {
        price_data: {
            currency: 'eur',
            unit_amount: plan.priceMonthlyCents,
            recurring: { interval: 'month' },
            product_data: { name: `WikisGuessr ${plan.name}` }
        },
        quantity: 1
    };
};

const getPeriodEnd = (subscription) => (
    subscription.current_period_end
    || subscription.items?.data?.[0]?.current_period_end
    || null
);

export const createCheckoutSession = async (userId, requestedTier) => {
    const tier = String(requestedTier || '').toLowerCase();
    if (!PAID_TIERS.has(tier)) {
        const error = new Error('Abonnement invalide');
        error.status = 400;
        throw error;
    }

    const user = await getUser(userId);
    if (user.role === 'admin') {
        const error = new Error('Le plan Gold est déjà inclus pour les administrateurs');
        error.status = 400;
        throw error;
    }
    if (ENTITLED_STATUSES.has(user.stripe_subscription_status)) {
        const error = new Error('Gérez votre formule actuelle depuis le portail Stripe');
        error.status = 409;
        throw error;
    }

    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: user.stripe_customer_id || undefined,
        customer_email: user.stripe_customer_id ? undefined : user.email,
        client_reference_id: String(user.id),
        line_items: [getLineItem(tier)],
        metadata: { userId: String(user.id), tier },
        subscription_data: { metadata: { userId: String(user.id), tier } },
        allow_promotion_codes: true,
        success_url: `${appUrl}/shop?checkout=success`,
        cancel_url: `${appUrl}/shop?checkout=cancelled`
    });

    return session.url;
};

export const createBillingPortalSession = async (userId) => {
    const user = await getUser(userId);
    if (!user.stripe_customer_id) {
        const error = new Error('Aucun abonnement Stripe à gérer');
        error.status = 400;
        throw error;
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
        customer: user.stripe_customer_id,
        return_url: `${process.env.APP_URL || 'http://localhost:5173'}/shop`
    });
    return session.url;
};

export const cancelSubscriptionSession = async (userId) => {
    const user = await getUser(userId);

    if (user.role === 'admin') {
        const error = new Error('L’abonnement administrateur ne peut pas être annulé');
        error.status = 400;
        throw error;
    }

    if (user.stripe_customer_id && process.env.STRIPE_SECRET_KEY && ['active', 'trialing'].includes(user.stripe_subscription_status)) {
        try {
            const stripe = getStripe();
            const subs = await stripe.subscriptions.list({ customer: user.stripe_customer_id, status: 'active', limit: 1 });
            if (subs.data && subs.data.length > 0) {
                await stripe.subscriptions.update(subs.data[0].id, { cancel_at_period_end: true });
            }
        } catch (stripeErr) {
            console.warn('Stripe subscription cancel warn:', stripeErr.message);
        }
    }

    await query(`
UPDATE users
SET stripe_subscription_status = 'canceling'
WHERE id = ? AND role <> 'admin'
`, [userId]);

    return { success: true, message: 'Le renouvellement automatique a été annulé. Vous conservez vos avantages jusqu’à la fin de la période.' };
};

const syncSubscription = async (subscription, forcedUserId = null, forcedTier = null) => {
    const userId = forcedUserId || subscription.metadata?.userId;
    const tier = String(forcedTier || subscription.metadata?.tier || '').toLowerCase();
    if (!userId || !PAID_TIERS.has(tier)) {
        return;
    }

    const entitled = ENTITLED_STATUSES.has(subscription.status);
    const periodEnd = getPeriodEnd(subscription);
    await query(`
UPDATE users
SET subscription_tier = ?,
    subscription_expires_at = ?,
    stripe_customer_id = ?,
    stripe_subscription_id = ?,
    stripe_subscription_status = ?
WHERE id = ? AND role <> 'admin'
`, [
        entitled ? tier : 'free',
        entitled && periodEnd ? new Date(periodEnd * 1000) : null,
        String(subscription.customer || ''),
        String(subscription.id || ''),
        subscription.status,
        Number(userId)
    ]);
};

export const handleStripeWebhook = async (rawBody, signature) => {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
        const error = new Error('Webhook Stripe non configuré');
        error.status = 503;
        throw error;
    }

    const stripe = getStripe();
    const event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        if (session.mode === 'subscription' && session.subscription) {
            const subscription = await stripe.subscriptions.retrieve(session.subscription);
            await syncSubscription(subscription, session.metadata?.userId, session.metadata?.tier);
        }
    } else if (event.type.startsWith('customer.subscription.')) {
        await syncSubscription(event.data.object);
    }

    return event.type;
};