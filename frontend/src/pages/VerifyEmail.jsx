import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../services/api.js';
import { useAuth } from '../context/Authcontext.jsx';
import { useTranslation } from 'react-i18next';

function VerifyEmail() {
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { login } = useAuth();
    const token = searchParams.get('token');
    const next = searchParams.get('next') || '/';
    const [status, setStatus] = useState(token ? t('verify.pending') : null);
    const [error, setError] = useState(token ? null : t('verify.missing'));

    useEffect(() => {
        if (!token) {
            return;
        }

        authService
            .verifyEmail(token)
            .then((data) => {
                login(data.user, data.token);
                navigate(next, { replace: true });
            })
            .catch((err) => {
                setStatus(null);
                setError(err.message || 'Impossible de verifier l\'adresse mail.');
            });
    }, [login, navigate, next, token]);

    return (
        <div className="login-container paper border-2 shadow-large">
            <h1>{t('verify.title')}</h1>
            {status && <p>{status}</p>}
            {error && <p className="error">{error}</p>}
        </div>
    );
}

export default VerifyEmail;
