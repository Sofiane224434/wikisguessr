import { useTranslation } from 'react-i18next';

const MODES = {
    normal: {
        ruleCount: 4,
        icon: '🧭'
    },
    chrono: {
        ruleCount: 5,
        icon: '🏃'
    },
    knowledge: {
        ruleCount: 5,
        icon: '📚'
    }
};

/**
 * Langues qui ont une édition Wikipédia suffisamment grande et utilisée dans le jeu.
 * Si la langue de l'interface n'est pas dans cette liste, le jeu utilisera Wikipedia EN.
 */
const WIKIPEDIA_SUPPORTED_LANGS = new Set([
    'fr', 'en', 'es', 'de', 'pt', 'it', 'nl', 'pl', 'ru', 'sv',
    'zh', 'ja', 'ar', 'ko', 'uk', 'id', 'vi', 'fa', 'tr', 'he',
    'no', 'fi', 'cs', 'ca', 'hu', 'ro', 'el', 'sr', 'bg', 'hr',
    'sk', 'da', 'lt', 'sl', 'ms', 'eu', 'eo', 'et', 'lv', 'simple'
]);

function GameModeModal({ mode, onClose, onConfirm }) {
    const { t, i18n } = useTranslation();
    const modeInfo = MODES[mode];
    if (!modeInfo) return null;

    const uiLang = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0].toLowerCase();
    const wikiLangSupported = WIKIPEDIA_SUPPORTED_LANGS.has(uiLang);

    return (
        <div
            className="antique-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="antique-modal paper border-2 shadow-large w-full max-w-md p-6">
                <div className="text-center mb-5">
                    <span className="text-5xl">{modeInfo.icon}</span>
                    <h2 className="mt-3 text-2xl font-bold">{t(`mode_modal.${mode}_title`)}</h2>
                    <p className="mt-1 text-sm">{t(`mode_modal.${mode}_description`)}</p>
                </div>

                {/* Avertissement Wikipedia langue non supportée */}
                {!wikiLangSupported && (
                    <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
                        <span className="text-lg leading-none mt-0.5" aria-hidden="true">⚠️</span>
                        <p className="text-sm leading-snug">
                            {t('mode_modal.wiki_lang_unsupported', {
                                lang: uiLang.toUpperCase(),
                                defaultValue: `Wikipédia n'est pas disponible en "${uiLang.toUpperCase()}". Le jeu utilisera la version Anglaise de Wikipédia.`
                            })}
                        </p>
                    </div>
                )}

                <div className="mb-6 max-h-48 overflow-y-auto">
                    <p className="text-xs uppercase tracking-widest mb-2">{t('mode_modal.rules')}</p>
                    <ul className="space-y-1">
                        {Array.from({ length: modeInfo.ruleCount }, (_, index) => (
                            <li key={index} className="text-sm flex gap-2">
                                <span className="shrink-0">•</span>
                                <span>{t(`mode_modal.${mode}_rule_${index + 1}`)}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 rounded-full border py-2 text-sm hover:opacity-80"
                    >
                        {t('mode_modal.change')}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="flex-1 rounded-full bg-cyan-600 py-2 text-sm font-semibold text-white hover:bg-cyan-500"
                    >
                        {t('mode_modal.launch')}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default GameModeModal;
