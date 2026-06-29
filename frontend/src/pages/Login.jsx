import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authService } from '../services/api.js';
import { useAuth } from '../context/Authcontext.jsx';

function Login() {
    const [isRegister, setIsRegister] = useState(false);
    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const location = useLocation();
    const navigate = useNavigate();
    const { login } = useAuth();
    const lastHandledTokenRef = useRef(null);

    const fromPath = location.state?.from?.pathname;
    const searchParams = new URLSearchParams(location.search);
    const tokenFromUrl = searchParams.get('token');
    const resetTokenFromUrl = searchParams.get('resetToken');
    const nextFromUrl = searchParams.get('next');
    const isResetPasswordMode = Boolean(resetTokenFromUrl);
    const targetAfterAuth =
        nextFromUrl && nextFromUrl !== '/login'
            ? nextFromUrl
            : fromPath && fromPath !== '/login'
                ? fromPath
                : '/lobby';

    useEffect(() => {
        if (!tokenFromUrl || lastHandledTokenRef.current === tokenFromUrl) {
            return;
        }

        lastHandledTokenRef.current = tokenFromUrl;
        setLoading(true);
        setError(null);
        setSuccessMessage('Verification de l\'adresse email en cours...');

        authService
            .verifyEmail(tokenFromUrl)
            .then((data) => {
                login(data.user, data.token);
                navigate(targetAfterAuth, { replace: true });
            })
            .catch((err) => {
                setSuccessMessage(null);
                setError(err.message || 'Impossible de verifier l\'adresse mail.');
            })
            .finally(() => {
                setLoading(false);
            });
    }, [tokenFromUrl, targetAfterAuth, login, navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            if (isResetPasswordMode) {
                if (newPassword !== confirmNewPassword) {
                    setError('La confirmation du nouveau mot de passe ne correspond pas');
                    return;
                }

                const data = await authService.resetPassword(resetTokenFromUrl, newPassword);
                setSuccessMessage(data.message || 'Mot de passe reinitialise. Connecte-toi avec ton nouveau mot de passe.');
                setNewPassword('');
                setConfirmNewPassword('');
                navigate('/login', { replace: true });
                return;
            }

            if (isForgotPassword) {
                const data = await authService.forgotPassword(email);
                setSuccessMessage(data.message || 'Si cet email existe, un lien de reinitialisation a ete envoye.');
                return;
            }

            if (isRegister && password !== confirmPassword) {
                setError('La confirmation du mot de passe ne correspond pas');
                return;
            }

            const data = isRegister
                ? await authService.register({ username, email, password, confirmPassword, redirectPath: targetAfterAuth })
                : await authService.login(email, password);

            if (isRegister) {
                setIsRegister(false);
                setSuccessMessage(data.message || 'Compte créé. Vérifie ton email pour activer ton compte.');
                setPassword('');
                setConfirmPassword('');
                setUsername('');
                return;
            }

            login(data.user, data.token);
            navigate(targetAfterAuth, { replace: true });
        } catch (err) {
            setError(err.message || 'Erreur lors de la connexion');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <h1>
                {isResetPasswordMode
                    ? 'Nouveau mot de passe'
                    : isForgotPassword
                        ? 'Mot de passe oublie'
                        : isRegister
                            ? 'Inscription'
                            : 'Connexion'}
            </h1>
            {successMessage && <p className="success">{successMessage}</p>}
            <form onSubmit={handleSubmit}>
                {!isResetPasswordMode && isRegister && (
                    <div>
                        <label htmlFor="username">Username:</label>
                        <input
                            type="text"
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                        />
                    </div>
                )}
                {!isResetPasswordMode && (
                    <div>
                        <label htmlFor="email">Email:</label>
                        <input
                            type="email"
                            id="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                )}
                {!isResetPasswordMode && !isForgotPassword && (
                    <div>
                        <label htmlFor="password">Mot de passe:</label>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                )}
                {isRegister && !isForgotPassword && !isResetPasswordMode && (
                    <div>
                        <label htmlFor="confirmPassword">Confirmer le mot de passe:</label>
                        <input
                            type="password"
                            id="confirmPassword"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                        />
                    </div>
                )}
                {isResetPasswordMode && (
                    <>
                        <div>
                            <label htmlFor="newPassword">Nouveau mot de passe:</label>
                            <input
                                type="password"
                                id="newPassword"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="confirmNewPassword">Confirmer le nouveau mot de passe:</label>
                            <input
                                type="password"
                                id="confirmNewPassword"
                                value={confirmNewPassword}
                                onChange={(e) => setConfirmNewPassword(e.target.value)}
                                required
                            />
                        </div>
                    </>
                )}
                {error && <p className="error">{error}</p>}
                <button type="submit" disabled={loading}>
                    {loading
                        ? isResetPasswordMode
                            ? 'Reinitialisation...'
                            : isForgotPassword
                                ? 'Envoi...'
                                : isRegister
                                    ? 'Inscription...'
                                    : 'Connexion...'
                        : isResetPasswordMode
                            ? 'Changer le mot de passe'
                            : isForgotPassword
                                ? 'Envoyer le lien de reinitialisation'
                                : isRegister
                                    ? 'S\'inscrire'
                                    : 'Se connecter'}
                </button>
            </form>
            {!isResetPasswordMode && (
                <>
                    {!isForgotPassword && !isRegister && (
                        <button
                            type="button"
                            onClick={() => {
                                setError(null);
                                setSuccessMessage(null);
                                setIsForgotPassword(true);
                            }}
                            style={{ marginTop: '12px' }}
                        >
                            Mot de passe oublie ?
                        </button>
                    )}
                    {!isForgotPassword && (
                        <button
                            type="button"
                            onClick={() => {
                                setError(null);
                                setSuccessMessage(null);
                                setIsRegister((prev) => !prev);
                                setIsForgotPassword(false);
                            }}
                            style={{ marginTop: '12px' }}
                        >
                            {isRegister ? 'Deja un compte ? Se connecter' : 'Pas de compte ? S\'inscrire'}
                        </button>
                    )}
                    {isForgotPassword && (
                        <button
                            type="button"
                            onClick={() => {
                                setError(null);
                                setSuccessMessage(null);
                                setIsForgotPassword(false);
                            }}
                            style={{ marginTop: '12px' }}
                        >
                            Retour a la connexion
                        </button>
                    )}
                </>
            )}
        </div>
    );
}

export default Login;
