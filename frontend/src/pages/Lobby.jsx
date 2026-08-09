import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { gameService, gameRoomService, friendService, roomMessageService, matchmakingService } from '../services/api.js';
import ReportModal from '../components/ui/ReportModal.jsx';
import GameModeModal from '../components/ui/GameModeModal.jsx';
import MatchmakingUI from '../components/ui/MatchmakingUI.jsx';

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

    // Amis
    const [friends, setFriends] = useState([]);
    const [addFriendInput, setAddFriendInput] = useState('');
    const [addingFriend, setAddingFriend] = useState(false);

    // Chat
    const [messages, setMessages] = useState([]);
    const [chatMessage, setChatMessage] = useState('');
    const [sendingMessage, setSendingMessage] = useState(false);
    const socketRef = useRef(null);
    const chatEndRef = useRef(null);

    // Signalement
    const [reportTarget, setReportTarget] = useState(null);

    // Modale de mode
    const [showModeModal, setShowModeModal] = useState(false);

    // Matchmaking
    const [isSearching, setIsSearching] = useState(false);
    const [queueSize, setQueueSize] = useState(0);
    const [searchTimeRemaining, setSearchTimeRemaining] = useState(30);
    const searchTimerRef = useRef(null);

    // Connexion socket au montage
    useEffect(() => {
        const token = localStorage.getItem('token');
        const socket = io(window.location.origin, {
            auth: { token },
            transports: ['websocket', 'polling']
        });
        socketRef.current = socket;

        socket.on('chat:message', (msg) => {
            setMessages(prev => [...prev, msg]);
        });

        socket.on('matchmaking:joined', ({ mode, queueSize }) => {
            console.log(`[Matchmaking] Joined ${mode} queue, size: ${queueSize}`);
            setQueueSize(queueSize);
        });

        socket.on('matchmaking:found', async (notifyData) => {
            clearInterval(searchTimerRef.current);
            setIsSearching(false);
            console.log('[Matchmaking] Match found!', notifyData);
            
            // Create game with players
            try {
                const data = await gameService.create({
                    mode,
                    realPlayers: notifyData.players,
                    botCount: notifyData.botCount
                });
                
                setSuccess(`Partie créée! ${notifyData.totalPlayers} joueurs.`);
                navigate(`/game?code=${encodeURIComponent(data.game.code)}`);
            } catch (err) {
                setError('Erreur création partie après match');
            }
        });

        socket.on('matchmaking:solo-fallback', (data) => {
            clearInterval(searchTimerRef.current);
            setIsSearching(false);
            setSuccess(data.message);
            
            // Create solo game
            gameService.create({ mode, solo: true })
                .then(res => navigate(`/game?code=${encodeURIComponent(res.game.code)}`))
                .catch(err => setError('Erreur création partie solo'));
        });

        socket.on('connect_error', (err) => {
            console.error('[Socket] Connexion échouée:', err.message);
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    useEffect(() => {
        loadMyRoom();
        loadFriendsWithStatus();
    }, []);

    useEffect(() => {
        if (myRoom?.id && socketRef.current) {
            // Charger l'historique via REST
            roomMessageService.getMessages(myRoom.id, 30)
                .then(data => setMessages(data.messages || []))
                .catch(err => console.error('Erreur chargement messages:', err));

            // Rejoindre la room socket pour les messages temps réel
            socketRef.current.emit('room:join', myRoom.id);

            return () => {
                socketRef.current?.emit('room:leave', myRoom.id);
            };
        }
    }, [myRoom?.id]);

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

    const loadFriendsWithStatus = async () => {
        try {
            const data = await friendService.getFriendsWithStatus();
            setFriends(data.friends || []);
        } catch (err) {
            console.error('Erreur lors du chargement des amis:', err);
        }
    };

    // Auto-scroll vers le dernier message
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const toggleMode = () => {
        setMode((prev) => {
            const index = MODE_SEQUENCE.indexOf(prev);
            const nextIndex = index >= 0 ? (index + 1) % MODE_SEQUENCE.length : 0;
            return MODE_SEQUENCE[nextIndex];
        });
    };

    const handleShowModeModal = () => {
        setShowModeModal(true);
    };

    const handleConfirmCreateGame = async () => {
        setError(null);
        setSuccess(null);
        setLoading(true);
        setShowModeModal(false);

        try {
            // Start matchmaking via Socket.io
            socketRef.current.emit('matchmaking:start', { mode });
            setIsSearching(true);
            setQueueSize(0);
            setSearchTimeRemaining(30);

            // Start countdown timer
            searchTimerRef.current = setInterval(() => {
                setSearchTimeRemaining(prev => {
                    if (prev <= 1) {
                        clearInterval(searchTimerRef.current);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } catch (err) {
            setError(err.message || 'Impossible de lancer la recherche');
            setLoading(false);
        }
    };

    const handleCancelSearch = () => {
        clearInterval(searchTimerRef.current);
        setIsSearching(false);
        socketRef.current?.emit('matchmaking:cancel');
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

    const handleAddFriend = async () => {
        if (!addFriendInput.trim()) {
            setError('Veuillez entrer un identifiant');
            return;
        }

        setError(null);
        setSuccess(null);
        setAddingFriend(true);

        try {
            const result = await friendService.addFriend(addFriendInput);
            setSuccess(`${result.friend.username} ajouté à vos amis!`);
            setAddFriendInput('');
            loadFriendsWithStatus();
        } catch (err) {
            setError(err.message || 'Impossible d\'ajouter l\'ami');
        } finally {
            setAddingFriend(false);
        }
    };

    const handleRemoveFriend = async (friendId) => {
        try {
            await friendService.removeFriend(friendId);
            loadFriendsWithStatus();
        } catch (err) {
            setError('Impossible de supprimer l\'ami');
        }
    };

    const handleSendMessage = () => {
        if (!chatMessage.trim() || !socketRef.current || !myRoom?.id) return;
        setSendingMessage(true);
        socketRef.current.emit('chat:send', {
            roomId: myRoom.id,
            message: chatMessage.trim()
        });
        setChatMessage('');
        setSendingMessage(false);
    };

    const copyToClipboard = () => {
        if (myRoom?.code) {
            navigator.clipboard.writeText(myRoom.code);
            setSuccess('Code copié!');
            setTimeout(() => setSuccess(null), 2000);
        }
    };

    const handleInviteFriend = (friendUsername) => {
        if (myRoom?.code) {
            const text = `Viens jouer au WikisGuessr! Code du salon: ${myRoom.code}`;
            navigator.clipboard.writeText(text);
            setSuccess(`Invitation copiée pour ${friendUsername}`);
            setTimeout(() => setSuccess(null), 2000);
        }
    };

    if (roomLoading) {
        return (
            <div className="mx-auto w-full max-w-6xl px-3 py-4">
                <p className="text-slate-500">Chargement du salon...</p>
            </div>
        );
    }

    return (
        <div className="mx-auto w-full max-w-6xl px-3 py-4">
            <h1 className="mb-3 text-2xl font-bold text-slate-900">Lobby</h1>

            {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
            {success && <p className="mb-2 text-xs text-emerald-700">{success}</p>}

            <div className="grid gap-3 lg:grid-cols-4">
                {/* Mon salon */}
                {myRoom && (
                    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                        <h2 className="mb-2 text-sm font-semibold text-slate-900">Mon salon</h2>
                        <div className="mb-2 flex flex-col gap-1.5">
                            <div className="flex items-center gap-1">
                                <span className="text-xs text-slate-600">Code: </span>
                                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-bold text-slate-900">
                                    {myRoom.code}
                                </code>
                                <button
                                    type="button"
                                    onClick={copyToClipboard}
                                    className="text-xs text-slate-600 hover:bg-slate-100 rounded px-1"
                                >
                                    📋
                                </button>
                            </div>

                            {/* Membres du salon */}
                            <div>
                                <h3 className="mb-1 text-xs font-semibold text-slate-900">Joueurs ({members.length + 1})</h3>
                                <div className="flex flex-col gap-0.5">
                                    <span className="rounded bg-slate-900 px-1.5 py-0.5 text-xs text-white font-semibold">
                                        Vous
                                    </span>
                                    {members.map((member) => (
                                        <div key={member.id} className="flex items-center justify-between gap-1 rounded bg-slate-100 px-1.5 py-0.5">
                                            <span className="text-xs text-slate-900">{member.username}</span>
                                            <button
                                                type="button"
                                                onClick={() => setReportTarget(member)}
                                                className="text-xs text-slate-400 hover:text-red-500"
                                                title="Signaler ce joueur"
                                            >
                                                🚩
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Rejoindre un salon */}
                <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                    <h2 className="mb-2 text-sm font-semibold text-slate-900">Rejoindre</h2>
                    <div className="flex flex-col gap-1.5">
                        <input
                            type="text"
                            value={joinCode}
                            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                            placeholder="Code"
                            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-900 placeholder-slate-400"
                        />
                        <button
                            type="button"
                            onClick={handleJoinRoom}
                            disabled={joiningRoom || !joinCode.trim()}
                            className="rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-60"
                        >
                            {joiningRoom ? '...' : 'Rejoindre'}
                        </button>
                    </div>
                </div>

                {/* Créer une partie */}
                <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                    <h2 className="mb-2 text-sm font-semibold text-slate-900">Lancer</h2>
                    <div className="flex flex-col gap-1.5">
                        <button
                            type="button"
                            onClick={toggleMode}
                            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-900"
                        >
                            Mode: {MODE_LABELS[mode]}
                        </button>
                        <button
                            type="button"
                            onClick={handleShowModeModal}
                            disabled={loading}
                            className="rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-60"
                        >
                            {loading ? '...' : 'Lancer'}
                        </button>
                    </div>
                </div>

                {/* Amis */}
                <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                    <h2 className="mb-2 text-sm font-semibold text-slate-900">Amis ({friends.length})</h2>
                    <div className="mb-2 flex flex-col gap-1">
                        <input
                            type="text"
                            value={addFriendInput}
                            onChange={(e) => setAddFriendInput(e.target.value)}
                            placeholder="Username/email"
                            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-900 placeholder-slate-400"
                        />
                        <button
                            type="button"
                            onClick={handleAddFriend}
                            disabled={addingFriend || !addFriendInput.trim()}
                            className="rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-60"
                        >
                            {addingFriend ? '...' : 'Ajouter'}
                        </button>
                    </div>
                    <div className="max-h-20 overflow-y-auto space-y-0.5">
                        {friends.map((friend) => (
                            <div
                                key={friend.id}
                                className="flex items-center justify-between gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs"
                            >
                                <div className="flex items-center gap-1 flex-1">
                                    <span className={friend.is_online ? '🟢' : '⚪'}></span>
                                    <span className="text-slate-900">{friend.username}</span>
                                </div>
                                <div className="flex gap-0.5">
                                    <button
                                        type="button"
                                        onClick={() => handleInviteFriend(friend.username)}
                                        className="text-slate-600 hover:text-slate-900 text-xs"
                                        title="Inviter"
                                    >
                                        📩
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveFriend(friend.id)}
                                        className="text-slate-500 hover:text-slate-900"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Chat */}
            {myRoom && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                    <h2 className="mb-2 text-sm font-semibold text-slate-900">Chat du salon</h2>
                    <div className="mb-2 max-h-32 overflow-y-auto rounded bg-slate-50 p-2 space-y-1">
                        {messages.length === 0 ? (
                            <p className="text-xs text-slate-500">Pas de messages</p>
                        ) : (
                            messages.map((msg) => (
                                <div key={msg.id} className="text-xs">
                                    <span className="font-semibold text-slate-900">{msg.username}:</span>
                                    <span className="ml-1 text-slate-700">{msg.message}</span>
                                </div>
                            ))
                        )}
                        <div ref={chatEndRef} />
                    </div>
                    <div className="flex gap-1">
                        <input
                            type="text"
                            value={chatMessage}
                            onChange={(e) => setChatMessage(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                            placeholder="Message..."
                            className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-900 placeholder-slate-400"
                        />
                        <button
                            type="button"
                            onClick={handleSendMessage}
                            disabled={sendingMessage || !chatMessage.trim()}
                            className="rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-60"
                        >
                            {sendingMessage ? '...' : 'Envoyer'}
                        </button>
                    </div>
                </div>
            )}

            {reportTarget && (
                <ReportModal
                    reportedUser={reportTarget}
                    onClose={() => setReportTarget(null)}
                />
            )}

            {showModeModal && (
                <GameModeModal
                    mode={mode}
                    onClose={() => setShowModeModal(false)}
                    onConfirm={handleConfirmCreateGame}
                />
            )}

            {isSearching && (
                <MatchmakingUI
                    mode={mode}
                    queueSize={queueSize}
                    timeRemaining={searchTimeRemaining}
                    onCancel={handleCancelSearch}
                />
            )}
        </div>
    );
}

export default Lobby;
