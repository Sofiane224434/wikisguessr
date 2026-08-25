import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService, gameService, siteService, reportService } from '../services/api.js';
import { useTranslation } from 'react-i18next';

function Admin() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [roll, setRoll] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [players, setPlayers] = useState([]);
    const [offline, setOffline] = useState(false);
    const [updatingOffline, setUpdatingOffline] = useState(false);
    const [quizUsage, setQuizUsage] = useState(null);
    const [reports, setReports] = useState([]);
    const [reportsPending, setReportsPending] = useState(0);
    const [reportsFilter, setReportsFilter] = useState('pending');
    const [selectedReport, setSelectedReport] = useState(null);
    const [reportDetail, setReportDetail] = useState(null);
    const [updatingReport, setUpdatingReport] = useState(false);
    const [updatingSubscriptionId, setUpdatingSubscriptionId] = useState(null);

    const toNumberOrNull = (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    };

    const dailyRequestLimit = (() => {
        const value = toNumberOrNull(quizUsage?.dailyRequestLimit);
        return value && value > 0 ? value : 500;
    })();

    const dailyCalls = (() => {
        const value = toNumberOrNull(quizUsage?.dailyCalls);
        if (value !== null) {
            return value;
        }

        const totalCalls = toNumberOrNull(quizUsage?.totalCalls);
        return totalCalls !== null ? totalCalls : 0;
    })();

    const remainingDailyCalls = (() => {
        const value = toNumberOrNull(quizUsage?.remainingDailyCalls);
        if (value !== null) {
            return value;
        }

        return Math.max(0, dailyRequestLimit - dailyCalls);
    })();

    const dailyTokenLimit = (() => {
        const value = toNumberOrNull(quizUsage?.dailyTokenLimit);
        return value && value > 0 ? value : null;
    })();

    const dailyTotalTokens = (() => {
        const value = toNumberOrNull(quizUsage?.dailyTotalTokens);
        if (value !== null) {
            return value;
        }

        const totalTokens = toNumberOrNull(quizUsage?.totalTokens);
        return totalTokens !== null ? totalTokens : 0;
    })();

    const remainingDailyTokens = (() => {
        const value = toNumberOrNull(quizUsage?.remainingDailyTokens);
        if (value !== null) {
            return value;
        }

        if (dailyTokenLimit === null) {
            return null;
        }

        return Math.max(0, dailyTokenLimit - dailyTotalTokens);
    })();

    const hasTokenUsageInfo = (() => {
        if (dailyTokenLimit !== null) {
            return true;
        }

        const prompt = toNumberOrNull(quizUsage?.totalPromptTokens) || 0;
        const candidate = toNumberOrNull(quizUsage?.totalCandidateTokens) || 0;
        const total = toNumberOrNull(quizUsage?.totalTokens) || 0;
        const daily = toNumberOrNull(quizUsage?.dailyTotalTokens) || 0;

        return prompt > 0 || candidate > 0 || total > 0 || daily > 0;
    })();

    const loadAdminData = async () => {
        setLoading(true);
        setError(null);

        try {
            const usageData = await gameService.getKnowledgeQuizUsage();
            setQuizUsage(usageData?.usage || null);

            const siteStateData = await siteService.getState();
            const isOffline = Boolean(siteStateData?.state?.offline);
            const isCheat = Boolean(siteStateData?.state?.adminCheat);
            setOffline(isOffline);
            setAdminCheat(isCheat);

            if (isOffline) {
                setRoll(null);
                setPlayers([]);
                setLoading(false);
                return;
            }

            const [rollData, usersData] = await Promise.all([
                gameService.getRandomRoll(),
                authService.getUsers()
            ]);

            setRoll(rollData.roll);
            setPlayers(Array.isArray(usersData.users) ? usersData.users : []);

            // Charger les signalements
            const repData = await reportService.getAll('pending');
            setReports(repData.reports || []);
            setReportsPending(repData.pending || 0);
        } catch (err) {
            setError(err.message || 'Impossible de charger les donnees admin');
        } finally {
            setLoading(false);
        }
    };

    const handleToggleOffline = async () => {
        setUpdatingOffline(true);
        setError(null);

        try {
            const data = await siteService.setOfflineMode(!offline);
            setOffline(Boolean(data?.state?.offline));
        } catch (err) {
            setError(err.message || 'Impossible de changer le mode offline');
        } finally {
            setUpdatingOffline(false);
        }
    };

    const handleToggleCheat = async () => {
        setUpdatingCheat(true);
        setError(null);

        try {
            const data = await siteService.setAdminCheatMode(!adminCheat);
            setAdminCheat(Boolean(data?.state?.adminCheat));
            setSuccess(data?.state?.adminCheat ? 'Mode triche admin activé' : 'Mode triche admin désactivé');
        } catch (err) {
            setError(err.message || 'Impossible de changer le mode triche admin');
        } finally {
            setUpdatingCheat(false);
        }
    };

    useEffect(() => {
        loadAdminData();
    }, []);

    const loadReports = async (status) => {
        try {
            const repData = await reportService.getAll(status || undefined);
            setReports(repData.reports || []);
            setReportsPending(repData.pending || 0);
        } catch (err) {
            console.error('Erreur chargement signalements:', err);
        }
    };

    const handleFilterReports = (status) => {
        setReportsFilter(status);
        loadReports(status);
    };

    const handleOpenReport = async (report) => {
        setSelectedReport(report);
        try {
            const data = await reportService.getById(report.id);
            setReportDetail(data.report);
        } catch (err) {
            console.error('Erreur chargement détail:', err);
            setReportDetail(report);
        }
    };

    const handleUpdateReport = async (id, status, adminNote = '') => {
        setUpdatingReport(true);
        try {
            await reportService.updateStatus(id, status, adminNote);
            setSelectedReport(null);
            setReportDetail(null);
            loadReports(reportsFilter);
        } catch (err) {
            setError(err.message || 'Impossible de mettre à jour');
        } finally {
            setUpdatingReport(false);
        }
    };

    const handleBan = async (userId, username) => {
        if (!confirm(`Êtes-vous sûr de vouloir bannir ${username} ?`)) return;
        try {
            await authService.ban(userId);
            setSuccess(`${username} a été banni`);
            loadAdminData();
        } catch (err) {
            setError(err.message || 'Impossible de bannir');
        }
    };

    const handleUnban = async (userId, username) => {
        if (!confirm(`Êtes-vous sûr de vouloir débannir ${username} ?`)) return;
        try {
            await authService.unban(userId);
            setSuccess(`${username} a été débanni`);
            loadAdminData();
        } catch (err) {
            setError(err.message || 'Impossible de débannir');
        }
    };

    const handleSetSubscription = async (player, tier) => {
        setUpdatingSubscriptionId(player.id);
        setError(null);
        try {
            const data = await authService.setUserSubscription(player.id, tier);
            setSuccess(`${player.username} : ${data.message}`);
            const usersData = await authService.getUsers();
            setPlayers(Array.isArray(usersData.users) ? usersData.users : []);
        } catch (err) {
            setError(err.message || 'Impossible de modifier l’offre');
        } finally {
            setUpdatingSubscriptionId(null);
        }
    };

    return (
        <div className="site-page admin-page paper border-4 shadow-large min-h-[calc(100vh-4rem)] px-4 py-8 text-white">
            <div className="mx-auto max-w-4xl space-y-6">
                <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Admin</p>
                    <h1 className="mt-2 text-3xl font-semibold">{t('admin.title')}</h1>
                    <p className="mt-2 text-sm text-slate-300">
                        {t('admin.subtitle')}
                    </p>
                </div>
                {error && <p className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
                {success && <p className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-800 rounded-lg px-3 py-2">{success}</p>}
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={loadAdminData}
                        className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                    >
                        {t('admin.refresh')}
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/admin/articles')}
                        className="rounded-full border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                        {t('admin.view_articles')}
                    </button>
                    <button
                        type="button"
                        onClick={handleToggleOffline}
                        disabled={updatingOffline}
                        className={`rounded-full px-5 py-3 text-sm font-semibold transition disabled:opacity-60 ${offline
                            ? 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
                            : 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                            }`}
                    >
                        {updatingOffline
                            ? t('admin.updating')
                            : offline
                                ? t('admin.disable_offline')
                                : t('admin.enable_offline')}
                    </button>
                    <button
                        type="button"
                        onClick={handleToggleCheat}
                        disabled={updatingCheat}
                        className={`rounded-full px-5 py-3 text-sm font-semibold transition disabled:opacity-60 ${adminCheat
                            ? 'bg-purple-500 text-white hover:bg-purple-400 shadow-lg shadow-purple-950/40'
                            : 'bg-slate-900 text-purple-300 border border-purple-800 hover:bg-slate-800'
                            }`}
                    >
                        {updatingCheat
                            ? t('admin.updating')
                            : adminCheat
                                ? t('admin.disable_cheat')
                                : t('admin.enable_cheat')}
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-6 text-xs text-slate-300">
                    <p>
                        Etat global: <strong className={offline ? 'text-amber-300' : 'text-emerald-300'}>{offline ? 'parcours offline demo pour tous les comptes' : 'online'}</strong>
                    </p>
                    <p>
                        Triche admin (Lien direct cible): <strong className={adminCheat ? 'text-purple-400 font-bold' : 'text-slate-400'}>{adminCheat ? t('admin.cheat_status_active') : t('admin.cheat_status_inactive')}</strong>
                    </p>
                </div>

                {loading && <p className="text-slate-300">{t('admin.loading_roll')}</p>}
                {error && <p className="text-red-300">{error}</p>}

                {roll && !loading && (
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-cyan-950/20">
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{t('admin.start')}</p>
                            <p className="mt-3 text-3xl font-bold text-cyan-300">{roll.startArticle}</p>
                            <p className="mt-3 text-sm text-slate-400">{t('admin.theme')}: {roll.startTheme}</p>
                        </div>

                        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-fuchsia-950/20 flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between">
                                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{t('admin.target')}</p>
                                    {adminCheat && (
                                        <span className="rounded-full bg-purple-950/90 px-2.5 py-0.5 text-[11px] font-semibold text-purple-300 border border-purple-700">
                                            ⚡ Triche active
                                        </span>
                                    )}
                                </div>
                                <p className="mt-3 text-3xl font-bold text-fuchsia-300">{roll.targetArticle}</p>
                                <p className="mt-3 text-sm text-slate-400">{t('admin.theme')}: {roll.targetTheme}</p>
                            </div>
                            {adminCheat && (
                                <a
                                    href={`https://fr.wikipedia.org/wiki/${encodeURIComponent(roll.targetArticle)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-4 inline-flex items-center gap-2 rounded-xl border border-purple-700/60 bg-purple-950/40 px-3.5 py-2 text-xs font-semibold text-purple-300 transition hover:bg-purple-900/60"
                                >
                                    <span>⚡ Accéder directement au lien wiki de fin (Wikipedia)</span>
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                </a>
                            )}
                        </div>
                    </div>
                )}

                {!loading && players.length > 0 && (
                    <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-2xl shadow-slate-950/30">
                        <div className="mb-3 flex items-center justify-between">
                            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{t('admin.players')}</p>
                            <p className="text-xs text-slate-400">{t('admin.accounts', { count: players.length })}</p>
                        </div>

                        <div className="max-h-80 overflow-auto rounded-xl border border-slate-800">
                            <table className="w-full border-collapse text-sm">
                                <thead className="sticky top-0 bg-slate-950/95 text-left text-slate-300">
                                    <tr>
                                        <th className="px-3 py-2 font-semibold">{t('admin.username')}</th>
                                        <th className="px-3 py-2 font-semibold">Email</th>
                                        <th className="px-3 py-2 font-semibold">{t('admin.role')}</th>
                                        <th className="px-3 py-2 font-semibold">Offre</th>
                                        <th className="px-3 py-2 font-semibold">{t('admin.status')}</th>
                                        <th className="px-3 py-2 font-semibold">{t('admin.action')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {players.map((player) => (
                                        <tr key={player.id} className="border-t border-slate-800/80 text-slate-200">
                                            <td className="px-3 py-2">{player.username}</td>
                                            <td className="px-3 py-2 text-slate-300">{player.email}</td>
                                            <td className="px-3 py-2">
                                                <span className="rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 text-xs uppercase tracking-[0.08em] text-cyan-300">
                                                    {player.role}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2">
                                                {player.role === 'admin' ? (
                                                    <span className="text-xs text-amber-300">Gold inclus</span>
                                                ) : (
                                                    <div className="flex gap-1">
                                                        {['free', 'silver', 'gold'].map((tier) => (
                                                            <button
                                                                type="button"
                                                                key={tier}
                                                                onClick={() => handleSetSubscription(player, tier)}
                                                                disabled={updatingSubscriptionId === player.id || player.subscription_tier === tier}
                                                                className="rounded border border-slate-700 px-1.5 py-0.5 text-[11px] uppercase text-slate-200 disabled:opacity-40"
                                                            >
                                                                {tier}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-3 py-2">
                                                <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${player.banned_at ? 'border-red-700 bg-red-950/50 text-red-300' : 'border-emerald-700 bg-emerald-950/50 text-emerald-300'}`}>
                                                    {player.banned_at ? t('admin.banned') : t('admin.active')}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 flex gap-1">
                                                {player.banned_at ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUnban(player.id, player.username)}
                                                        className="rounded-full border border-emerald-700 px-2 py-0.5 text-xs text-emerald-300 hover:bg-emerald-950/30"
                                                    >
                                                        {t('admin.unban')}
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleBan(player.id, player.username)}
                                                        className="rounded-full border border-red-700 px-2 py-0.5 text-xs text-red-300 hover:bg-red-950/30"
                                                    >
                                                        {t('admin.ban')}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {!loading && quizUsage && (
                    <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-2xl shadow-slate-950/30">
                        <div className="mb-3 flex items-center justify-between">
                            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Consommation IA quiz knowledge</p>
                            <p className="text-xs text-slate-400">Mode: Gemini</p>
                        </div>

                        <div className={`grid gap-3 ${hasTokenUsageInfo ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
                            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Appels</p>
                                <p className="mt-2 text-2xl font-semibold text-cyan-300">{quizUsage.totalCalls || 0}</p>
                                <p className="mt-1 text-xs text-slate-400">OK: {quizUsage.successCalls || 0} | KO: {quizUsage.failedCalls || 0}</p>
                            </div>
                            {hasTokenUsageInfo && (
                                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Prompt tokens</p>
                                    <p className="mt-2 text-2xl font-semibold text-amber-300">{quizUsage.totalPromptTokens || 0}</p>
                                </div>
                            )}
                            {hasTokenUsageInfo && (
                                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Total tokens</p>
                                    <p className="mt-2 text-2xl font-semibold text-fuchsia-300">{quizUsage.totalTokens || 0}</p>
                                    <p className="mt-1 text-xs text-slate-400">Generation: {quizUsage.totalCandidateTokens || 0}</p>
                                </div>
                            )}
                        </div>

                        <div className={`mt-3 grid gap-3 ${hasTokenUsageInfo ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
                            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Reste aujourd hui (appels)</p>
                                <p className="mt-2 text-2xl font-semibold text-emerald-300">{remainingDailyCalls}</p>
                                <p className="mt-1 text-xs text-slate-400">Utilises: {dailyCalls} / Limite: {dailyRequestLimit}</p>
                            </div>
                            {hasTokenUsageInfo && (
                                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Reste aujourd hui (tokens)</p>
                                    <p className="mt-2 text-2xl font-semibold text-sky-300">{remainingDailyTokens ?? 'N/A'}</p>
                                    <p className="mt-1 text-xs text-slate-400">
                                        Utilises: {dailyTotalTokens}
                                        {' / Limite: '}
                                        {dailyTokenLimit !== null ? dailyTokenLimit : 'non definie'}
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="mt-3 text-xs text-slate-400">
                            Dernier appel: {quizUsage.lastCallAt ? new Date(quizUsage.lastCallAt).toLocaleString() : 'aucun'}
                            {quizUsage.lastError ? ` | Derniere erreur: ${quizUsage.lastError}` : ''}
                        </div>

                        {Array.isArray(quizUsage.recentCalls) && quizUsage.recentCalls.length > 0 && (
                            <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-slate-800">
                                <table className="w-full border-collapse text-xs">
                                    <thead className="sticky top-0 bg-slate-950/95 text-left text-slate-300">
                                        <tr>
                                            <th className="px-3 py-2 font-semibold">Date</th>
                                            <th className="px-3 py-2 font-semibold">Statut</th>
                                            <th className="px-3 py-2 font-semibold">Modele</th>
                                            <th className="px-3 py-2 font-semibold">Tokens</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {quizUsage.recentCalls.slice(0, 12).map((entry, index) => (
                                            <tr key={`${entry.at}-${index}`} className="border-t border-slate-800/80 text-slate-200">
                                                <td className="px-3 py-2">{entry.at ? new Date(entry.at).toLocaleString() : '-'}</td>
                                                <td className="px-3 py-2">
                                                    <span className={`rounded-full border px-2 py-0.5 ${entry.ok ? 'border-emerald-700 bg-emerald-950/50 text-emerald-300' : 'border-rose-700 bg-rose-950/40 text-rose-300'}`}>
                                                        {entry.ok ? 'OK' : 'KO'}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-slate-300">{entry.model || '-'}</td>
                                                <td className="px-3 py-2 text-slate-300">{entry.totalTokens || 0}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Section signalements */}
            <div className="mt-8 rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-2xl shadow-slate-950/30">
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{t('admin.reports')}</p>
                        {reportsPending > 0 && (
                            <span className="mt-1 inline-block rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                                {reportsPending} en attente
                            </span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {['pending', 'reviewed', 'dismissed', ''].map((f) => (
                            <button
                                key={f}
                                type="button"
                                onClick={() => handleFilterReports(f)}
                                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${reportsFilter === f ? 'bg-cyan-400 text-slate-950' : 'border border-slate-700 text-slate-300 hover:bg-slate-800'}`}
                            >
                                {f === '' ? 'Tous' : f === 'pending' ? 'En attente' : f === 'reviewed' ? 'Traités' : 'Rejetés'}
                            </button>
                        ))}
                    </div>
                </div>

                {reports.length === 0 ? (
                    <p className="text-sm text-slate-500">Aucun signalement{reportsFilter ? ` (${reportsFilter})` : ''}.</p>
                ) : (
                    <div className="max-h-80 overflow-auto rounded-xl border border-slate-800">
                        <table className="w-full border-collapse text-sm">
                            <thead className="sticky top-0 bg-slate-950/95 text-left text-slate-300">
                                <tr>
                                    <th className="px-3 py-2 font-semibold">Date</th>
                                    <th className="px-3 py-2 font-semibold">Rapporteur</th>
                                    <th className="px-3 py-2 font-semibold">Signalé</th>
                                    <th className="px-3 py-2 font-semibold">Message</th>
                                    <th className="px-3 py-2 font-semibold">Image</th>
                                    <th className="px-3 py-2 font-semibold">Statut</th>
                                    <th className="px-3 py-2 font-semibold">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reports.map((r) => (
                                    <tr key={r.id} className="border-t border-slate-800/80 text-slate-200">
                                        <td className="px-3 py-2 text-xs text-slate-400 whitespace-nowrap">
                                            {new Date(r.created_at).toLocaleString()}
                                        </td>
                                        <td className="px-3 py-2 font-medium text-cyan-300">{r.reporter_username}</td>
                                        <td className="px-3 py-2 font-medium text-red-300">{r.reported_username}</td>
                                        <td className="px-3 py-2 max-w-xs">
                                            <span className="block truncate text-xs text-slate-300">{r.message}</span>
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            {r.has_image ? '🖼️' : '—'}
                                        </td>
                                        <td className="px-3 py-2">
                                            <span className={`rounded-full border px-2 py-0.5 text-xs ${r.status === 'pending'
                                                    ? 'border-amber-700 bg-amber-950/50 text-amber-300'
                                                    : r.status === 'reviewed'
                                                        ? 'border-emerald-700 bg-emerald-950/50 text-emerald-300'
                                                        : 'border-slate-700 bg-slate-950/50 text-slate-400'
                                                }`}>
                                                {r.status === 'pending' ? 'En attente' : r.status === 'reviewed' ? 'Traité' : 'Rejeté'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2">
                                            <button
                                                type="button"
                                                onClick={() => handleOpenReport(r)}
                                                className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
                                            >
                                                Voir
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal détail signalement */}
            {selectedReport && (
                <div
                    className="antique-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
                    onClick={(e) => e.target === e.currentTarget && setSelectedReport(null)}
                >
                    <div className="antique-modal paper border-4 shadow-large w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
                        <div className="mb-4 flex items-start justify-between">
                            <div>
                                <p className="text-xs uppercase tracking-widest text-red-400">Signalement #{selectedReport.id}</p>
                                <h2 className="mt-1 text-lg font-semibold text-white">
                                    <span className="text-cyan-300">{selectedReport.reporter_username}</span>
                                    {' signale '}
                                    <span className="text-red-300">{selectedReport.reported_username}</span>
                                </h2>
                                <p className="text-xs text-slate-500">{new Date(selectedReport.created_at).toLocaleString()}</p>
                            </div>
                            <button type="button" onClick={() => { setSelectedReport(null); setReportDetail(null); }} className="text-slate-500 hover:text-white text-xl">✕</button>
                        </div>

                        <div className="mb-4 rounded-xl border border-slate-800 bg-slate-800/60 p-3">
                            <p className="mb-1 text-xs uppercase tracking-wider text-slate-400">Message</p>
                            <p className="text-sm text-white whitespace-pre-wrap">{reportDetail?.message || selectedReport.message}</p>
                        </div>

                        {reportDetail?.image_data && (
                            <div className="mb-4">
                                <p className="mb-1 text-xs uppercase tracking-wider text-slate-400">Capture d'écran</p>
                                <img
                                    src={reportDetail.image_data}
                                    alt="Capture signalement"
                                    className="w-full rounded-xl border border-slate-700 object-contain max-h-64"
                                />
                            </div>
                        )}

                        {selectedReport.admin_note && (
                            <div className="mb-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                <p className="mb-1 text-xs uppercase tracking-wider text-slate-400">Note admin précédente</p>
                                <p className="text-sm text-slate-300">{selectedReport.admin_note}</p>
                            </div>
                        )}

                        {selectedReport.status === 'pending' && (
                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => handleUpdateReport(selectedReport.id, 'reviewed')}
                                    disabled={updatingReport}
                                    className="flex-1 rounded-full bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                                >
                                    ✅ Traiter
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleUpdateReport(selectedReport.id, 'dismissed')}
                                    disabled={updatingReport}
                                    className="flex-1 rounded-full border border-slate-700 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60"
                                >
                                    🗑️ Rejeter
                                </button>
                            </div>
                        )}
                        {selectedReport.status !== 'pending' && (
                            <p className="text-center text-xs text-slate-500 pt-2">Ce signalement a déjà été traité.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default Admin;
