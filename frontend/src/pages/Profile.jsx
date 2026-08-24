import { Camera, Trash2, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
    const { user, updateUser } = useAuth();
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

    return (
        <div className="site-page paper border border-2 shadow-large mx-auto w-full max-w-4xl px-4 py-10">
            <div className="profile-identity">
                <div className="profile-avatar-block">
                    <div className="profile-avatar-preview">
                        {user?.avatar_url ? (
                            <img src={resolveMediaUrl(user.avatar_url)} alt={`Photo de profil de ${user.username}`} />
                        ) : (
                            <UserRound size={46} aria-hidden="true" />
                        )}
                        {avatarSaving && <span>Traitement...</span>}
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
                            <Camera size={17} aria-hidden="true" /> {user?.avatar_url ? 'Changer' : 'Ajouter une photo'}
                        </button>
                        {user?.avatar_url && (
                            <button type="button" className="is-danger" onClick={handleAvatarDelete} disabled={avatarSaving} title="Supprimer la photo">
                                <Trash2 size={17} aria-hidden="true" /> Supprimer
                            </button>
                        )}
                    </div>
                    <small>JPEG, PNG ou WebP · 5 Mo maximum</small>
                    {avatarError && <p className="profile-avatar-error" role="alert">{avatarError}</p>}
                </div>
                <div>
                    <h1 className="mb-2 text-3xl font-bold text-slate-900">Profil</h1>
                    {user && (
                        <p className="text-slate-500 text-sm">
                            Connecté en tant que <strong className="text-slate-700">{user.username}</strong>
                            {user.email && ` · ${user.email}`}
                        </p>
                    )}
                </div>
            </div>

            <section className="mb-8 border-y border-slate-200 bg-white px-1 py-6">
                <div className="mb-5">
                    <h2 className="text-xl font-semibold text-slate-900">Paramètres du compte</h2>
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
                        Adresse e-mail
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
                        Nouveau mot de passe
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
                        Confirmer le nouveau mot de passe
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
                        Mot de passe actuel
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
                            {profileSaving ? 'Enregistrement...' : 'Enregistrer'}
                        </button>
                        {profileError && <p className="text-sm text-red-600">{profileError}</p>}
                        {profileSuccess && <p className="text-sm text-emerald-700">{profileSuccess}</p>}
                    </div>
                </form>
            </section>

            <div className="mb-8 grid grid-cols-3 gap-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
                    <p className="text-2xl font-bold text-slate-900">{totalGames}</p>
                    <p className="mt-1 text-xs uppercase tracking-widest text-slate-500">Parties</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center shadow-sm">
                    <p className="text-2xl font-bold text-emerald-700">{wins}</p>
                    <p className="mt-1 text-xs uppercase tracking-widest text-emerald-600">Victoires</p>
                </div>
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-center shadow-sm">
                    <p className="text-2xl font-bold text-violet-700">{winRate}%</p>
                    <p className="mt-1 text-xs uppercase tracking-widest text-violet-600">Taux de victoire</p>
                </div>
            </div>

            <h2 className="mb-4 text-xl font-semibold text-slate-900">Historique des parties</h2>

            {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

            {loading ? (
                <p className="text-center text-slate-500">Chargement...</p>
            ) : results.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500 text-sm">
                    Aucune partie enregistrée pour l'instant.
                </p>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50 text-[11px] uppercase tracking-widest text-slate-500">
                                <th className="px-4 py-3 text-left">Date</th>
                                <th className="px-4 py-3 text-left">Mode</th>
                                <th className="px-4 py-3 text-left">Départ → Cible</th>
                                <th className="px-4 py-3 text-right">Clics</th>
                                <th className="px-4 py-3 text-right">Temps</th>
                                <th className="px-4 py-3 text-right">Points</th>
                                <th className="px-4 py-3 text-center">Résultat</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.map((r) => {
                                let points = 0;
                                if (r.mode === 'chrono') {
                                    points = r.score;
                                } else if (r.mode === 'knowledge' && r.knowledge_score !== null && r.knowledge_score !== undefined) {
                                    points = r.knowledge_score * 100 + 500 - (r.clicks * 50) - (r.time_seconds / 4);
                                } else if (r.mode === 'normal') {
                                    points = 1000 - (r.clicks * 100) - (r.time_seconds / 2);
                                }
                                return (
                                    <tr key={r.id} className="border-b border-slate-50 transition hover:bg-slate-50">
                                        <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{formatDate(r.played_at)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${MODE_BADGE[r.mode] || 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                                                {MODE_LABELS[r.mode] || r.mode}
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
                                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">Gagné</span>
                                            ) : (
                                                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">Perdu</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default Profile;
