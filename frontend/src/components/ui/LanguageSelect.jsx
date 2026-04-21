import { useTranslation } from 'react-i18next';

const languageLabels = {
    fr: 'FR',
    en: 'EN',
    es: 'ES',
    ar: 'AR',
    pt: 'PT',
    zh: 'ZH',
    de: 'DE',
    hi: 'HI',
    ru: 'RU',
    ja: 'JA',
};

function LanguageSelect() {
    const { i18n } = useTranslation();
    const currentLanguage = (i18n.resolvedLanguage || i18n.language || 'fr').slice(0, 2);
    const supportedLanguages = (i18n.options?.supportedLngs || [])
        .filter((code) => code && code !== 'cimode')
        .map((code) => code.slice(0, 2));
    const uniqueLanguages = [...new Set(supportedLanguages)];

    const handleLanguageChange = (event) => {
        i18n.changeLanguage(event.target.value);
    };

    return (
        <select
            value={currentLanguage}
            onChange={handleLanguageChange}
            className="text-sm bg-blue-500 hover:bg-blue-400 px-2 py-1 rounded transition font-mono text-white"
            title="Changer de langue"
        >
            {uniqueLanguages.map((code) => (
                <option key={code} value={code} className="text-black">
                    {languageLabels[code] || code.toUpperCase()}
                </option>
            ))}
        </select>
    );
}

export default LanguageSelect;
