import { useEffect, useState } from 'react';
import { gameService } from '../services/api.js';

function Admin() {
    const [roll, setRoll] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadRoll = async () => {
        setLoading(true);
        setError(null);

        try {
            const data = await gameService.getRandomRoll();
            setRoll(data.roll);
        } catch (err) {
            setError(err.message || 'Impossible de charger le roll');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadRoll();
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

                <button
                    type="button"
                    onClick={loadRoll}
                    className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                    Nouveau roll
                </button>

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
            </div>
        </div>
    );
}

export default Admin;
