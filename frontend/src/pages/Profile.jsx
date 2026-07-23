import { useEffect, useState } from 'react';
import { useAuth } from '../context/Authcontext.jsx';
import { gameService } from '../services/api.js';

const MODE_LABELS = {
    normal: 'Normal',
    knowledge: 'Connaissance',
    chrono: 'Chrono'
};

const MODE_BADGE = {
    normal: 'border-blue-200 bg-blue-50 text-blue-800',
    knowledge: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    chrono: 'border-rose-200 bg-rose-50 text-rose-800'
};

const formatTime = (seconds) => {
    if (seconds === null || seconds === undefined) return '—';
    const m = String(Math.floor(Number(seconds) / 60)).padStart(2, '0');
    const s = String(Number(seconds) % 60).padStart(2, '0');
    return `${m}:${s}`;
};

const formatDate = (raw) => {
    if (!raw) return '—';
    try {
        return new Date(raw).toLocaleDateString('fr-FR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch {
        return '—';
    }
};

function Profile() {
    const { user } = useAuth();
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        gameService.getHistory()
            .then((res) => {
                setResults(Array.isArray(res.results) ? res.results : []);
            })
            .catch(() => {
                setError('Impossible de charger l\'historique.');
            })
            .finally(() => setLoading(false));
    }, []);

    const totalGames = results.length;
    const wins = results.filter((r) => r.won).length;
    const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

    return (
        <div className="mx-auto w-full max-w-4xl px-4 py-10">
            <h1 className="mb-2 text-3xl font-bold text-slate-900">Profil</h1>
            {user && (
                <p className="mb-6 text-slate-500 text-sm">
                    Connecté en tant que <strong className="text-slate-700">{user.username}</strong>
                    {user.email && ` · ${user.email}`}
                </p>
            )}

            <div className="mb-8 grid grid-cols-3 gap-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
                    <p className="text-2xl font-bold text-slate-900">{totalGames}</p>
                    <p className="mt-1 text-xs uppercase tracking-widest text-slate-500">Parties</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center shadow-sm">
                    <p className="text-2xl font-bold text-emerald-700">{wins}</p>
                    <p className="mt-1 text-xs uppercase tracking-widest text-emerald-600">Victoires</p>
                </div>
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-center shadow-sm">
                    <p className="text-2xl font-bold text-violet-700">{winRate}%</p>
                    <p className="mt-1 text-xs uppercase tracking-widest text-violet-600">Taux de victoire</p>
                </div>
            </div>

            <h2 className="mb-4 text-xl font-semibold text-slate-900">Historique des parties</h2>

            {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

            {loading ? (
                <p className="text-center text-slate-500">Chargement...</p>
            ) : results.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500 text-sm">
                    Aucune partie enregistrée pour l'instant.
                </p>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50 text-[11px] uppercase tracking-widest text-slate-500">
                                <th className="px-4 py-3 text-left">Date</th>
                                <th className="px-4 py-3 text-left">Mode</th>
                                <th className="px-4 py-3 text-left">Départ → Cible</th>
                                <th className="px-4 py-3 text-right">Clics</th>
                                <th className="px-4 py-3 text-right">Temps</th>
                                <th className="px-4 py-3 text-right">Points</th>
                                <th className="px-4 py-3 text-center">Résultat</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.map((r) => {
                                let points = 0;
                                if (r.mode === 'chrono') {
                                    points = r.score;
                                } else if (r.mode === 'knowledge' && r.knowledge_score !== null && r.knowledge_score !== undefined) {
                                    points = r.knowledge_score * 100 + 500 - (r.clicks * 50) - (r.time_seconds / 4);
                                } else if (r.mode === 'normal') {
                                    points = 1000 - (r.clicks * 100) - (r.time_seconds / 2);
                                }
                                return (
                                    <tr key={r.id} className="border-b border-slate-50 transition hover:bg-slate-50">
                                        <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{formatDate(r.played_at)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${MODE_BADGE[r.mode] || 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                                                {MODE_LABELS[r.mode] || r.mode}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-700 max-w-50 truncate">
                                            <span title={`${r.start_article} → ${r.target_article}`}>
                                                {r.start_article} → {r.target_article}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right text-slate-700">{r.clicks}</td>
                                        <td className="px-4 py-3 text-right text-slate-500">{formatTime(r.time_seconds)}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-rose-700">{Math.round(points)} pts</td>
                                        <td className="px-4 py-3 text-center">
                                            {r.won ? (
                                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">Gagné</span>
                                            ) : (
                                                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">Perdu</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default Profile;
