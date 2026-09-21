import { AlertTriangle, Camera, Trash2, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/Authcontext.jsx';
import { authService, gameService, resolveMediaUrl } from '../services/api.js';

const MODE_LABELS = {
    normal: 'Normal',
    knowledge: 'Connaissance',
    chrono: 'Chrono'
};

const MODE_BADGE = {
    normal: 'border-blue-200 bg-blue-50 text-blue-800',
    knowledge: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    chrono: 'border-rose-200 bg-rose-50 text-rose-800'
};

const formatTime = (seconds) => {
    if (seconds === null || seconds === undefined) return '—';
    const m = String(Math.floor(Number(seconds) / 60)).padStart(2, '0');
    const s = String(Number(seconds) % 60).padStart(2, '0');
    return `${m}:${s}`;
};

const formatDate = (raw) => {
    if (!raw) return '—';
    try {
        return new Date(raw).toLocaleDateString('fr-FR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch {
        return '—';
    }
};

function Profile() {
    const { t } = useTranslation();
    const { user, updateUser, logout } = useAuth();
    const navigate = useNavigate();
    const avatarInputRef = useRef(null);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [username, setUsername] = useState(user?.username || '');
    const [email, setEmail] = useState(user?.email || '');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileError, setProfileError] = useState(null);
    const [profileSuccess, setProfileSuccess] = useState(null);
    const [avatarSaving, setAvatarSaving] = useState(false);
    const [avatarError, setAvatarError] = useState(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState(null);

    useEffect(() => {
        setUsername(user?.username || '');
        setEmail(user?.email || '');
    }, [user?.username, user?.email]);

    useEffect(() => {
        gameService.getHistory()
            .then((res) => {
                setResults(Array.isArray(res.results) ? res.results : []);
            })
            .catch(() => {
                setError('Impossible de charger l\'historique.');
            })
            .finally(() => setLoading(false));
    }, []);

    const totalGames = results.length;
    const wins = results.filter((r) => r.won).length;
    const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
    const usernameAvailableAt = user?.username_change_available_at
        ? new Date(user.username_change_available_at)
        : null;
    const usernameLocked = usernameAvailableAt && usernameAvailableAt > new Date();

    const handleProfileUpdate = async (event) => {
        event.preventDefault();
        setProfileError(null);
        setProfileSuccess(null);

        if (newPassword && newPassword !== confirmPassword) {
            setProfileError('La confirmation du nouveau mot de passe ne correspond pas.');
            return;
        }

        setProfileSaving(true);
        try {
            const data = await authService.updateProfile({
                username,
                email,
                currentPassword,
                ...(newPassword && { newPassword })
            });
            updateUser(data.user);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setProfileSuccess(data.message || 'Profil mis à jour.');
        } catch (profileUpdateError) {
            setProfileError(profileUpdateError.message || 'Impossible de mettre à jour le profil.');
        } finally {
            setProfileSaving(false);
        }
    };

    const handleAvatarChange = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            setAvatarError('Utilisez une image JPEG, PNG ou WebP.');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setAvatarError('La photo ne doit pas dépasser 5 Mo.');
            return;
        }

        setAvatarSaving(true);
        setAvatarError(null);
        try {
            const data = await authService.updateAvatar(file);
            updateUser(data.user);
            setProfileSuccess(data.message || 'Photo de profil mise à jour.');
        } catch (avatarUploadError) {
            setAvatarError(avatarUploadError.message || 'Impossible de modifier la photo.');
        } finally {
            setAvatarSaving(false);
        }
    };

    const handleAvatarDelete = async () => {
        setAvatarSaving(true);
        setAvatarError(null);
        try {
            const data = await authService.deleteAvatar();
            updateUser(data.user);
            setProfileSuccess(data.message || 'Photo de profil supprimée.');
        } catch (avatarDeleteError) {
            setAvatarError(avatarDeleteError.message || 'Impossible de supprimer la photo.');
        } finally {
            setAvatarSaving(false);
        }
    };

    const handleDeleteAccount = async (event) => {
        event.preventDefault();
        setDeleteError(null);
        setDeleteLoading(true);
        try {
            await authService.deleteAccount(deletePassword);
            logout();
            navigate('/login?deleted=true', { replace: true });
        } catch (err) {
            setDeleteError(err.message || 'Impossible de supprimer le compte.');
            setDeleteLoading(false);
        }
    };

    return (
        <div className="site-page paper border-2 shadow-large mx-auto w-full max-w-4xl px-4 py-10">
            <div className="profile-identity">
                <div className="profile-avatar-block">
                    <div className="profile-avatar-preview">
                        {user?.avatar_url ? (
                            <img src={resolveMediaUrl(user.avatar_url)} alt={`Photo de profil de ${user.username}`} />
                        ) : (
                            <UserRound size={46} aria-hidden="true" />
                        )}
                        {avatarSaving && <span>{t('profile.processing')}</span>}
                    </div>
                    <div className="profile-avatar-actions">
                        <input
                            ref={avatarInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleAvatarChange}
                            hidden
                        />
                        <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={avatarSaving}>
                            <Camera size={17} aria-hidden="true" /> {user?.avatar_url ? t('profile.change_photo') : t('profile.add_photo')}
                        </button>
                        {user?.avatar_url && (
                            <button type="button" className="is-danger" onClick={handleAvatarDelete} disabled={avatarSaving} title="Supprimer la photo">
                                <Trash2 size={17} aria-hidden="true" /> {t('profile.delete_photo')}
                            </button>
                        )}
                    </div>
                    <small>{t('profile.photo_help')}</small>
                    {avatarError && <p className="profile-avatar-error" role="alert">{avatarError}</p>}
                </div>
                <div>
                    <h1 className="mb-2 text-3xl font-bold text-slate-900">{t('profile.title')}</h1>
                    {user && (
                        <p className="text-slate-500 text-sm">
                            {t('profile.connected_as', { username: user.username })}
                            {user.email && ` · ${user.email}`}
                        </p>
                    )}
                </div>
            </div>

            <section className="mb-8 border-y border-slate-200 bg-white px-1 py-6">
                <div className="mb-5">
                    <h2 className="text-xl font-semibold text-slate-900">{t('profile.account_settings')}</h2>
                    {usernameLocked && (
                        <p className="mt-1 text-sm text-amber-700">
                            Prochain changement de username : {usernameAvailableAt.toLocaleDateString('fr-FR')}
                        </p>
                    )}
                </div>

                <form onSubmit={handleProfileUpdate} className="grid gap-5 md:grid-cols-2">
                    <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                        Username
                        <input
                            className="form-input bg-white disabled:bg-slate-100 disabled:text-slate-500"
                            type="text"
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            minLength={3}
                            maxLength={30}
                            disabled={Boolean(usernameLocked)}
                            required
                        />
                    </label>

                    <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                        {t('profile.email')}
                        <input
                            className="form-input bg-white"
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            autoComplete="email"
                            required
                        />
                    </label>

                    <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                        {t('profile.new_password')}
                        <input
                            className="form-input bg-white"
                            type="password"
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.target.value)}
                            minLength={8}
                            autoComplete="new-password"
                        />
                    </label>

                    <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                        {t('profile.confirm_password')}
                        <input
                            className="form-input bg-white"
                            type="password"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            minLength={8}
                            autoComplete="new-password"
                        />
                    </label>

                    <label className="grid gap-1.5 text-sm font-medium text-slate-700 md:col-span-2">
                        {t('profile.current_password')}
                        <input
                            className="form-input bg-white"
                            type="password"
                            value={currentPassword}
                            onChange={(event) => setCurrentPassword(event.target.value)}
                            autoComplete="current-password"
                            required
                        />
                    </label>

                    <div className="flex items-center gap-4 md:col-span-2">
                        <button className="btn btn-primary" type="submit" disabled={profileSaving}>
                            {profileSaving ? t('common.saving') : t('common.save')}
                        </button>
                        {profileError && <p className="text-sm text-red-600">{profileError}</p>}
                        {profileSuccess && <p className="text-sm text-emerald-700">{profileSuccess}</p>}
                    </div>
                </form>
            </section>

            <div className="mb-8 grid grid-cols-3 gap-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
                    <p className="text-2xl font-bold text-slate-900">{totalGames}</p>
                    <p className="mt-1 text-xs uppercase tracking-widest text-slate-500">{t('profile.games')}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center shadow-sm">
                    <p className="text-2xl font-bold text-emerald-700">{wins}</p>
                    <p className="mt-1 text-xs uppercase tracking-widest text-emerald-600">{t('profile.wins')}</p>
                </div>
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-center shadow-sm">
                    <p className="text-2xl font-bold text-violet-700">{winRate}%</p>
                    <p className="mt-1 text-xs uppercase tracking-widest text-violet-600">{t('profile.win_rate')}</p>
                </div>
            </div>

            <h2 className="mb-4 text-xl font-semibold text-slate-900">{t('profile.history')}</h2>

            {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

            {loading ? (
                <p className="text-center text-slate-500">{t('common.loading')}</p>
            ) : results.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500 text-sm">
                    {t('profile.empty_history')}
                </p>
            ) : (
                <div className="profile-history-scroll overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="profile-history-head">
                            <tr className="border-b border-slate-100 bg-slate-50 text-[11px] uppercase tracking-widest text-slate-500">
                                <th className="px-4 py-3 text-left">{t('profile.date')}</th>
                                <th className="px-4 py-3 text-left">{t('profile.mode')}</th>
                                <th className="px-4 py-3 text-left">{t('profile.route')}</th>
                                <th className="px-4 py-3 text-right">{t('profile.clicks')}</th>
                                <th className="px-4 py-3 text-right">{t('profile.time')}</th>
                                <th className="px-4 py-3 text-right">{t('profile.points')}</th>
                                <th className="px-4 py-3 text-center">{t('profile.result')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.map((r) => {
                                let points = 0;
                                if (r.score !== null && r.score !== undefined) {
                                    points = Math.max(0, Number(r.score) || 0);
                                } else if (r.mode === 'chrono') {
                                    points = r.won ? Math.max(0, Number(r.score) || 0) : 0;
                                } else if (r.mode === 'knowledge') {
                                    const kScore = r.knowledge_score !== null && r.knowledge_score !== undefined ? Number(r.knowledge_score) : 0;
                                    points = r.won
                                        ? Math.max(0, kScore * 100 + 500 - (r.clicks * 50) - (r.time_seconds / 4))
                                        : Math.max(0, kScore * 100);
                                } else if (r.mode === 'normal') {
                                    points = r.won ? Math.max(0, 1000 - (r.clicks * 100) - (r.time_seconds / 2)) : 0;
                                }
                                return (
                                    <tr key={r.id} className="border-b border-slate-50 transition hover:bg-slate-50">
                                        <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{formatDate(r.played_at)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${MODE_BADGE[r.mode] || 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                                                {t(`common.${r.mode}`, { defaultValue: MODE_LABELS[r.mode] || r.mode })}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-700 max-w-50 truncate">
                                            <span title={`${r.start_article} → ${r.target_article}`}>
                                                {r.start_article} → {r.target_article}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right text-slate-700">{r.clicks}</td>
                                        <td className="px-4 py-3 text-right text-slate-500">{formatTime(r.time_seconds)}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-rose-700">{Math.round(points)} pts</td>
                                        <td className="px-4 py-3 text-center">
                                            {r.won ? (
                                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">{t('common.won')}</span>
                                            ) : (
                                                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">{t('common.lost')}</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Zone de Danger : Suppression de compte RGPD */}
            <section className="mt-12 rounded-2xl border border-rose-300 bg-rose-50/70 p-6 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h3 className="flex items-center gap-2 text-base font-bold text-rose-900">
                            <AlertTriangle size={20} className="text-rose-600" />
                            {t('profile.danger_zone', { defaultValue: 'Zone de danger' })}
                        </h3>
                        <p className="mt-1 text-xs text-rose-700 leading-relaxed max-w-xl">
                            {t('profile.delete_account_warning', { defaultValue: 'La suppression de votre compte est irréversible. Toutes vos parties, scores, statistiques et données personnelles associées seront définitivement effacées conformément au RGPD.' })}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setDeleteError(null);
                            setDeletePassword('');
                            setShowDeleteModal(true);
                        }}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-600 bg-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow transition hover:bg-rose-700 active:scale-95 shrink-0"
                    >
                        <Trash2 size={16} />
                        {t('profile.delete_account_button', { defaultValue: 'Supprimer mon compte' })}
                    </button>
                </div>
            </section>

            {/* Modal de confirmation de suppression */}
            {showDeleteModal && (
                <div className="antique-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
                    <div className="antique-modal paper border-3 shadow-large w-full max-w-md p-6 bg-[#f7efe3] text-slate-900 rounded-2xl">
                        <div className="mb-4 flex items-center justify-between border-b border-[#d8c7b0] pb-3">
                            <h3 className="flex items-center gap-2 text-lg font-bold text-rose-900">
                                <AlertTriangle size={22} className="text-rose-600" />
                                {t('profile.confirm_delete_title', { defaultValue: 'Confirmer la suppression' })}
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowDeleteModal(false)}
                                className="rounded-full p-1 text-slate-500 hover:bg-slate-200"
                                aria-label="Fermer"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <p className="mb-4 text-sm text-slate-700 leading-relaxed">
                            {t('profile.confirm_delete_message', { defaultValue: 'Êtes-vous absolument certain de vouloir supprimer définitivement votre compte WikisGuessr ? Cette action est irréversible.' })}
                        </p>

                        <form onSubmit={handleDeleteAccount} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                                    {t('profile.confirm_delete_password', { defaultValue: 'Entrez votre mot de passe pour confirmer :' })}
                                </label>
                                <input
                                    type="password"
                                    value={deletePassword}
                                    onChange={(e) => setDeletePassword(e.target.value)}
                                    placeholder="Mot de passe actuel"
                                    required
                                    className="form-input w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-inner focus:border-rose-500 focus:outline-none"
                                    autoComplete="current-password"
                                />
                            </div>

                            {deleteError && (
                                <p className="rounded-lg bg-rose-100 border border-rose-300 p-2.5 text-xs font-semibold text-rose-800">
                                    {deleteError}
                                </p>
                            )}

                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteModal(false)}
                                    disabled={deleteLoading}
                                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                                >
                                    {t('common.cancel', { defaultValue: 'Annuler' })}
                                </button>
                                <button
                                    type="submit"
                                    disabled={deleteLoading || !deletePassword}
                                    className="inline-flex items-center gap-2 rounded-xl border border-rose-700 bg-rose-700 px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-rose-800 disabled:opacity-50"
                                >
                                    <Trash2 size={16} />
                                    {deleteLoading ? t('common.deleting', { defaultValue: 'Suppression…' }) : t('profile.confirm_delete_final', { defaultValue: 'Supprimer définitivement' })}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Profile;
