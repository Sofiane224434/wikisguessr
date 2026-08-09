import { useEffect, useState } from 'react';

function MatchmakingUI({ mode, queueSize, timeRemaining, onCancel, onFound }) {
    const [displayQueue, setDisplayQueue] = useState(queueSize);

    useEffect(() => {
        setDisplayQueue(queueSize);
    }, [queueSize]);

    const modeLabels = {
        normal: '🎮 Normal',
        chrono: '⏱️ Chrono',
        knowledge: '🧠 Connaissance'
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-2xl text-center">
                {/* Spinner */}
                <div className="mb-6 flex justify-center">
                    <div className="relative w-16 h-16">
                        <div className="absolute inset-0 rounded-full border-4 border-slate-700"></div>
                        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-cyan-500 border-r-cyan-500 animate-spin"></div>
                    </div>
                </div>

                {/* Title */}
                <h2 className="text-2xl font-bold text-white mb-2">Recherche d'adversaires</h2>
                <p className="text-slate-400 mb-6">{modeLabels[mode]}</p>

                {/* Queue info */}
                <div className="mb-4 rounded-lg bg-slate-800 p-3">
                    <p className="text-sm text-slate-300">
                        <span className="text-lg font-bold text-cyan-400">{displayQueue}</span>
                        {displayQueue === 1 ? ' joueur' : ' joueurs'} en attente
                    </p>
                </div>

                {/* Timer */}
                <div className="mb-6">
                    <p className="text-xs text-slate-500 uppercase tracking-widest">Temps restant</p>
                    <p className="mt-1 text-3xl font-bold text-white">{timeRemaining}s</p>
                </div>

                {/* Info */}
                <p className="mb-6 text-xs text-slate-400">
                    Si on trouve au moins 1 adversaire, la partie lancera avec des bots pour les autres slots.
                </p>

                {/* Cancel button */}
                <button
                    type="button"
                    onClick={onCancel}
                    className="w-full rounded-full bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-500 transition-colors"
                >
                    Annuler la recherche
                </button>
            </div>
        </div>
    );
}

export default MatchmakingUI;
