import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authService } from '../services/api.js';
import { useAuth } from '../context/Authcontext.jsx';

function Login() {
    const { t } = useTranslation();
    const [isRegister, setIsRegister] = useState(() => new URLSearchParams(window.location.search).get('mode') === 'register');
    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [username, setUsername] = useState('');
    const [identifier, setIdentifier] = useState('');
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
                : '/';

    useEffect(() => {
        if (!tokenFromUrl || lastHandledTokenRef.current === tokenFromUrl) {
            return;
        }

        lastHandledTokenRef.current = tokenFromUrl;
        setLoading(true);
        setError(null);
        setSuccessMessage(t('login.verifying'));

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
    }, [tokenFromUrl, targetAfterAuth, login, navigate, t]);

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
                const data = await authService.forgotPassword(identifier);
                setSuccessMessage(data.message || 'Si cet email existe, un lien de reinitialisation a ete envoye.');
                return;
            }

            if (isRegister && password !== confirmPassword) {
                setError('La confirmation du mot de passe ne correspond pas');
                return;
            }

            const data = isRegister
                ? await authService.register({ username, email: identifier, password, confirmPassword, redirectPath: targetAfterAuth })
                : await authService.login(identifier, password);

            if (isRegister) {
                setIsRegister(false);
                setSuccessMessage(data.message || 'Compte créé. Vérifie ton email pour activer ton compte.');
                setPassword('');
                setConfirmPassword('');
                setUsername('');
                setIdentifier('');
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
        <div className="login-container paper border-2 shadow-large">
            <header className="login-heading">
                <span><BookOpen size={24} aria-hidden="true" /></span>
                <div>
                    <p>{t('login.eyebrow')}</p>
                    <h1>
                {isResetPasswordMode
                    ? t('login.reset_title')
                    : isForgotPassword
                        ? t('login.forgot_title')
                        : isRegister
                            ? t('register.title')
                            : t('login.title')}
                    </h1>
                    <small>{isRegister ? t('register.subtitle') : t('login.subtitle')}</small>
                </div>
            </header>
            {successMessage && <p className="success">{successMessage}</p>}
            <form className="login-form" onSubmit={handleSubmit}>
                {!isResetPasswordMode && isRegister && (
                    <div>
                        <label htmlFor="username">{t('login.username')}</label>
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
                        <label htmlFor="email">
                            {isRegister || isForgotPassword ? t('login.email') : t('login.identifier')}
                        </label>
                        <input
                            type={isRegister || isForgotPassword ? 'email' : 'text'}
                            id="email"
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            placeholder={isRegister || isForgotPassword ? t('login.email') : t('login.identifier')}
                            required
                        />
                    </div>
                )}
                {!isResetPasswordMode && !isForgotPassword && (
                    <div>
                        <label htmlFor="password">{t('login.password')}</label>
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
                        <label htmlFor="confirmPassword">{t('register.confirm_password')}</label>
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
                            <label htmlFor="newPassword">{t('login.new_password')}</label>
                            <input
                                type="password"
                                id="newPassword"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="confirmNewPassword">{t('login.confirm_new_password')}</label>
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
                            ? t('login.reset_loading')
                            : isForgotPassword
                                ? t('login.forgot_loading')
                                : isRegister
                                    ? t('register.loading')
                                    : t('login.loading')
                        : isResetPasswordMode
                            ? t('login.reset_submit')
                            : isForgotPassword
                                ? t('login.forgot_submit')
                                : isRegister
                                    ? t('register.submit')
                                    : t('login.submit')}
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
                            className="login-secondary-action"
                        >
                            <KeyRound size={16} aria-hidden="true" /> {t('login.forgot')}
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
                            className="login-secondary-action"
                        >
                            {isRegister ? t('register.already_account') : t('login.no_account')}
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
                            className="login-secondary-action"
                        >
                            {t('login.back')}
                        </button>
                    )}
                </>
            )}
        </div>
    );
}

export default Login;
