import 'dotenv/config';
import Stripe from 'stripe';
import { query } from '../src/config/db.js';

process.env.STRIPE_SECRET_KEY ||= 'sk_test_webhook_validation';
process.env.STRIPE_WEBHOOK_SECRET ||= 'whsec_wikisguessr_test';

const { handleStripeWebhook } = await import('../src/services/payment.service.js');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const marker = Date.now();
const result = await query(`
INSERT INTO users (username, email, email_verified, role, password)
VALUES (?, ?, 1, 'user', 'integration-test-only')
`, [`payment_${marker}`, `payment_${marker}@test.local`]);

const sendSubscriptionEvent = async (status, type) => {
    const payload = JSON.stringify({
        id: `evt_${marker}_${status}`,
        object: 'event',
        type,
        data: {
            object: {
                id: `sub_${marker}`,
                object: 'subscription',
                customer: `cus_${marker}`,
                status,
                current_period_end: Math.floor(Date.now() / 1000) + 2592000,
                metadata: { userId: String(result.insertId), tier: 'silver' }
            }
        }
    });
    const signature = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: process.env.STRIPE_WEBHOOK_SECRET
    });
    await handleStripeWebhook(payload, signature);
};

try {
    await sendSubscriptionEvent('active', 'customer.subscription.updated');
    const [active] = await query(`
SELECT subscription_tier, stripe_subscription_status
FROM users WHERE id = ?
`, [result.insertId]);
    if (active.subscription_tier !== 'silver' || active.stripe_subscription_status !== 'active') {
        throw new Error('Le webhook actif n’a pas accordé Silver');
    }

    await sendSubscriptionEvent('canceled', 'customer.subscription.deleted');
    const [cancelled] = await query(`
SELECT subscription_tier, stripe_subscription_status
FROM users WHERE id = ?
`, [result.insertId]);
    if (cancelled.subscription_tier !== 'free' || cancelled.stripe_subscription_status !== 'canceled') {
        throw new Error('Le webhook de suppression n’a pas révoqué Silver');
    }

    console.log('Paiements Stripe et webhook signe: OK');
} finally {
    await query('DELETE FROM users WHERE id = ?', [result.insertId]);
}

process.exit(0);