import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../services/api.js';
import { useAuth } from '../context/Authcontext.jsx';

function VerifyEmail() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { login } = useAuth();
    const token = searchParams.get('token');
    const next = searchParams.get('next') || '/';
    const [status, setStatus] = useState(token ? 'Verification de ton adresse mail...' : null);
    const [error, setError] = useState(token ? null : 'Token de verification manquant.');

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
        <div className="login-container paper border border-2 shadow-large">
            <h1>Verification email</h1>
            {status && <p>{status}</p>}
            {error && <p className="error">{error}</p>}
        </div>
    );
}

export default VerifyEmail;
