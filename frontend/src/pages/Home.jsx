import { useTranslation } from 'react-i18next';

function Home() {
    const { t } = useTranslation();
    return (
        <div className="flex items-center justify-center py-16">
            <div className="text-center">
                <h1 className="text-4xl font-bold text-gray-900 mb-4">{t('home.title')}</h1>
            </div>
        </div>
    );
}

export default Home;