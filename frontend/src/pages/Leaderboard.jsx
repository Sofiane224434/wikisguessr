import { useEffect, useState } from 'react';
import { gameService } from '../services/api.js';

const MODES = [
    { key: 'normal', label: 'Normal' },
    { key: 'chrono', label: 'Chrono' },
    { key: 'knowledge', label: 'Connaissance' }
];

const formatTime = (seconds) => {
    if (seconds === null || seconds === undefined) return '—';
    const m = String(Math.floor(Number(seconds) / 60)).padStart(2, '0');
    const s = String(Number(seconds) % 60).padStart(2, '0');
    return `${m}:${s}`;
};

const rankBadgeClass = (rank) => {
    if (rank === 1) return 'bg-amber-100 text-amber-800 border-amber-300';
    if (rank === 2) return 'bg-slate-100 text-slate-700 border-slate-300';
    if (rank === 3) return 'bg-orange-100 text-orange-700 border-orange-300';
    return 'bg-white text-slate-500 border-slate-200';
};

function LeaderboardTable({ rows, sortBy }) {
    if (!rows || rows.length === 0) {
        return <p className="mt-6 text-center text-slate-500 text-sm">Aucun résultat pour le moment.</p>;
    }

    // Tri selon le choix de l'utilisateur
    const sortedRows = [...rows].sort((a, b) => {
        if (sortBy === 'elo') {
            return (b.elo ?? 1600) - (a.elo ?? 1600);
        } else {
            return parseFloat(b.avg_score) - parseFloat(a.avg_score);
        }
    });

    return (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-[11px] uppercase tracking-widest text-slate-500">
                        <th className="px-4 py-3 text-left">Rang</th>
                        <th className="px-4 py-3 text-left">Joueur</th>
                        <th className="px-4 py-3 text-right">ELO</th>
                        <th className="px-4 py-3 text-right">Moyenne Points</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedRows.map((row, index) => (
                        <tr key={row.username} className="border-b border-slate-50 transition hover:bg-slate-50">
                            <td className="px-4 py-3">
                                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold ${rankBadgeClass(index + 1)}`}>
                                    {index + 1}
                                </span>
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-900">{row.username}</td>
                            <td className="px-4 py-3 text-right font-semibold text-blue-700">
                                {row.elo ?? 1600}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-rose-700">
                                {row.avg_score ? Math.round(row.avg_score) : '—'} pts
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function Leaderboard() {
    const [activeMode, setActiveMode] = useState('normal');
    const [sortBy, setSortBy] = useState('elo');
    const [data, setData] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (data[activeMode]) {
            return;
        }

        setLoading(true);
        setError(null);

        gameService.getLeaderboard(activeMode)
            .then((res) => {
                setData((prev) => ({ ...prev, [activeMode]: res.leaderboard || [] }));
            })
            .catch(() => {
                setError('Impossible de charger le classement.');
            })
            .finally(() => setLoading(false));
    }, [activeMode, data]);

    return (
        <div className="site-page paper border border-3 shadow-large mx-auto w-full max-w-4xl px-4 py-10">
            <h1 className="mb-6 text-3xl font-bold text-slate-900">Classement</h1>

            <div className="mb-6 flex flex-wrap gap-2">
                {MODES.map((m) => (
                    <button
                        key={m.key}
                        type="button"
                        onClick={() => setActiveMode(m.key)}
                        className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${activeMode === m.key ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                    >
                        {m.label}
                    </button>
                ))}
            </div>

            <div className="mb-6">
                <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                    <option value="elo">Trier par ELO</option>
                    <option value="points">Trier par Moyenne Points</option>
                </select>
            </div>

            {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

            {loading ? (
                <p className="text-center text-slate-500">Chargement...</p>
            ) : (
                <LeaderboardTable rows={data[activeMode] || []} sortBy={sortBy} />
            )}
        </div>
    );
}

export default Leaderboard;
