import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { gameService, gameRoomService, friendService, roomMessageService } from '../services/api.js';
import ReportModal from '../components/ui/ReportModal.jsx';
import GameModeModal from '../components/ui/GameModeModal.jsx';
import MatchmakingUI from '../components/ui/MatchmakingUI.jsx';
import { Copy, Flag, KeyRound, Play, Send, Trash2, UserPlus, Users } from 'lucide-react';

const MODE_LABELS = {
    normal: 'Normal',
    knowledge: 'Connaissance',
    chrono: 'Chrono'
};

const MODE_SEQUENCE = ['normal', 'knowledge', 'chrono'];

function Lobby() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const requestedMode = searchParams.get('mode');
    const [mode, setMode] = useState(MODE_SEQUENCE.includes(requestedMode) ? requestedMode : 'normal');
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

    const handleMatchFound = useEffectEvent(async (notifyData) => {
        clearInterval(searchTimerRef.current);
        setIsSearching(false);

        try {
            const data = await gameService.create({
                mode,
                realPlayers: notifyData.players,
                botCount: notifyData.botCount
            });

            setSuccess(`Partie créée ! ${notifyData.totalPlayers} joueurs.`);
            navigate(`/game?code=${encodeURIComponent(data.game.code)}`);
        } catch (creationError) {
            setError(creationError.message || 'Erreur création partie après match');
            setLoading(false);
        }
    });

    const handleSoloFallback = useEffectEvent((data) => {
        clearInterval(searchTimerRef.current);
        setIsSearching(false);
        setSuccess(data.message);

        gameService.create({ mode, solo: true })
            .then((response) => navigate(`/game?code=${encodeURIComponent(response.game.code)}`))
            .catch((creationError) => {
                setError(creationError.message || 'Erreur création partie solo');
                setLoading(false);
            });
    });

    // Connexion socket au montage
    useEffect(() => {
        const token = localStorage.getItem('token');
        const socketUrl = import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin;
        const socket = io(socketUrl, {
            auth: { token },
            transports: import.meta.env.DEV ? ['polling'] : ['websocket', 'polling']
        });
        socketRef.current = socket;

        socket.on('chat:message', (msg) => {
            setMessages(prev => [...prev, msg]);
        });

        socket.on('matchmaking:joined', ({ mode, queueSize }) => {
            console.log(`[Matchmaking] Joined ${mode} queue, size: ${queueSize}`);
            setQueueSize(queueSize);
        });

        socket.on('matchmaking:found', handleMatchFound);

        socket.on('matchmaking:solo-fallback', handleSoloFallback);

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
        setLoading(false);
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
        } catch {
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
            <div className="lobby-scene lobby-loading">
                <p>Ouverture de la bibliothèque...</p>
            </div>
        );
    }

    return (
        <div className="lobby-scene">
            <div className="lobby-shade" aria-hidden="true" />
            <div className="lobby-column is-left" aria-hidden="true">
                <img src="/assets/img/hautecolonne.svg" alt="" />
                <div />
                <img src="/assets/img/hautecolonne.svg" alt="" />
            </div>
            <div className="lobby-column is-right" aria-hidden="true">
                <img src="/assets/img/hautecolonne.svg" alt="" />
                <div />
                <img src="/assets/img/hautecolonne.svg" alt="" />
            </div>
            <div className="lobby-content">
                <h1 className="lobby-title">Lobby</h1>

                {(error || success) && (
                    <div className={`lobby-notice ${error ? 'is-error' : 'is-success'}`} role="status">
                        {error || success}
                    </div>
                )}

                <div className="lobby-grid">
                    <section className="paper border border-2 shadow-large lobby-panel lobby-community" aria-labelledby="community-title">
                        <h2 id="community-title">Amis &amp;<br />communauté</h2>
                        <div className="lobby-search-row">
                            <input
                                type="text"
                                value={addFriendInput}
                                onChange={(event) => setAddFriendInput(event.target.value)}
                                onKeyDown={(event) => event.key === 'Enter' && handleAddFriend()}
                                placeholder="Ajouter un érudit"
                                aria-label="Ajouter un ami"
                            />
                            <button
                                type="button"
                                className="lobby-icon-button"
                                onClick={handleAddFriend}
                                disabled={addingFriend || !addFriendInput.trim()}
                                title="Ajouter cet ami"
                            >
                                <UserPlus size={19} aria-hidden="true" />
                            </button>
                        </div>

                        <div className="lobby-friends-heading">
                            <strong>Amis en ligne</strong>
                            <span>Amis ({friends.length})</span>
                        </div>
                        <div className="lobby-friends-list">
                            {friends.length === 0 ? (
                                <p className="lobby-empty">Votre cercle d’érudits est vide.</p>
                            ) : friends.map((friend) => (
                                <div className="lobby-friend" key={friend.id}>
                                    <span className="lobby-avatar" aria-hidden="true">
                                        {String(friend.username || '?').slice(0, 1).toUpperCase()}
                                        <i className={friend.is_online ? 'is-online' : ''} />
                                    </span>
                                    <span className="lobby-friend-name">{friend.username}</span>
                                    <button
                                        type="button"
                                        className="lobby-icon-button"
                                        onClick={() => handleInviteFriend(friend.username)}
                                        title={`Inviter ${friend.username}`}
                                    >
                                        <Send size={16} aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        className="lobby-icon-button is-danger"
                                        onClick={() => handleRemoveFriend(friend.id)}
                                        title={`Retirer ${friend.username}`}
                                    >
                                        <Trash2 size={16} aria-hidden="true" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="paper border border-1 shadow-large lobby-panel lobby-games lobby-play-hub" aria-labelledby="games-title">
                        <div className="lobby-hub-heading">
                            <span>Nouvelle expédition</span>
                            <h2 id="games-title">Explorez Wikipédia</h2>
                        </div>

                        <div className="lobby-planet-stage">
                            <div className="lobby-orbit-ring" aria-hidden="true" />
                            <div className="lobby-mode-orbit" role="radiogroup" aria-label="Mode de jeu">
                                {MODE_SEQUENCE.map((modeValue) => (
                                    <button
                                        key={modeValue}
                                        type="button"
                                        role="radio"
                                        aria-checked={mode === modeValue}
                                        className={`lobby-mode-star is-${modeValue}${mode === modeValue ? ' is-active' : ''}`}
                                        onClick={() => setMode(modeValue)}
                                    >
                                        <i aria-hidden="true" />
                                        <span>{MODE_LABELS[modeValue]}</span>
                                    </button>
                                ))}
                            </div>
                            <div className="lobby-wiki-planet" aria-hidden="true">
                                <div className="lobby-planet-grid" />
                                <strong>W</strong>
                                <span>WIKIPÉDIA</span>
                            </div>
                        </div>

                        <button
                            type="button"
                            className="paper-btn lobby-primary-button lobby-launch-button"
                            onClick={handleShowModeModal}
                            disabled={loading}
                        >
                            <Play size={18} fill="currentColor" aria-hidden="true" />
                            {loading ? 'Préparation...' : `Lancer · ${MODE_LABELS[mode]}`}
                        </button>

                        <div className="lobby-join-dock">
                            <label htmlFor="room-code"><KeyRound size={17} aria-hidden="true" /> Rejoindre un salon</label>
                            <div>
                                <input
                                    id="room-code"
                                    type="text"
                                    value={joinCode}
                                    onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                                    onKeyDown={(event) => event.key === 'Enter' && handleJoinRoom()}
                                    maxLength={12}
                                    placeholder="CODE"
                                    aria-label="Code de salon"
                                />
                                <button
                                    type="button"
                                    className="paper-btn lobby-secondary-button"
                                    onClick={handleJoinRoom}
                                    disabled={joiningRoom || !joinCode.trim()}
                                >
                                    {joiningRoom ? 'Entrée...' : 'Rejoindre'}
                                </button>
                            </div>
                        </div>
                    </section>

                    <section className="paper border border-5 shadow-large lobby-panel lobby-room" aria-labelledby="room-title">
                        <div>
                            <h2 id="room-title">Mon salon</h2>
                            <p className="lobby-room-subtitle">Étude privée</p>
                        </div>

                        {myRoom ? (
                            <>
                                <button type="button" className="paper-btn lobby-room-code" onClick={copyToClipboard} title="Copier le code du salon">
                                    <span>{myRoom.code}</span>
                                    <Copy size={17} aria-hidden="true" />
                                </button>

                                <div className="lobby-explorers">
                                    <h3><Users size={19} aria-hidden="true" /> Explorateurs ({members.length + 1})</h3>
                                    <div className="lobby-member is-self">
                                        <span className="lobby-avatar">V</span>
                                        <strong>Vous</strong>
                                    </div>
                                    {members.map((member) => (
                                        <div className="lobby-member" key={member.id}>
                                            <span className="lobby-avatar">{String(member.username || '?').slice(0, 1).toUpperCase()}</span>
                                            <span>{member.username}</span>
                                            <button
                                                type="button"
                                                className="lobby-icon-button is-danger"
                                                onClick={() => setReportTarget(member)}
                                                title={`Signaler ${member.username}`}
                                            >
                                                <Flag size={15} aria-hidden="true" />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <div className="lobby-chat-log" aria-live="polite">
                                    {messages.length === 0 ? (
                                        <p className="lobby-empty">Le salon est silencieux.</p>
                                    ) : messages.map((message, messageIndex) => (
                                        <p key={message.id || `${message.username}-${message.created_at || messageIndex}`}>
                                            <strong>{message.username}</strong> {message.message}
                                        </p>
                                    ))}
                                    <div ref={chatEndRef} />
                                </div>

                                <div className="lobby-chat-input">
                                    <input
                                        type="text"
                                        value={chatMessage}
                                        onChange={(event) => setChatMessage(event.target.value)}
                                        onKeyDown={(event) => event.key === 'Enter' && handleSendMessage()}
                                        placeholder="Chat..."
                                        aria-label="Message du salon"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleSendMessage}
                                        disabled={sendingMessage || !chatMessage.trim()}
                                        title="Envoyer"
                                    >
                                        <Send size={20} aria-hidden="true" />
                                    </button>
                                </div>
                            </>
                        ) : (
                            <p className="lobby-empty">Aucun salon actif.</p>
                        )}
                    </section>
                </div>
            </div>

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
