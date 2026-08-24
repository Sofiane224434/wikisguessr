import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../context/Authcontext.jsx';
import { gameRoomService, friendService, resolveMediaUrl, roomMessageService } from '../services/api.js';
import ReportModal from '../components/ui/ReportModal.jsx';
import GameModeModal from '../components/ui/GameModeModal.jsx';
import MatchmakingUI from '../components/ui/MatchmakingUI.jsx';
import { Check, Copy, Flag, KeyRound, LogOut, Play, Send, Trash2, UserPlus, Users, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const MODE_LABELS = {
    normal: 'Normal',
    knowledge: 'Connaissance',
    chrono: 'Chrono'
};

const MODE_SEQUENCE = ['normal', 'knowledge', 'chrono'];

function LobbyAvatar({ user, online = null }) {
    const [imageFailed, setImageFailed] = useState(false);
    const avatarUrl = resolveMediaUrl(user?.avatar_url);
    const initial = String(user?.username || '?').slice(0, 1).toUpperCase();

    return (
        <span className="lobby-avatar" aria-hidden="true">
            {avatarUrl && !imageFailed ? (
                <img src={avatarUrl} alt="" onError={() => setImageFailed(true)} />
            ) : initial}
            {online !== null && <i className={online ? 'is-online' : ''} />}
        </span>
    );
}

function Lobby() {
    const { t } = useTranslation();
    const { user } = useAuth();
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
    const [friendRequests, setFriendRequests] = useState([]);
    const [roomInvitations, setRoomInvitations] = useState([]);
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
    const [matchmakingPlayers, setMatchmakingPlayers] = useState([]);
    const [matchmakingTarget, setMatchmakingTarget] = useState(8);
    const [searchingWithRoom, setSearchingWithRoom] = useState(false);

    const handleMatchFound = useEffectEvent((notifyData) => {
        setIsSearching(false);
        setSuccess(t('lobby.game_created'));
        navigate(`/game?code=${encodeURIComponent(notifyData.game.code)}`);
    });

    const handleRoomGameStarted = useEffectEvent(({ game }) => {
        navigate(`/game?code=${encodeURIComponent(game.code)}`);
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

        socket.on('matchmaking:updated', ({ targetSize, players }) => {
            setMatchmakingTarget(targetSize || 8);
            setMatchmakingPlayers(Array.isArray(players) ? players : []);
        });

        socket.on('matchmaking:found', handleMatchFound);

        socket.on('matchmaking:error', ({ error: matchmakingError }) => {
            setError(matchmakingError || 'Impossible de créer la partie');
            setIsSearching(false);
            setLoading(false);
        });
        socket.on('room:updated', () => loadMyRoom());
        socket.on('room:closed', () => {
            setMyRoom(null);
            setMembers([]);
            setMessages([]);
        });
        socket.on('room:game-started', handleRoomGameStarted);
        socket.on('room:invited', () => loadRoomInvitations());
        socket.on('friend:request', () => loadFriendRequests());
        socket.on('friend:updated', () => loadFriendsWithStatus());

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
        loadFriendRequests();
        loadRoomInvitations();
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

    const loadFriendRequests = async () => {
        try {
            const data = await friendService.getRequests();
            setFriendRequests(data.requests || []);
        } catch (err) {
            console.error('Erreur lors du chargement des demandes:', err);
        }
    };

    const loadRoomInvitations = async () => {
        try {
            const data = await gameRoomService.getInvitations();
            setRoomInvitations(data.invitations || []);
        } catch (err) {
            console.error('Erreur lors du chargement des invitations:', err);
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
            setMatchmakingPlayers([]);
        } catch (err) {
            setError(err.message || 'Impossible de lancer la recherche');
            setLoading(false);
        }
    };

    const handleCancelSearch = () => {
        setIsSearching(false);
        setLoading(false);
        setSearchingWithRoom(false);
        socketRef.current?.emit('matchmaking:cancel');
    };

    const handleStartMatchNow = async () => {
        if (searchingWithRoom && myRoom?.id) {
            try {
                await gameRoomService.startGame(myRoom.id, mode);
            } catch (err) {
                setError(err.message || 'Impossible de lancer la partie');
                setLoading(false);
            }
            return;
        }
        socketRef.current?.emit('matchmaking:start-now', { mode });
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
            setSuccess(t('lobby.friend_request_sent', { username: result.request.username }));
            setAddFriendInput('');
        } catch (err) {
            setError(err.message || 'Impossible d\'ajouter l\'ami');
        } finally {
            setAddingFriend(false);
        }
    };

    const handleFriendRequest = async (requestId, accept) => {
        try {
            await friendService.respondToRequest(requestId, accept);
            await Promise.all([loadFriendRequests(), loadFriendsWithStatus()]);
        } catch (err) {
            setError(err.message || 'Impossible de traiter la demande');
        }
    };

    const handleRoomInvitation = async (invitationId, accept) => {
        try {
            await gameRoomService.respondToInvitation(invitationId, accept);
            await loadRoomInvitations();
            if (accept) await loadMyRoom();
        } catch (err) {
            setError(err.message || 'Impossible de traiter l\'invitation');
        }
    };

    const handleLeaveRoom = async () => {
        try {
            await gameRoomService.leaveRoom(myRoom.id);
            socketRef.current?.emit('room:leave', myRoom.id);
            setMyRoom(null);
            setMembers([]);
            setMessages([]);
        } catch (err) {
            setError(err.message || 'Impossible de quitter le salon');
        }
    };

    const handleStartRoomGame = async () => {
        setSearchingWithRoom(true);
        setMatchmakingPlayers(members.map((member) => ({
            userId: member.id,
            username: member.username,
            avatar_url: member.avatar_url
        })));
        setMatchmakingTarget(8);
        setIsSearching(true);
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

    const handleInviteFriend = async (friend) => {
        try {
            await gameRoomService.inviteFriend(myRoom.id, friend.id);
            setSuccess(t('lobby.room_invite_sent', { username: friend.username }));
        } catch (err) {
            setError(err.message || 'Impossible d\'envoyer l\'invitation');
        }
    };

    if (roomLoading) {
        return (
            <div className="lobby-scene lobby-loading">
                <p>{t('lobby.opening')}</p>
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
                <h1 className="lobby-title">{t('lobby.title')}</h1>

                {(error || success) && (
                    <div className={`lobby-notice ${error ? 'is-error' : 'is-success'}`} role="status">
                        {error || success}
                    </div>
                )}

                <div className="lobby-grid">
                    <section className="paper border-2 shadow-large lobby-panel lobby-community" aria-labelledby="community-title">
                        <h2 id="community-title">{t('lobby.community')}</h2>
                        <div className="lobby-search-row">
                            <input
                                type="text"
                                value={addFriendInput}
                                onChange={(event) => setAddFriendInput(event.target.value)}
                                onKeyDown={(event) => event.key === 'Enter' && handleAddFriend()}
                                placeholder={t('lobby.add_friend')}
                                aria-label={t('lobby.add_friend_label')}
                            />
                            <button
                                type="button"
                                className="lobby-icon-button"
                                onClick={handleAddFriend}
                                disabled={addingFriend || !addFriendInput.trim()}
                                title={t('lobby.add_friend_title')}
                            >
                                <UserPlus size={19} aria-hidden="true" />
                            </button>
                        </div>

                        <div className="lobby-friends-heading">
                            <strong>{t('lobby.friends_online')}</strong>
                            <span>{t('lobby.friends_count', { count: friends.length })}</span>
                        </div>
                        {[...friendRequests.map((request) => ({ ...request, kind: 'friend' })), ...roomInvitations.map((invitation) => ({ ...invitation, kind: 'room' }))].map((request) => (
                            <div className="lobby-friend" key={`${request.kind}-${request.id}`}>
                                <LobbyAvatar user={{ username: request.username || request.inviter_username, avatar_url: request.avatar_url }} />
                                <span className="lobby-friend-name">
                                    {request.kind === 'friend' ? request.username : `${request.inviter_username} · ${request.code}`}
                                </span>
                                <button type="button" className="lobby-icon-button" onClick={() => request.kind === 'friend' ? handleFriendRequest(request.id, true) : handleRoomInvitation(request.id, true)} title={t('lobby.accept')}>
                                    <Check size={16} aria-hidden="true" />
                                </button>
                                <button type="button" className="lobby-icon-button is-danger" onClick={() => request.kind === 'friend' ? handleFriendRequest(request.id, false) : handleRoomInvitation(request.id, false)} title={t('lobby.decline')}>
                                    <X size={16} aria-hidden="true" />
                                </button>
                            </div>
                        ))}
                        <div className="lobby-friends-list">
                            {friends.length === 0 ? (
                                <p className="lobby-empty">{t('lobby.empty_friends')}</p>
                            ) : friends.map((friend) => (
                                <div className="lobby-friend" key={friend.id}>
                                    <LobbyAvatar user={friend} online={Boolean(friend.is_online)} />
                                    <span className="lobby-friend-name">{friend.username}</span>
                                    <button
                                        type="button"
                                        className="lobby-icon-button"
                                        onClick={() => handleInviteFriend(friend)}
                                        title={t('lobby.invite', { username: friend.username })}
                                    >
                                        <Send size={16} aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        className="lobby-icon-button is-danger"
                                        onClick={() => handleRemoveFriend(friend.id)}
                                        title={t('lobby.remove', { username: friend.username })}
                                    >
                                        <Trash2 size={16} aria-hidden="true" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="paper border shadow-large lobby-panel lobby-games lobby-play-hub" aria-labelledby="games-title">
                        <div className="lobby-hub-heading">
                            <span>{t('lobby.new_expedition')}</span>
                            <h2 id="games-title">{t('lobby.explore')}</h2>
                        </div>

                        <div className="lobby-planet-stage">
                            <div className="lobby-orbit-ring" aria-hidden="true" />
                            <div className="lobby-mode-orbit" role="radiogroup" aria-label={t('lobby.game_mode')}>
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
                                        <span>{t(`common.${modeValue}`, { defaultValue: MODE_LABELS[modeValue] })}</span>
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
                            {loading ? t('lobby.preparing') : t('lobby.launch', { mode: t(`common.${mode}`) })}
                        </button>

                        <div className="lobby-join-dock">
                            <label htmlFor="room-code"><KeyRound size={17} aria-hidden="true" /> {t('lobby.join_room')}</label>
                            <div>
                                <input
                                    id="room-code"
                                    type="text"
                                    value={joinCode}
                                    onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                                    onKeyDown={(event) => event.key === 'Enter' && handleJoinRoom()}
                                    maxLength={12}
                                    placeholder="CODE"
                                    aria-label={t('lobby.room_code')}
                                />
                                <button
                                    type="button"
                                    className="paper-btn lobby-secondary-button"
                                    onClick={handleJoinRoom}
                                    disabled={joiningRoom || !joinCode.trim()}
                                >
                                    {joiningRoom ? t('lobby.joining') : t('lobby.join')}
                                </button>
                            </div>
                        </div>
                    </section>

                    <section className="paper border-5 shadow-large lobby-panel lobby-room" aria-labelledby="room-title">
                        <div>
                            <h2 id="room-title">{t('lobby.my_room')}</h2>
                            <p className="lobby-room-subtitle">{t('lobby.private_study')}</p>
                        </div>

                        {myRoom ? (
                            <>
                                <button type="button" className="paper-btn lobby-room-code" onClick={copyToClipboard} title={t('lobby.copy_code')}>
                                    <span>{myRoom.code}</span>
                                    <Copy size={17} aria-hidden="true" />
                                </button>

                                <div className="lobby-search-row">
                                    {Number(myRoom.owner_id) === Number(user?.id) && (
                                        <button type="button" className="paper-btn lobby-primary-button" onClick={handleStartRoomGame} disabled={loading}>
                                            <Play size={17} aria-hidden="true" /> {t('lobby.start_with_room')}
                                        </button>
                                    )}
                                    <button type="button" className="lobby-icon-button is-danger" onClick={handleLeaveRoom} title={t('lobby.leave_room')}>
                                        <LogOut size={17} aria-hidden="true" />
                                    </button>
                                </div>

                                <div className="lobby-explorers">
                                    <h3><Users size={19} aria-hidden="true" /> {t('lobby.explorers', { count: members.length })}</h3>
                                    {members.map((member) => (
                                        <div className={`lobby-member${Number(member.id) === Number(user?.id) ? ' is-self' : ''}`} key={member.id}>
                                            <LobbyAvatar user={member} />
                                            <span>{Number(member.id) === Number(user?.id) ? t('lobby.you') : member.username}{Number(member.id) === Number(myRoom.owner_id) ? ` · ${t('lobby.host')}` : ''}</span>
                                            {Number(member.id) !== Number(user?.id) && <button
                                                type="button"
                                                className="lobby-icon-button is-danger"
                                                onClick={() => setReportTarget(member)}
                                                title={t('lobby.report', { username: member.username })}
                                            >
                                                <Flag size={15} aria-hidden="true" />
                                            </button>}
                                        </div>
                                    ))}
                                </div>

                                <div className="lobby-chat-log" aria-live="polite">
                                    {messages.length === 0 ? (
                                        <p className="lobby-empty">{t('lobby.silent')}</p>
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
                                        placeholder={t('lobby.chat')}
                                        aria-label="Message du salon"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleSendMessage}
                                        disabled={sendingMessage || !chatMessage.trim()}
                                        title={t('lobby.send')}
                                    >
                                        <Send size={20} aria-hidden="true" />
                                    </button>
                                </div>
                            </>
                        ) : (
                            <p className="lobby-empty">{t('lobby.no_room')}</p>
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
                    players={matchmakingPlayers}
                    targetSize={matchmakingTarget}
                    onCancel={handleCancelSearch}
                    onStartNow={handleStartMatchNow}
                />
            )}
        </div>
    );
}

export default Lobby;
