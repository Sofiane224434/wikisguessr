import { CircleAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function ErrorPage() {
    const navigate = useNavigate();
    const { t } = useTranslation();

    return (
        <div className="site-page placeholder-page paper border-4 shadow-large">
            <div>
                <CircleAlert size={52} strokeWidth={1.5} aria-hidden="true" />
                <h1>{t('error_page.title')}</h1>
                <button type="button" className="paper-btn mt-4" onClick={() => navigate('/lobby')}>
                    {t('error_page.back')}
                </button>
            </div>
        </div>
    );
}
export default ErrorPage;
