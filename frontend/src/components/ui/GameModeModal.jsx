const MODES = {
    normal: {
        title: '🎮 Mode Normal',
        description: 'Trouvez votre chemin de l\'article de départ à la cible.',
        rules: [
            'Vous avez un nombre illimité de coups pour atteindre la cible',
            'Chaque lien suivi enregistre votre progression',
            'Le but est d\'arriver à la cible en un minimum de clics',
            'Vous ne pouvez pas revenir en arrière sur le même lien'
        ],
        icon: '🧭'
    },
    chrono: {
        title: '⏱️ Mode Chrono',
        description: 'Gagnez de la vitesse! Vous avez 5 minutes et 300 points.',
        rules: [
            'Départ : 5 minutes et 300 points',
            'Les points baissent de 1 toutes les 2 secondes',
            'Chaque lien suivi ajoute 5 secondes mais retire 10 points',
            'La partie s\'arrête si le temps ou les points atteignent 0',
            'Atteindre la cible avant la fin = victoire'
        ],
        icon: '🏃'
    },
    knowledge: {
        title: '🧠 Mode Connaissance',
        description: 'Testez vos connaissances avec un quiz IA après la victoire.',
        rules: [
            'Similaire au mode Normal',
            'Quand vous atteindrez la cible, vous aurez un quiz basé sur votre parcours',
            'Le quiz comporte 5 questions à choix multiples',
            'Votre score au quiz (0-5) affectera votre classement final',
            'Les questions sont générées par IA sur votre historique'
        ],
        icon: '📚'
    }
};

function GameModeModal({ mode, onClose, onConfirm }) {
    const modeInfo = MODES[mode];
    if (!modeInfo) return null;

    return (
        <div
            className="antique-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="antique-modal paper border border-2 shadow-large w-full max-w-md p-6">
                <div className="text-center mb-6">
                    <span className="text-5xl">{modeInfo.icon}</span>
                    <h2 className="mt-3 text-2xl font-bold text-white">{modeInfo.title}</h2>
                    <p className="mt-1 text-sm text-slate-400">{modeInfo.description}</p>
                </div>

                <div className="mb-6 max-h-48 overflow-y-auto">
                    <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">Règles</p>
                    <ul className="space-y-1">
                        {modeInfo.rules.map((rule, i) => (
                            <li key={i} className="text-sm text-slate-300 flex gap-2">
                                <span className="flex-shrink-0">•</span>
                                <span>{rule}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 rounded-full border border-slate-700 py-2 text-sm text-slate-300 hover:bg-slate-800"
                    >
                        Changer de mode
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="flex-1 rounded-full bg-cyan-600 py-2 text-sm font-semibold text-white hover:bg-cyan-500"
                    >
                        Lancer!
                    </button>
                </div>
            </div>
        </div>
    );
}

export default GameModeModal;
