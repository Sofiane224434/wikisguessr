import { useEffect, useState } from 'react';
import { Compass, Hourglass, Users, X } from 'lucide-react';

function MatchmakingUI({ mode, queueSize, timeRemaining, onCancel }) {
    const [displayQueue, setDisplayQueue] = useState(queueSize);

    useEffect(() => {
        setDisplayQueue(queueSize);
    }, [queueSize]);

    const modeLabels = {
        normal: 'Exploration classique',
        chrono: 'Course contre la montre',
        knowledge: 'Défi connaissance'
    };
    const progress = Math.max(0, Math.min(100, ((30 - timeRemaining) / 30) * 100));

    return (
        <div className="matchmaking-backdrop fixed inset-0 z-50 flex items-center justify-center">
            <section className="matchmaking-dialog" aria-labelledby="matchmaking-title" aria-live="polite">
                <button type="button" className="matchmaking-close" onClick={onCancel} aria-label="Annuler la recherche">
                    <X size={20} aria-hidden="true" />
                </button>

                <div className="matchmaking-compass" aria-hidden="true">
                    <span className="matchmaking-orbit"><i /><i /><i /></span>
                    <Compass size={42} strokeWidth={1.4} />
                </div>

                <p className="matchmaking-kicker">Matchmaking en cours</p>
                <h2 id="matchmaking-title">Recherche d’explorateurs</h2>
                <p className="matchmaking-mode">{modeLabels[mode]}</p>

                <div className="matchmaking-status">
                    <div>
                        <Users size={19} aria-hidden="true" />
                        <span><strong>{displayQueue}</strong> {displayQueue === 1 ? 'joueur en attente' : 'joueurs en attente'}</span>
                    </div>
                    <div>
                        <Hourglass size={19} aria-hidden="true" />
                        <span><strong>{timeRemaining}s</strong> avant partie solo</span>
                    </div>
                </div>

                <div className="matchmaking-progress" aria-hidden="true">
                    <span style={{ width: `${progress}%` }} />
                </div>

                <p className="matchmaking-note">La partie démarrera avec les explorateurs trouvés et complétera les places restantes si nécessaire.</p>

                <button type="button" onClick={onCancel} className="matchmaking-cancel">
                    Annuler la recherche
                </button>
            </section>
        </div>
    );
}

export default MatchmakingUI;
