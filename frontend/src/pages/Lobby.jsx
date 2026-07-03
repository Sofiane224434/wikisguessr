import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gameService } from '../services/api.js';

const MODE_LABELS = {
    normal: 'Normal',
    knowledge: 'Connaissance'
};

function Lobby() {
    const navigate = useNavigate();
    const [mode, setMode] = useState('normal');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    useEffect(() => {
        // Rien à charger ici: le lobby sert seulement à démarrer une nouvelle partie.
    }, []);

    const toggleMode = () => {
        setMode((prev) => (prev === 'normal' ? 'knowledge' : 'normal'));
    };

    const handleCreateGame = async () => {
        setError(null);
        setSuccess(null);
        setLoading(true);

        try {
            const data = await gameService.create({
                mode
            });

            setSuccess(`Partie creee avec succes. Code: ${data.game.code}`);
            navigate(`/game?code=${encodeURIComponent(data.game.code)}`);
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
                <h2 className="mb-4 text-xl font-semibold text-slate-900">Lancer une partie</h2>
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={toggleMode}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-slate-900"
                    >
                        Mode: {MODE_LABELS[mode]}
                    </button>
                    <button
                        type="button"
                        onClick={handleCreateGame}
                        disabled={loading}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
                    >
                        {loading ? 'Lancement...' : 'Lancer'}
                    </button>
                </div>

                {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
                {success && <p className="mt-3 text-sm text-emerald-700">{success}</p>}
            </div>
        </div>
    );
}

export default Lobby;
