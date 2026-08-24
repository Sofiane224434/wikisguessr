import { useEffect, useState } from 'react';
import { Compass, Hourglass, Users, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

function MatchmakingUI({ mode, queueSize, timeRemaining, onCancel }) {
    const { t } = useTranslation();
    const [displayQueue, setDisplayQueue] = useState(queueSize);

    useEffect(() => {
        setDisplayQueue(queueSize);
    }, [queueSize]);

    const progress = Math.max(0, Math.min(100, ((30 - timeRemaining) / 30) * 100));

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
                        <span><strong>{displayQueue}</strong> {t(displayQueue === 1 ? 'matchmaking.waiting_one' : 'matchmaking.waiting_many')}</span>
                    </div>
                    <div>
                        <Hourglass size={19} aria-hidden="true" />
                        <span><strong>{timeRemaining}s</strong> {t('matchmaking.solo_in')}</span>
                    </div>
                </div>

                <div className="matchmaking-progress" aria-hidden="true">
                    <span style={{ width: `${progress}%` }} />
                </div>

                <p className="matchmaking-note">{t('matchmaking.note')}</p>

                <button type="button" onClick={onCancel} className="matchmaking-cancel">
                    {t('matchmaking.cancel_label')}
                </button>
            </section>
        </div>
    );
}

export default MatchmakingUI;
