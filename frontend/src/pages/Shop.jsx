import { Check, Crown, ExternalLink, Gauge, ShieldCheck, ShoppingBag, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { subscriptionService } from '../services/api.js';

function Shop() {
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const [plans, setPlans] = useState([]);
    const [subscription, setSubscription] = useState(null);
    const [loading, setLoading] = useState(true);
    const [pendingTier, setPendingTier] = useState(null);
    const [message, setMessage] = useState(() => {
        if (searchParams.get('checkout') === 'success') {
            return 'Paiement confirmé. Votre abonnement est mis à jour par Stripe.';
        }
        if (searchParams.get('checkout') === 'cancelled') {
            return 'Paiement annulé : aucun montant n’a été prélevé.';
        }
        return '';
    });
    const [cancelingSubscription, setCancelingSubscription] = useState(false);
    const [error, setError] = useState('');
    const hasActiveStripeSubscription = Boolean(
        subscription?.billing?.managedByStripe
        && ['active', 'trialing'].includes(subscription.billing.status)
    );

    useEffect(() => {
        Promise.all([subscriptionService.getPlans(), subscriptionService.getMine()])
            .then(([plansData, subscriptionData]) => {
                setPlans(plansData.plans || []);
                setSubscription(subscriptionData.subscription);
            })
            .catch((requestError) => setError(requestError.message || 'Impossible de charger la boutique'))
            .finally(() => setLoading(false));
    }, []);

    const handleSubscribe = async (tier) => {
        if (hasActiveStripeSubscription) {
            await handleManageBilling();
            return;
        }

        setPendingTier(tier);
        setError('');
        setMessage('');
        try {
            const data = await subscriptionService.checkout(tier);
            window.location.assign(data.url);
        } catch (requestError) {
            setError(requestError.message || 'Impossible de démarrer le paiement');
            setPendingTier(null);
        }
    };

    const handleManageBilling = async () => {
        setError('');
        try {
            const data = await subscriptionService.openPortal();
            window.location.assign(data.url);
        } catch (requestError) {
            setError(requestError.message || 'Impossible d’ouvrir la gestion de l’abonnement');
        }
    };

    const handleCancelSubscription = async () => {
        if (!confirm('Êtes-vous sûr de vouloir annuler le renouvellement automatique de votre abonnement ? Vous conserverez vos avantages jusqu’à la fin de la période en cours, mais aucun montant ne sera prélevé le mois prochain.')) {
            return;
        }

        setCancelingSubscription(true);
        setError('');
        setMessage('');

        try {
            const res = await subscriptionService.cancelSubscription();
            setMessage(res.message || 'Le renouvellement automatique a été annulé avec succès.');
            const subData = await subscriptionService.getMine();
            setSubscription(subData.subscription);
        } catch (requestError) {
            setError(requestError.message || 'Impossible d’annuler l’abonnement');
        } finally {
            setCancelingSubscription(false);
        }
    };

    return (
        <div className="site-page shop-page paper border-2 shadow-large">
            <header className="shop-heading">
                <div className="shop-heading-icon"><ShoppingBag size={27} aria-hidden="true" /></div>
                <div>
                    <p>{t('shop.eyebrow')}</p>
                    <h1>{t('shop.title')}</h1>
                    <span>{t('shop.subtitle')}</span>
                </div>
            </header>

            {loading ? (
                <div className="shop-loading"><Sparkles size={24} aria-hidden="true" /> {t('shop.loading')}</div>
            ) : (
                <>
                    {subscription && (
                        <section className="shop-current-plan" aria-label="Votre abonnement">
                            <div>
                                <span>{t('shop.your_plan')}</span>
                                <strong>{subscription.plan.name}{subscription.isAdminIncluded ? ` · ${t('shop.admin_included')}` : ''}</strong>
                                {subscription.billing?.status === 'canceling' && (
                                    <span className="text-amber-300 text-xs font-semibold">(Renouvellement annulé)</span>
                                )}
                            </div>
                            <div>
                                <Gauge size={20} aria-hidden="true" />
                                <span>{t('shop.games_today', { count: subscription.usage.totalGames })}</span>
                            </div>
                            <div>
                                <Crown size={20} aria-hidden="true" />
                                <span>{subscription.plan.knowledgeGamesUnlimited ? t('shop.knowledge_unlimited') : t('shop.knowledge_remaining', { count: subscription.usage.knowledgeGamesRemaining })}</span>
                            </div>
                            <div className="flex flex-wrap gap-2 items-center">
                                {subscription.billing?.managedByStripe && !subscription.isAdminIncluded && (
                                    <button type="button" className="shop-manage-button" onClick={handleManageBilling}>
                                        <ExternalLink size={17} aria-hidden="true" /> {t('shop.manage')}
                                    </button>
                                )}
                                {subscription.tier !== 'free' && !subscription.isAdminIncluded && subscription.billing?.status !== 'canceling' && (
                                    <button
                                        type="button"
                                        disabled={cancelingSubscription}
                                        className="rounded-lg border border-red-700 bg-red-950/80 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-900 disabled:opacity-50"
                                        onClick={handleCancelSubscription}
                                    >
                                        {cancelingSubscription ? 'Annulation...' : 'Annuler le renouvellement'}
                                    </button>
                                )}
                            </div>
                        </section>
                    )}

                    {message && <p className="shop-notice is-success">{message}</p>}
                    {error && <p className="shop-notice is-error">{error}</p>}

                    <div className="shop-plan-grid">
                        {plans.map((plan) => {
                            const isCurrent = subscription?.tier === plan.id;
                            const isPaid = plan.priceMonthlyCents > 0;
                            return (
                                <article key={plan.id} className={`shop-plan is-${plan.id}${isCurrent ? ' is-current' : ''}`}>
                                    <div className="shop-plan-title">
                                        <span>{plan.id === 'gold' ? <Crown size={23} /> : plan.id === 'silver' ? <Sparkles size={23} /> : <Gauge size={23} />}</span>
                                        <h2>{plan.name}</h2>
                                    </div>
                                    <p className="shop-price">
                                        <strong>{(plan.priceMonthlyCents / 100).toFixed(2).replace('.', ',')} €</strong>
                                        <span>{isPaid ? t('shop.per_month') : t('shop.forever')}</span>
                                    </p>
                                    <ul>
                                        {[1, 2, 3].map((detailIndex) => (
                                            <li key={detailIndex}><Check size={17} aria-hidden="true" />{t(`shop.${plan.id}_${detailIndex}`)}</li>
                                        ))}
                                    </ul>
                                    <button
                                        type="button"
                                        disabled={!isPaid || isCurrent || subscription?.isAdminIncluded || pendingTier !== null}
                                        onClick={() => handleSubscribe(plan.id)}
                                    >
                                        {isCurrent
                                            ? t('shop.current')
                                            : subscription?.isAdminIncluded
                                                ? t('shop.admin_included')
                                            : pendingTier === plan.id
                                                ? t('shop.opening')
                                                : isPaid && hasActiveStripeSubscription
                                                    ? t('shop.change_stripe')
                                                    : isPaid ? t('shop.choose', { plan: plan.name }) : t('shop.included')}
                                    </button>
                                </article>
                            );
                        })}
                    </div>

                    <p className="shop-payment-note"><ShieldCheck size={16} aria-hidden="true" /> {t('shop.payment_note')}</p>
                </>
            )}
        </div>
    );
}
export default Shop;
