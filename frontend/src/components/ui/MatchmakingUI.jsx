import { Compass, Play, Users, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { resolveMediaUrl } from '../../services/api.js';

function MatchmakingUI({ mode, players, targetSize = 8, onCancel, onStartNow }) {
    const { t } = useTranslation();
    const displayPlayers = Array.isArray(players) ? players : [];
    const progress = Math.max(0, Math.min(100, (displayPlayers.length / targetSize) * 100));

    return (
        <div className="matchmaking-backdrop fixed inset-0 z-50 flex items-center justify-center">
            <section className="matchmaking-dialog" aria-labelledby="matchmaking-title" aria-live="polite">
                <button type="button" className="matchmaking-close" onClick={onCancel} aria-label={t('matchmaking.cancel_label')}>
                    <X size={20} aria-hidden="true" />
                </button>

                <div className="matchmaking-compass" aria-hidden="true">
                    <span className="matchmaking-orbit"><i /><i /><i /></span>
                    <Compass size={42} strokeWidth={1.4} />
                </div>

                <p className="matchmaking-kicker">{t('matchmaking.kicker')}</p>
                <h2 id="matchmaking-title">{t('matchmaking.title')}</h2>
                <p className="matchmaking-mode">{t(`home.${mode}_title`)}</p>

                <div className="matchmaking-status">
                    <div>
                        <Users size={19} aria-hidden="true" />
                        <span><strong>{displayPlayers.length}/{targetSize}</strong> joueurs prêts</span>
                    </div>
                </div>

                <div className="matchmaking-players" aria-label="Joueurs en attente">
                    {Array.from({ length: targetSize }, (_, index) => {
                        const player = displayPlayers[index];
                        const avatarUrl = resolveMediaUrl(player?.avatar_url);
                        return (
                            <div className={`matchmaking-player${player ? ' is-ready' : ''}`} key={player?.userId || `empty-${index}`}>
                                {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{String(player?.username || '?').slice(0, 1).toUpperCase()}</span>}
                                <small>{player?.username || 'En attente'}</small>
                            </div>
                        );
                    })}
                </div>

                <div className="matchmaking-progress" aria-hidden="true">
                    <span style={{ width: `${progress}%` }} />
                </div>

                <p className="matchmaking-note">La partie démarre à 8 joueurs. Vous pouvez aussi partir avec le groupe actuel.</p>

                <div className="matchmaking-actions">
                    <button type="button" onClick={onStartNow} className="matchmaking-start-now" disabled={displayPlayers.length === 0}>
                        <Play size={17} fill="currentColor" aria-hidden="true" /> Démarrer maintenant ({displayPlayers.length})
                    </button>
                    <button type="button" onClick={onCancel} className="matchmaking-cancel">
                        {t('matchmaking.cancel_label')}
                    </button>
                </div>
            </section>
        </div>
    );
}

export default MatchmakingUI;
