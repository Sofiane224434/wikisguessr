import { CircleAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function ErrorPage() {
    const navigate = useNavigate();

    return (
        <div className="site-page placeholder-page paper border border-4 shadow-large">
            <div>
                <CircleAlert size={52} strokeWidth={1.5} aria-hidden="true" />
                <h1>Page introuvable</h1>
                <button type="button" className="paper-btn mt-4" onClick={() => navigate('/lobby')}>
                    Retour au lobby
                </button>
            </div>
        </div>
    );
}
export default ErrorPage;
