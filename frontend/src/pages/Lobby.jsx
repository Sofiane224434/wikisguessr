import { useEffect, useState } from 'react';
import { gameService } from '../services/api.js';

function Lobby() {
    const [title, setTitle] = useState('');
    const [startArticle, setStartArticle] = useState('');
    const [targetArticle, setTargetArticle] = useState('');
    const [mode, setMode] = useState('normal');
    const [games, setGames] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    const loadGames = async () => {
        try {
            const data = await gameService.getMine();
            setGames(data.games || []);
        } catch {
            setGames([]);
        }
    };

    useEffect(() => {
        loadGames();
    }, []);

    const handleCreateGame = async (event) => {
        event.preventDefault();
        setError(null);
        setSuccess(null);
        setLoading(true);

        try {
            const data = await gameService.create({
                title,
                startArticle,
                targetArticle,
                mode
            });

            setSuccess(`Partie creee avec succes. Code: ${data.game.code}`);
            setTitle('');
            setStartArticle('');
            setTargetArticle('');
            setMode('normal');
            await loadGames();
        } catch (err) {
            setError(err.message || 'Impossible de creer la partie');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-4xl px-4 py-10">
            <h1 className="mb-6 text-3xl font-bold text-slate-900">Lobby</h1>

            <div className="mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-xl font-semibold text-slate-900">Creer une partie</h2>
                <form className="grid gap-4" onSubmit={handleCreateGame}>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="game-title">
                            Titre (optionnel)
                        </label>
                        <input
                            id="game-title"
                            type="text"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Partie rapide"
                        />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="start-article">
                                Article de depart
                            </label>
                            <input
                                id="start-article"
                                type="text"
                                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                                value={startArticle}
                                onChange={(e) => setStartArticle(e.target.value)}
                                placeholder="Paris"
                                required
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="target-article">
                                Article cible
                            </label>
                            <input
                                id="target-article"
                                type="text"
                                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                                value={targetArticle}
                                onChange={(e) => setTargetArticle(e.target.value)}
                                placeholder="Tour Eiffel"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="game-mode">
                            Mode
                        </label>
                        <select
                            id="game-mode"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2"
                            value={mode}
                            onChange={(e) => setMode(e.target.value)}
                        >
                            <option value="normal">Normal</option>
                            <option value="knowledge">Connaissance</option>
                        </select>
                    </div>

                    {error && <p className="text-sm text-red-600">{error}</p>}
                    {success && <p className="text-sm text-emerald-700">{success}</p>}

                    <button
                        type="submit"
                        disabled={loading}
                        className="inline-flex w-fit rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
                    >
                        {loading ? 'Creation...' : 'Creer la partie'}
                    </button>
                </form>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-xl font-semibold text-slate-900">Mes parties recentes</h2>
                {games.length === 0 ? (
                    <p className="text-sm text-slate-600">Aucune partie creee pour le moment.</p>
                ) : (
                    <ul className="space-y-3">
                        {games.map((game) => (
                            <li key={game.id} className="rounded-lg border border-slate-200 p-3">
                                <p className="font-semibold text-slate-900">{game.title}</p>
                                <p className="text-sm text-slate-600">
                                    Code: {game.code} | {game.start_article} {'->'} {game.target_article} | Mode: {game.mode}
                                </p>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

export default Lobby;
