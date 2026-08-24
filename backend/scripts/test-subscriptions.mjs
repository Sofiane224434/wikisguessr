import 'dotenv/config';
import { query } from '../src/config/db.js';
import {
    activateSubscription,
    reserveGameQuota,
    SUBSCRIPTION_PLANS
} from '../src/services/subscription.service.js';

const marker = Date.now();
const result = await query(`
INSERT INTO users (username, email, email_verified, role, password)
VALUES (?, ?, 1, 'user', 'integration-test-only')
`, [`subscription_${marker}`, `subscription_${marker}@test.local`]);

try {
    const silver = await activateSubscription(result.insertId, 'silver');
    if (silver.tier !== 'silver' || silver.plan.priceMonthlyCents !== 250) {
        throw new Error('Activation Silver invalide');
    }

    if (SUBSCRIPTION_PLANS.gold.knowledgeGamesPerDay !== null) {
        throw new Error('Le plan Gold doit avoir Connaissance illimitee');
    }

    await query(`
UPDATE users
SET subscription_tier = 'free', subscription_expires_at = NULL
WHERE id = ?
`, [result.insertId]);
    await reserveGameQuota(result.insertId, 'knowledge');
    await reserveGameQuota(result.insertId, 'knowledge');

    let limitRejected = false;
    try {
        await reserveGameQuota(result.insertId, 'knowledge');
    } catch (error) {
        limitRejected = error.status === 429 && error.code === 'KNOWLEDGE_LIMIT_REACHED';
    }

    if (!limitRejected) {
        throw new Error('La troisieme partie Connaissance Free doit etre refusee');
    }

    console.log('Abonnements et quotas: OK');
} finally {
    await query('DELETE FROM users WHERE id = ?', [result.insertId]);
}

process.exit(0);