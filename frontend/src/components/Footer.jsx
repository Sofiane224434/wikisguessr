// components/Footer.jsx
import { useTranslation } from 'react-i18next';
function Footer() {
    const { t } = useTranslation();
    return (
        <footer className="bg-gray-800 text-white py-6 mt-auto">
            <div className="container mx-auto px-4 text-center">
                <p className="text-sm">
                    {t('footer.copyright', { year: new Date().getFullYear() })} -{' '}
                    <a
                        href="https://azim404.com"
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-blue-300 transition"
                    >
                        Azim404.com
                    </a>
                </p>
            </div>
        </footer>
    );
}
export default Footer;