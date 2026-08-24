import { useTranslation } from 'react-i18next';
import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

const languageLabels = {
    fr: { short: 'FR', name: 'Français' },
    en: { short: 'EN', name: 'English' },
    es: { short: 'ES', name: 'Español' },
    ar: { short: 'AR', name: 'العربية' },
    pt: { short: 'PT', name: 'Português' },
    zh: { short: 'ZH', name: '中文' },
    de: { short: 'DE', name: 'Deutsch' },
    hi: { short: 'HI', name: 'हिन्दी' },
    ru: { short: 'RU', name: 'Русский' },
    ja: { short: 'JA', name: '日本語' },
};

function LanguageSelect({ className = '' }) {
    const { i18n, t } = useTranslation();
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    const menuId = useId();
    const currentLanguage = (i18n.resolvedLanguage || i18n.language || 'fr').slice(0, 2);
    const supportedLanguages = (i18n.options?.supportedLngs || [])
        .filter((code) => code && code !== 'cimode')
        .map((code) => code.slice(0, 2));
    const uniqueLanguages = [...new Set(supportedLanguages)];

    useEffect(() => {
        const closeMenu = (event) => {
            if (!rootRef.current?.contains(event.target)) {
                setOpen(false);
            }
        };
        const closeWithEscape = (event) => {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        };

        document.addEventListener('pointerdown', closeMenu);
        document.addEventListener('keydown', closeWithEscape);
        return () => {
            document.removeEventListener('pointerdown', closeMenu);
            document.removeEventListener('keydown', closeWithEscape);
        };
    }, []);

    const handleLanguageChange = async (code) => {
        await i18n.changeLanguage(code);
        setOpen(false);
    };

    return (
        <div ref={rootRef} className={`language-picker ${className}`}>
            <button
                type="button"
                className="language-picker-trigger"
                onClick={() => setOpen((value) => !value)}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={menuId}
                title={t('language.change')}
            >
                <span>{languageLabels[currentLanguage]?.short || currentLanguage.toUpperCase()}</span>
                <ChevronDown size={15} aria-hidden="true" />
            </button>
            {open && (
                <div id={menuId} className="language-picker-menu" role="listbox" aria-label={t('language.choose')}>
                    {uniqueLanguages.map((code) => {
                        const language = languageLabels[code] || { short: code.toUpperCase(), name: code.toUpperCase() };
                        const selected = code === currentLanguage;
                        return (
                            <button
                                key={code}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                className={`language-picker-option${selected ? ' is-selected' : ''}`}
                                onClick={() => handleLanguageChange(code)}
                            >
                                <span className="language-picker-code">{language.short}</span>
                                <span>{language.name}</span>
                                {selected && <Check size={16} aria-hidden="true" />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default LanguageSelect;
