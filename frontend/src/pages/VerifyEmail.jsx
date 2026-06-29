import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../services/api.js';
import { useAuth } from '../context/Authcontext.jsx';

function VerifyEmail() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { login } = useAuth();
    const [status, setStatus] = useState('Verification de ton adresse mail...');
    const [error, setError] = useState(null);

    useEffect(() => {
        const token = searchParams.get('token');
        const next = searchParams.get('next') || '/';

        if (!token) {
            setStatus(null);
            setError('Token de verification manquant.');
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
    }, [login, navigate, searchParams]);

    return (
        <div className="login-container">
            <h1>Verification email</h1>
            {status && <p>{status}</p>}
            {error && <p className="error">{error}</p>}
        </div>
    );
}

export default VerifyEmail;
