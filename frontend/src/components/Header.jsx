// components/Header.jsx
import { useTranslation } from 'react-i18next';

const languages = [
    { code: 'fr', label: 'FR' },
    { code: 'en', label: 'EN' },
];

function Header() {
    const { i18n } = useTranslation();
    const currentLanguage = (i18n.resolvedLanguage || i18n.language || 'fr').slice(0, 2);
    const handleLanguageChange = (event) => {
        i18n.changeLanguage(event.target.value);
    };
    return (
        <header className="bg-blue-600 text-white shadow-lg">
            <div className="container mx-auto px-4 py-4 flex justify-between items-center">
                <span className="text-2xl font-bold">
                    Starter Kit
                </span>
                <div className="flex gap-4 items-center">
                    <select
                        value={currentLanguage}
                        onChange={handleLanguageChange}
                        className="text-sm bg-blue-500 hover:bg-blue-400 px-2 py-1 rounded transition font-mono text-white"
                        title="Changer de langue"
                    >
                        {languages.map((language) => (
                            <option key={language.code} value={language.code} className="text-black">
                                {language.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
        </header>
    );
}
export default Header;