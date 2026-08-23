import pool, { query } from '../config/db.js';

export const SUBSCRIPTION_PLANS = {
    free: {
        id: 'free',
        name: 'Free',
        priceMonthlyCents: 0,
        totalGamesPerDay: 5,
        knowledgeGamesPerDay: 1
    },
    silver: {
        id: 'silver',
        name: 'Silver',
        priceMonthlyCents: 250,
        totalGamesPerDay: 50,
        knowledgeGamesPerDay: 10
    },
    gold: {
        id: 'gold',
        name: 'Gold',
        priceMonthlyCents: 500,
        totalGamesPerDay: 100,
        knowledgeGamesPerDay: null
    }
};

const isActiveSubscription = (user) => {
    if (!user?.subscription_expires_at) {
        return user?.role === 'admin';
    }

    return new Date(user.subscription_expires_at).getTime() > Date.now();
};

export const resolveTier = (user) => {
    if (user?.role === 'admin') {
        return 'gold';
    }

    const tier = String(user?.subscription_tier || 'free').toLowerCase();
    return tier !== 'free' && isActiveSubscription(user) && SUBSCRIPTION_PLANS[tier] ? tier : 'free';
};

const serializePlan = (plan) => ({
    ...plan,
    totalGamesUnlimited: plan.totalGamesPerDay === null,
    knowledgeGamesUnlimited: plan.knowledgeGamesPerDay === null
});

export const listPlans = () => Object.values(SUBSCRIPTION_PLANS).map(serializePlan);

export const getSubscriptionStatus = async (userId) => {
    const users = await query(`
SELECT id, role, subscription_tier, subscription_expires_at,
       stripe_customer_id, stripe_subscription_status
FROM users
WHERE id = ?
LIMIT 1
`, [userId]);
    const user = users[0];
    const tier = resolveTier(user);
    const plan = SUBSCRIPTION_PLANS[tier];
    const usageRows = await query(`
SELECT total_games, knowledge_games
FROM user_daily_game_usage
WHERE user_id = ? AND usage_date = CURRENT_DATE
LIMIT 1
`, [userId]);
    const usage = usageRows[0] || { total_games: 0, knowledge_games: 0 };

    return {
        tier,
        plan: serializePlan(plan),
        expiresAt: user?.role === 'admin' ? null : user?.subscription_expires_at || null,
        isAdminIncluded: user?.role === 'admin',
        billing: {
            managedByStripe: Boolean(user?.stripe_customer_id),
            status: user?.stripe_subscription_status || null
        },
        usage: {
            totalGames: Number(usage.total_games) || 0,
            knowledgeGames: Number(usage.knowledge_games) || 0,
            totalGamesRemaining: plan.totalGamesPerDay === null
                ? null
                : Math.max(0, plan.totalGamesPerDay - (Number(usage.total_games) || 0)),
            knowledgeGamesRemaining: plan.knowledgeGamesPerDay === null
                ? null
                : Math.max(0, plan.knowledgeGamesPerDay - (Number(usage.knowledge_games) || 0))
        }
    };
};

export const activateSubscription = async (userId, requestedTier) => {
    const tier = String(requestedTier || '').toLowerCase();
    if (!['silver', 'gold'].includes(tier)) {
        const error = new Error('Abonnement invalide');
        error.status = 400;
        throw error;
    }

    await query(`
UPDATE users
SET subscription_tier = ?, subscription_expires_at = DATE_ADD(NOW(), INTERVAL 1 MONTH)
WHERE id = ? AND role <> 'admin'
`, [tier, userId]);

    return getSubscriptionStatus(userId);
};

export const reserveGameQuota = async (userId, mode) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [users] = await connection.execute(`
SELECT id, role, subscription_tier, subscription_expires_at
FROM users
WHERE id = ?
FOR UPDATE
`, [userId]);
        const user = users[0];
        if (!user) {
            const error = new Error('Utilisateur introuvable');
            error.status = 404;
            throw error;
        }

        if (user.role === 'admin') {
            await connection.commit();
            return { reserved: false, tier: 'gold' };
        }

        const tier = resolveTier(user);
        const plan = SUBSCRIPTION_PLANS[tier];
        await connection.execute(`
INSERT INTO user_daily_game_usage (user_id, usage_date, total_games, knowledge_games)
VALUES (?, CURRENT_DATE, 0, 0)
ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)
`, [userId]);
        const [usageRows] = await connection.execute(`
SELECT total_games, knowledge_games
FROM user_daily_game_usage
WHERE user_id = ? AND usage_date = CURRENT_DATE
FOR UPDATE
`, [userId]);
        const usage = usageRows[0];
        const knowledgeRequested = mode === 'knowledge';
        const totalBlocked = plan.totalGamesPerDay !== null && usage.total_games >= plan.totalGamesPerDay;
        const knowledgeBlocked = knowledgeRequested
            && plan.knowledgeGamesPerDay !== null
            && usage.knowledge_games >= plan.knowledgeGamesPerDay;

        if (totalBlocked || knowledgeBlocked) {
            const error = new Error(knowledgeBlocked
                ? `Limite Connaissance atteinte pour le plan ${plan.name}`
                : `Limite quotidienne atteinte pour le plan ${plan.name}`);
            error.status = 429;
            error.code = knowledgeBlocked ? 'KNOWLEDGE_LIMIT_REACHED' : 'GAME_LIMIT_REACHED';
            error.subscription = {
                tier,
                plan: serializePlan(plan),
                expiresAt: user.subscription_expires_at || null,
                isAdminIncluded: false,
                usage: {
                    totalGames: Number(usage.total_games) || 0,
                    knowledgeGames: Number(usage.knowledge_games) || 0,
                    totalGamesRemaining: plan.totalGamesPerDay === null
                        ? null
                        : Math.max(0, plan.totalGamesPerDay - (Number(usage.total_games) || 0)),
                    knowledgeGamesRemaining: plan.knowledgeGamesPerDay === null
                        ? null
                        : Math.max(0, plan.knowledgeGamesPerDay - (Number(usage.knowledge_games) || 0))
                }
            };
            throw error;
        }

        await connection.execute(`
UPDATE user_daily_game_usage
SET total_games = total_games + 1,
    knowledge_games = knowledge_games + ?
WHERE user_id = ? AND usage_date = CURRENT_DATE
`, [knowledgeRequested ? 1 : 0, userId]);
        await connection.commit();
        return { reserved: true, tier, knowledgeRequested };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

export const releaseGameQuota = async (userId, knowledgeRequested) => {
    await query(`
UPDATE user_daily_game_usage
SET total_games = GREATEST(0, total_games - 1),
    knowledge_games = GREATEST(0, knowledge_games - ?)
WHERE user_id = ? AND usage_date = CURRENT_DATE
`, [knowledgeRequested ? 1 : 0, userId]);
};