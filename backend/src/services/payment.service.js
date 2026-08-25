import Stripe from 'stripe';
import { query } from '../config/db.js';
import { SUBSCRIPTION_PLANS } from './subscription.service.js';

const PAID_TIERS = new Set(['silver', 'gold']);
const ENTITLED_STATUSES = new Set(['active', 'trialing']);

// Résolution intelligente des clés (fallback si une seule est configurée)
const isTest = process.env.NODE_ENV !== 'production';

const stripeSecretKey = () => isTest
    ? (process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY)
    : (process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_TEST);

const stripeWebhookSecret = () => isTest
    ? (process.env.STRIPE_WEBHOOK_SECRET_TEST || process.env.STRIPE_WEBHOOK_SECRET)
    : (process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET_TEST);

const getStripe = () => {
    const key = stripeSecretKey();
    if (!key) {
        const error = new Error('Stripe n\'est pas configuré sur le serveur (STRIPE_SECRET_KEY ou STRIPE_SECRET_KEY_TEST manquant)');
        error.status = 503;
        throw error;
    }
    return new Stripe(key);
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
        ? (isTest ? process.env.STRIPE_SILVER_PRICE_ID_TEST : process.env.STRIPE_SILVER_PRICE_ID)
        : (isTest ? process.env.STRIPE_GOLD_PRICE_ID_TEST : process.env.STRIPE_GOLD_PRICE_ID);

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

export const createCheckoutSession = async (userId, requestedTier, originUrl = null) => {
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

    const appUrl = originUrl || process.env.APP_URL || 'https://wikisguessr.com';
    const stripe = getStripe();

    // Cas 1 : L'utilisateur est déjà en Silver et veut passer à Gold
    // -> Paiement direct Checkout de 2,50 € pour la mise à niveau
    if (user.subscription_tier === 'silver' && tier === 'gold') {
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            customer: user.stripe_customer_id || undefined,
            customer_email: user.stripe_customer_id ? undefined : user.email,
            client_reference_id: String(user.id),
            line_items: [{
                price_data: {
                    currency: 'eur',
                    unit_amount: 250, // 2,50 €
                    product_data: {
                        name: 'Mise à niveau WikisGuessr Gold',
                        description: 'Complément de 2,50 € pour passer au plan Gold (renouvellement maintenu à la date initiale)'
                    }
                },
                quantity: 1
            }],
            metadata: {
                userId: String(user.id),
                tier: 'gold',
                action: 'upgrade',
                previousSubId: user.stripe_subscription_id || ''
            },
            allow_promotion_codes: true,
            success_url: `${appUrl}/shop?checkout=success`,
            cancel_url: `${appUrl}/shop?checkout=cancelled`
        });

        return session.url;
    }

    // Cas 2 : L'utilisateur est en Gold et veut repasser en Silver au prochain renouvellement
    if (user.subscription_tier === 'gold' && tier === 'silver') {
        let subId = user.stripe_subscription_id;
        if (!subId && user.stripe_customer_id) {
            const activeSubs = await stripe.subscriptions.list({
                customer: user.stripe_customer_id,
                status: 'active',
                limit: 1
            });
            if (activeSubs.data.length > 0) subId = activeSubs.data[0].id;
        }

        if (subId) {
            const existingSub = await stripe.subscriptions.retrieve(subId);
            const itemId = existingSub.items?.data?.[0]?.id;

            const targetPriceId = isTest ? process.env.STRIPE_SILVER_PRICE_ID_TEST : process.env.STRIPE_SILVER_PRICE_ID;
            let updatePayload = {
                proration_behavior: 'none',
                metadata: { userId: String(user.id), tier: 'silver' }
            };

            if (targetPriceId) {
                updatePayload.items = [{ id: itemId, price: targetPriceId }];
            } else {
                const plan = SUBSCRIPTION_PLANS.silver;
                const newPrice = await stripe.prices.create({
                    unit_amount: plan.priceMonthlyCents,
                    currency: 'eur',
                    recurring: { interval: 'month' },
                    product_data: { name: `WikisGuessr ${plan.name}` }
                });
                updatePayload.items = [{ id: itemId, price: newPrice.id }];
            }

            await stripe.subscriptions.update(subId, updatePayload);

            return {
                downgraded: true,
                message: 'Votre abonnement a été mis à jour : le tarif passera à 2,50 €/mois lors de votre prochain renouvellement. Vous conservez tous vos avantages Gold jusqu’à cette date.'
            };
        }
    }

    // Cas 3 : Déjà sur la formule demandée
    if (ENTITLED_STATUSES.has(user.stripe_subscription_status) && user.subscription_tier === tier) {
        const error = new Error('Vous bénéficiez déjà de cette formule');
        error.status = 400;
        throw error;
    }

    // Cas 4 : Nouvel abonnement mensuel classique
    const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
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

export const createBillingPortalSession = async (userId, originUrl = null) => {
    const user = await getUser(userId);
    if (!user.stripe_customer_id) {
        const error = new Error('Aucun abonnement Stripe à gérer');
        error.status = 400;
        throw error;
    }

    const appUrl = originUrl || process.env.APP_URL || 'https://wikisguessr.com';
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
        customer: user.stripe_customer_id,
        return_url: `${appUrl}/shop`
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

    if (user.stripe_customer_id && ['active', 'trialing'].includes(user.stripe_subscription_status)) {
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

const applyUpgradeToExistingSubscription = async (userId, targetTier) => {
    const user = await getUser(userId);
    const stripe = getStripe();

    let subId = user.stripe_subscription_id;
    if (!subId && user.stripe_customer_id) {
        const activeSubs = await stripe.subscriptions.list({ customer: user.stripe_customer_id, status: 'active', limit: 1 });
        if (activeSubs.data.length > 0) subId = activeSubs.data[0].id;
    }

    if (subId) {
        const existingSub = await stripe.subscriptions.retrieve(subId);
        const itemId = existingSub.items?.data?.[0]?.id;

        const targetPriceId = targetTier === 'silver'
            ? (isTest ? process.env.STRIPE_SILVER_PRICE_ID_TEST : process.env.STRIPE_SILVER_PRICE_ID)
            : (isTest ? process.env.STRIPE_GOLD_PRICE_ID_TEST : process.env.STRIPE_GOLD_PRICE_ID);

        let updatePayload = {
            proration_behavior: 'none', // Pas de double facturation, le 2.50€ a été payé sur Checkout
            metadata: { userId: String(userId), tier: targetTier }
        };

        if (targetPriceId) {
            updatePayload.items = [{ id: itemId, price: targetPriceId }];
        } else {
            const plan = SUBSCRIPTION_PLANS[targetTier];
            const newPrice = await stripe.prices.create({
                unit_amount: plan.priceMonthlyCents,
                currency: 'eur',
                recurring: { interval: 'month' },
                product_data: { name: `WikisGuessr ${plan.name}` }
            });
            updatePayload.items = [{ id: itemId, price: newPrice.id }];
        }

        const updatedSub = await stripe.subscriptions.update(subId, updatePayload);
        await syncSubscription(updatedSub, userId, targetTier);
    } else {
        // Mise à jour locale si subId non récupéré
        await query(`
UPDATE users
SET subscription_tier = 'gold'
WHERE id = ? AND role <> 'admin'
`, [userId]);
    }
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

export const syncUserStripeStatus = async (userId) => {
    try {
        const user = await getUser(userId);
        if (!user || user.role === 'admin') return;

        const stripe = getStripe();
        let customerId = user.stripe_customer_id;

        if (!customerId && user.email) {
            const customers = await stripe.customers.list({ email: user.email, limit: 1 });
            if (customers.data.length > 0) {
                customerId = customers.data[0].id;
            }
        }

        // Vérifier les sessions de paiement récentes (pour gérer l'upgrade 2.50€)
        const sessions = await stripe.checkout.sessions.list({ limit: 8 });
        const upgradeSession = sessions.data.find(s =>
            (s.client_reference_id === String(userId) || s.metadata?.userId === String(userId) || s.customer_email === user.email)
            && s.payment_status === 'paid'
            && s.metadata?.action === 'upgrade'
        );

        if (upgradeSession) {
            await applyUpgradeToExistingSubscription(userId, upgradeSession.metadata?.tier || 'gold');
            return;
        }

        if (customerId) {
            const subs = await stripe.subscriptions.list({
                customer: customerId,
                status: 'all',
                limit: 3
            });

            if (subs.data.length > 0) {
                const activeSub = subs.data.find(s => ENTITLED_STATUSES.has(s.status)) || subs.data[0];
                const tier = activeSub.metadata?.tier || (activeSub.items?.data?.[0]?.price?.unit_amount >= 400 ? 'gold' : 'silver');
                await syncSubscription(activeSub, userId, tier);
                return;
            }
        }

        const userSession = sessions.data.find(s =>
            (s.client_reference_id === String(userId) || s.metadata?.userId === String(userId) || s.customer_email === user.email)
            && s.status === 'complete'
            && s.subscription
        );

        if (userSession && userSession.subscription) {
            const sub = await stripe.subscriptions.retrieve(userSession.subscription);
            await syncSubscription(sub, userId, userSession.metadata?.tier);
        }
    } catch (err) {
        console.warn('syncUserStripeStatus notice:', err.message);
    }
};

export const handleStripeWebhook = async (rawBody, signature) => {
    const webhookSecret = stripeWebhookSecret();
    if (!webhookSecret) {
        const envVar = isTest ? 'STRIPE_WEBHOOK_SECRET_TEST' : 'STRIPE_WEBHOOK_SECRET';
        const error = new Error(`Webhook Stripe non configuré (manque ${envVar})`);
        error.status = 503;
        throw error;
    }

    const stripe = getStripe();
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        if (session.metadata?.action === 'upgrade') {
            await applyUpgradeToExistingSubscription(session.metadata?.userId, session.metadata?.tier || 'gold');
        } else if (session.mode === 'subscription' && session.subscription) {
            const subscription = await stripe.subscriptions.retrieve(session.subscription);
            await syncSubscription(subscription, session.metadata?.userId, session.metadata?.tier);
        }
    } else if (event.type.startsWith('customer.subscription.')) {
        await syncSubscription(event.data.object);
    }

    return event.type;
};