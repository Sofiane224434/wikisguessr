import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService, gameService, siteService, reportService } from '../services/api.js';

function Admin() {
    const navigate = useNavigate();
    const [roll, setRoll] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
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
            setOffline(isOffline);

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

    return (
        <div className="min-h-[calc(100vh-4rem)] bg-slate-950 px-4 py-8 text-white">
            <div className="mx-auto max-w-4xl space-y-6">
                <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Admin</p>
                    <h1 className="mt-2 text-3xl font-semibold">Aperçu rapide du roll</h1>
                    <p className="mt-2 text-sm text-slate-300">
                        Deux mots d’un même thème ne tombent pas ensemble. Le bouton régénère une paire start / cible.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={loadAdminData}
                        className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                    >
                        Rafraichir
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/admin/articles')}
                        className="rounded-full border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                        Voir tous les articles
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
                            ? 'Mise a jour...'
                            : offline
                                ? 'Desactiver parcours offline global'
                                : 'Activer parcours offline global'}
                    </button>
                </div>

                <p className="text-xs text-slate-300">
                    Etat global: <strong className={offline ? 'text-amber-300' : 'text-emerald-300'}>{offline ? 'parcours offline demo pour tous les comptes' : 'online'}</strong>
                </p>

                {loading && <p className="text-slate-300">Chargement du roll...</p>}
                {error && <p className="text-red-300">{error}</p>}

                {roll && !loading && (
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-cyan-950/20">
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Départ</p>
                            <p className="mt-3 text-3xl font-bold text-cyan-300">{roll.startArticle}</p>
                            <p className="mt-3 text-sm text-slate-400">Thème: {roll.startTheme}</p>
                        </div>

                        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-fuchsia-950/20">
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Cible</p>
                            <p className="mt-3 text-3xl font-bold text-fuchsia-300">{roll.targetArticle}</p>
                            <p className="mt-3 text-sm text-slate-400">Thème: {roll.targetTheme}</p>
                        </div>
                    </div>
                )}

                {!loading && players.length > 0 && (
                    <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-2xl shadow-slate-950/30">
                        <div className="mb-3 flex items-center justify-between">
                            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Joueurs</p>
                            <p className="text-xs text-slate-400">{players.length} comptes</p>
                        </div>

                        <div className="max-h-80 overflow-auto rounded-xl border border-slate-800">
                            <table className="w-full border-collapse text-sm">
                                <thead className="sticky top-0 bg-slate-950/95 text-left text-slate-300">
                                    <tr>
                                        <th className="px-3 py-2 font-semibold">Pseudo</th>
                                        <th className="px-3 py-2 font-semibold">Email</th>
                                        <th className="px-3 py-2 font-semibold">Role</th>
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
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Signalements joueurs</p>
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
                                            <span className={`rounded-full border px-2 py-0.5 text-xs ${
                                                r.status === 'pending'
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
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
                    onClick={(e) => e.target === e.currentTarget && setSelectedReport(null)}
                >
                    <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
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
