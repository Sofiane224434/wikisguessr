import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gameService, gameRoomService, friendService, roomMessageService } from '../services/api.js';

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
    const [lastMessageTime, setLastMessageTime] = useState(null);

    useEffect(() => {
        loadMyRoom();
        loadFriends();
    }, []);

    useEffect(() => {
        if (myRoom?.id) {
            loadMessages();
            const interval = setInterval(() => {
                pollNewMessages();
            }, 2000);
            return () => clearInterval(interval);
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

    const loadFriends = async () => {
        try {
            const data = await friendService.getFriends();
            setFriends(data.friends || []);
        } catch (err) {
            console.error('Erreur lors du chargement des amis:', err);
        }
    };

    const loadMessages = async () => {
        try {
            const data = await roomMessageService.getMessages(myRoom.id, 30);
            setMessages(data.messages || []);
            if (data.messages && data.messages.length > 0) {
                setLastMessageTime(data.messages[data.messages.length - 1].created_at);
            }
        } catch (err) {
            console.error('Erreur lors du chargement des messages:', err);
        }
    };

    const pollNewMessages = async () => {
        try {
            if (!myRoom?.id || !lastMessageTime) return;
            const data = await roomMessageService.getNewMessages(myRoom.id, lastMessageTime);
            if (data.messages && data.messages.length > 0) {
                setMessages(prev => [...prev, ...data.messages]);
                setLastMessageTime(data.messages[data.messages.length - 1].created_at);
            }
        } catch (err) {
            console.error('Erreur lors du polling des messages:', err);
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
            loadFriends();
        } catch (err) {
            setError(err.message || 'Impossible d\'ajouter l\'ami');
        } finally {
            setAddingFriend(false);
        }
    };

    const handleRemoveFriend = async (friendId) => {
        try {
            await friendService.removeFriend(friendId);
            loadFriends();
        } catch (err) {
            setError('Impossible de supprimer l\'ami');
        }
    };

    const handleSendMessage = async () => {
        if (!chatMessage.trim()) return;

        setError(null);
        setSendingMessage(true);

        try {
            await roomMessageService.sendMessage(myRoom.id, chatMessage);
            setChatMessage('');
            loadMessages();
        } catch (err) {
            setError(err.message || 'Impossible d\'envoyer le message');
        } finally {
            setSendingMessage(false);
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
                                <div className="flex flex-wrap gap-0.5">
                                    <span className="rounded bg-slate-900 px-1.5 py-0.5 text-xs text-white font-semibold">
                                        Vous
                                    </span>
                                    {members.map((member) => (
                                        <span
                                            key={member.id}
                                            className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-900"
                                        >
                                            {member.username}
                                        </span>
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
                            onClick={handleCreateGame}
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
                                <span className="text-slate-900">{friend.username}</span>
                                <button
                                    type="button"
                                    onClick={() => handleRemoveFriend(friend.id)}
                                    className="text-slate-500 hover:text-slate-900"
                                >
                                    ✕
                                </button>
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
        </div>
    );
}

export default Lobby;
