import { useTranslation } from 'react-i18next';

function Home() {
    const { t } = useTranslation();
    return (
        <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
            <div className="text-center">
                <h1 className="text-4xl font-bold text-gray-900 mb-4">{t('home.title')}</h1>
            </div>
        </div>
    );
}

export default Home;