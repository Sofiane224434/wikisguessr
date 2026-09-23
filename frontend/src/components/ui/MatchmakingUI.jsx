import { Brain, Clock3, Compass, Globe, Play, Sparkles, Users, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { resolveMediaUrl } from '../../services/api.js';

const MODE_META = {
    normal: {
        icon: <Compass size={22} className="text-teal-700" />,
        badgeClass: 'is-normal',
        titleKey: 'mode_modal.normal_title',
        descKey: 'mode_modal.normal_description',
        rules: [
            'mode_modal.normal_rule_1',
            'mode_modal.normal_rule_2',
            'mode_modal.normal_rule_3'
        ]
    },
    chrono: {
        icon: <Clock3 size={22} className="text-amber-700" />,
        badgeClass: 'is-chrono',
        titleKey: 'mode_modal.chrono_title',
        descKey: 'mode_modal.chrono_description',
        rules: [
            'mode_modal.chrono_rule_1',
            'mode_modal.chrono_rule_3',
            'mode_modal.chrono_rule_5'
        ]
    },
    knowledge: {
        icon: <Brain size={22} className="text-rose-800" />,
        badgeClass: 'is-knowledge',
        titleKey: 'mode_modal.knowledge_title',
        descKey: 'mode_modal.knowledge_description',
        rules: [
            'mode_modal.knowledge_rule_1',
            'mode_modal.knowledge_rule_2',
            'mode_modal.knowledge_rule_4'
        ]
    }
};

const WIKIPEDIA_SUPPORTED_LANGS = new Set([
    'fr', 'en', 'es', 'de', 'pt', 'it', 'nl', 'pl', 'ru', 'sv',
    'zh', 'ja', 'ar', 'ko', 'uk', 'id', 'vi', 'fa', 'tr', 'he',
    'no', 'fi', 'cs', 'ca', 'hu', 'ro', 'el', 'sr', 'bg', 'hr',
    'sk', 'da', 'lt', 'sl', 'ms', 'eu', 'eo', 'et', 'lv', 'simple'
]);

function MatchmakingUI({ mode = 'normal', players, targetSize = 8, onCancel, onStartNow }) {
    const { t, i18n } = useTranslation();
    const displayPlayers = Array.isArray(players) ? players : [];
    const progress = Math.max(0, Math.min(100, (displayPlayers.length / targetSize) * 100));

    const currentMode = MODE_META[mode] || MODE_META.normal;
    const uiLang = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0].toLowerCase();
    const wikiLangSupported = WIKIPEDIA_SUPPORTED_LANGS.has(uiLang);

    return (
        <div className="matchmaking-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
            <section className="matchmaking-dialog is-wide paper border-2 shadow-large" aria-labelledby="matchmaking-title" aria-live="polite">
                <button type="button" className="matchmaking-close" onClick={onCancel} aria-label={t('matchmaking.cancel_label')} title={t('matchmaking.cancel_label')}>
                    <X size={20} aria-hidden="true" />
                </button>

                <div className="matchmaking-split-grid">
                    {/* Colonne gauche : Explications rapides du mode de jeu */}
                    <div className="matchmaking-mode-panel">
                        <div className="matchmaking-mode-header">
                            <span className="matchmaking-mode-badge-icon">{currentMode.icon}</span>
                            <div>
                                <span className="matchmaking-kicker">{t('lobby.game_mode', { defaultValue: 'Mode de jeu' })}</span>
                                <h3 className="matchmaking-mode-heading">{t(currentMode.titleKey)}</h3>
                            </div>
                        </div>

                        <p className="matchmaking-mode-lead">{t(currentMode.descKey)}</p>

                        <div className="matchmaking-rules-card">
                            <h4 className="matchmaking-rules-title">
                                <Sparkles size={14} aria-hidden="true" />
                                <span>{t('mode_modal.rules', { defaultValue: 'Règles rapides' })}</span>
                            </h4>
                            <ul className="matchmaking-rules-list">
                                {currentMode.rules.map((ruleKey, idx) => (
                                    <li key={idx}>
                                        <span className="matchmaking-rule-bullet">•</span>
                                        <span>{t(ruleKey)}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="matchmaking-lang-pill">
                            <Globe size={14} aria-hidden="true" />
                            <span>
                                {wikiLangSupported
                                    ? `Wikipédia ${uiLang.toUpperCase()}`
                                    : t('mode_modal.wiki_lang_unsupported', { lang: uiLang.toUpperCase(), defaultValue: `Wikipédia EN (non dispo en ${uiLang.toUpperCase()})` })}
                            </span>
                        </div>
                    </div>

                    {/* Colonne droite : Radar, file d'attente & actions */}
                    <div className="matchmaking-queue-panel">
                        <div className="matchmaking-queue-header">
                            <div className="matchmaking-compass-mini" aria-hidden="true">
                                <span className="matchmaking-orbit"><i /><i /><i /></span>
                                <Compass size={28} strokeWidth={1.5} />
                            </div>
                            <div>
                                <h2 id="matchmaking-title" className="matchmaking-queue-title">{t('matchmaking.title')}</h2>
                                <div className="matchmaking-count-badge">
                                    <Users size={14} aria-hidden="true" />
                                    <span><strong>{displayPlayers.length}/{targetSize}</strong> explorateurs prêts</span>
                                </div>
                            </div>
                        </div>

                        <div className="matchmaking-progress-bar" aria-hidden="true">
                            <span style={{ width: `${progress}%` }} />
                        </div>

                        <div className="matchmaking-players-grid" aria-label="Joueurs prêts">
                            {Array.from({ length: targetSize }, (_, index) => {
                                const player = displayPlayers[index];
                                const avatarUrl = resolveMediaUrl(player?.avatar_url);
                                return (
                                    <div className={`matchmaking-player-slot${player ? ' is-ready' : ''}`} key={player?.userId || `empty-${index}`}>
                                        {avatarUrl ? (
                                            <img src={avatarUrl} alt="" className="matchmaking-avatar-img" />
                                        ) : (
                                            <span className="matchmaking-avatar-fallback">{String(player?.username || '?').slice(0, 1).toUpperCase()}</span>
                                        )}
                                        <span className="matchmaking-slot-name">{player?.username || '...'}</span>
                                    </div>
                                );
                            })}
                        </div>

                        <p className="matchmaking-footer-note">
                            Départ automatique à {targetSize} joueurs ou immédiat avec le groupe actuel.
                        </p>

                        <div className="matchmaking-actions-row">
                            <button
                                type="button"
                                onClick={onStartNow}
                                className="matchmaking-btn-start"
                                disabled={displayPlayers.length === 0}
                            >
                                <Play size={16} fill="currentColor" aria-hidden="true" />
                                <span>Démarrer ({displayPlayers.length})</span>
                            </button>
                            <button
                                type="button"
                                onClick={onCancel}
                                className="matchmaking-btn-cancel"
                            >
                                {t('matchmaking.cancel_label')}
                            </button>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}

export default MatchmakingUI;
