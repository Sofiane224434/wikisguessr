import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService, gameService } from '../services/api.js';

function Admin() {
    const navigate = useNavigate();
    const [roll, setRoll] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [players, setPlayers] = useState([]);

    const loadAdminData = async () => {
        setLoading(true);
        setError(null);

        try {
            const [rollData, usersData] = await Promise.all([
                gameService.getRandomRoll(),
                authService.getUsers()
            ]);

            setRoll(rollData.roll);
            setPlayers(Array.isArray(usersData.users) ? usersData.users : []);
        } catch (err) {
            setError(err.message || 'Impossible de charger les donnees admin');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAdminData();
    }, []);

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
                </div>

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
            </div>
        </div>
    );
}

export default Admin;
