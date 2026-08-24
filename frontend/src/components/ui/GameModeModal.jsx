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

function GameModeModal({ mode, onClose, onConfirm }) {
    const { t } = useTranslation();
    const modeInfo = MODES[mode];
    if (!modeInfo) return null;

    return (
        <div
            className="antique-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="antique-modal paper border-2 shadow-large w-full max-w-md p-6">
                <div className="text-center mb-6">
                    <span className="text-5xl">{modeInfo.icon}</span>
                    <h2 className="mt-3 text-2xl font-bold text-white">{t(`mode_modal.${mode}_title`)}</h2>
                    <p className="mt-1 text-sm text-slate-400">{t(`mode_modal.${mode}_description`)}</p>
                </div>

                <div className="mb-6 max-h-48 overflow-y-auto">
                    <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">{t('mode_modal.rules')}</p>
                    <ul className="space-y-1">
                        {Array.from({ length: modeInfo.ruleCount }, (_, index) => (
                            <li key={index} className="text-sm text-slate-300 flex gap-2">
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
                        className="flex-1 rounded-full border border-slate-700 py-2 text-sm text-slate-300 hover:bg-slate-800"
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
