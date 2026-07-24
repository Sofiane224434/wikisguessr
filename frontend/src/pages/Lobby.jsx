import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gameService, gameRoomService } from '../services/api.js';

const MODE_LABELS = {
    normal: 'Normal',
    knowledge: 'Connaissance',
    chrono: 'Chrono'
};

const MODE_SEQUENCE = ['normal', 'knowledge', 'chrono'];

function Lobby() {
    const navigate = useNavigate();
    const [mode, setMode] = useState('normal');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    // Salon personnel
    const [myRoom, setMyRoom] = useState(null);
    const [members, setMembers] = useState([]);
    const [roomLoading, setRoomLoading] = useState(true);

    // Rejoindre un salon
    const [joinCode, setJoinCode] = useState('');
    const [joiningRoom, setJoiningRoom] = useState(false);

    useEffect(() => {
        loadMyRoom();
    }, []);

    const loadMyRoom = async () => {
        try {
            setRoomLoading(true);
            const data = await gameRoomService.getMyRoom();
            setMyRoom(data.room);
            setMembers(data.members || []);
        } catch (err) {
            console.error('Erreur lors du chargement du salon:', err);
        } finally {
            setRoomLoading(false);
        }
    };

    const toggleMode = () => {
        setMode((prev) => {
            const index = MODE_SEQUENCE.indexOf(prev);
            const nextIndex = index >= 0 ? (index + 1) % MODE_SEQUENCE.length : 0;
            return MODE_SEQUENCE[nextIndex];
        });
    };

    const handleCreateGame = async () => {
        setError(null);
        setSuccess(null);
        setLoading(true);

        try {
            const data = await gameService.create({
                mode
            });

            setSuccess(`Partie creee avec succes. Code: ${data.game.code}`);
            navigate(`/game?code=${encodeURIComponent(data.game.code)}`);
        } catch (err) {
            setError(err.message || 'Impossible de creer la partie');
        } finally {
            setLoading(false);
        }
    };

    const handleJoinRoom = async () => {
        if (!joinCode.trim()) {
            setError('Veuillez entrer un code');
            return;
        }

        setError(null);
        setSuccess(null);
        setJoiningRoom(true);

        try {
            const data = await gameRoomService.joinRoom(joinCode);
            setSuccess('Vous avez rejoint le salon!');
            setJoinCode('');
            setMyRoom(data.room);
            setMembers(data.members || []);
        } catch (err) {
            setError(err.message || 'Impossible de rejoindre le salon');
        } finally {
            setJoiningRoom(false);
        }
    };

    const copyToClipboard = () => {
        if (myRoom?.code) {
            navigator.clipboard.writeText(myRoom.code);
            setSuccess('Code copié!');
            setTimeout(() => setSuccess(null), 2000);
        }
    };

    if (roomLoading) {
        return (
            <div className="mx-auto w-full max-w-4xl px-4 py-10">
                <p className="text-slate-500">Chargement du salon...</p>
            </div>
        );
    }

    return (
        <div className="mx-auto w-full max-w-4xl px-4 py-10">
            <h1 className="mb-6 text-3xl font-bold text-slate-900">Lobby</h1>

            {/* Mon salon */}
            {myRoom && (
                <div className="mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h2 className="mb-4 text-xl font-semibold text-slate-900">Mon salon</h2>
                    <div className="mb-4 flex items-center gap-2">
                        <span className="text-sm text-slate-600">Code: </span>
                        <code className="rounded bg-slate-100 px-3 py-1 font-mono text-lg font-bold text-slate-900">
                            {myRoom.code}
                        </code>
                        <button
                            type="button"
                            onClick={copyToClipboard}
                            className="ml-2 rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
                        >
                            Copier
                        </button>
                    </div>

                    {/* Membres du salon */}
                    <div className="mb-4">
                        <h3 className="mb-2 text-sm font-semibold text-slate-900">Joueurs ({members.length + 1})</h3>
                        <div className="flex flex-wrap gap-2">
                            <div className="rounded-lg bg-slate-900 px-3 py-1 text-sm text-white font-semibold">
                                Vous (propriétaire)
                            </div>
                            {members.map((member) => (
                                <div
                                    key={member.id}
                                    className="rounded-lg bg-slate-200 px-3 py-1 text-sm text-slate-900"
                                >
                                    {member.username}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Rejoindre un salon */}
            <div className="mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-xl font-semibold text-slate-900">Rejoindre un salon</h2>
                <div className="flex flex-wrap items-center gap-3">
                    <input
                        type="text"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        placeholder="Entrez le code du salon"
                        className="rounded-lg border border-slate-300 px-4 py-2 text-slate-900 placeholder-slate-400"
                    />
                    <button
                        type="button"
                        onClick={handleJoinRoom}
                        disabled={joiningRoom || !joinCode.trim()}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
                    >
                        {joiningRoom ? 'Rejoindre...' : 'Rejoindre'}
                    </button>
                </div>
            </div>

            {/* Créer une partie */}
            <div className="mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-xl font-semibold text-slate-900">Lancer une partie</h2>
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={toggleMode}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-slate-900"
                    >
                        Mode: {MODE_LABELS[mode]}
                    </button>
                    <button
                        type="button"
                        onClick={handleCreateGame}
                        disabled={loading}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
                    >
                        {loading ? 'Lancement...' : 'Lancer'}
                    </button>
                </div>

                {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
                {success && <p className="mt-3 text-sm text-emerald-700">{success}</p>}
            </div>
        </div>
    );
}

export default Lobby;
