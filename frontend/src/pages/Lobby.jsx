import { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import Sign from '../components/ui/Sign.jsx';

// Icône «inviter» (enveloppe) en SVG inline
function InviteIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            style={{ display: 'block', width: '10px', height: '10px', flexShrink: 0, border: 'none', boxShadow: 'none', borderRadius: 0 }}
        >
            <path d="M3 4a2 2 0 0 0-2 2v1.5l9 5.25 9-5.25V6a2 2 0 0 0-2-2H3Z" />
            <path d="M1 9.5V14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9.5l-9 5.25L1 9.5Z" />
        </svg>
    );
}

// Liste de joueurs en attente dans le lobby (données de démo)
const DEMO_PLAYERS = [
    { id: 1, pseudo: 'Azim404' },
    { id: 2, pseudo: 'WikiMaster' },
    { id: 3, pseudo: 'Lecturix' },
    { id: 4, pseudo: 'Socrates99' },
    { id: 5, pseudo: 'Pandora' },
    { id: 6, pseudo: 'Hermes_X' },
];

function LobbyInvitePanel() {
    return (
        <Sign title="Inviter" scrollHeight="120px">
            <ul className="flex flex-col gap-0.5" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {DEMO_PLAYERS.map((player) => (
                    <li
                        key={player.id}
                        className="flex items-center justify-between gap-1 text-[11px]"
                        style={{ background: 'transparent', border: 'none', boxShadow: 'none', padding: '1px 0', margin: 0, color: '#fdf6e3', textShadow: '0 1px 2px rgba(0,0,0,0.7)' }}
                    >
                        <span
                            className="min-w-0 grow overflow-hidden text-ellipsis whitespace-nowrap"
                            style={{ paddingLeft: '8px' }}
                        >{player.pseudo}</span>
                        <div
                            role="button"
                            tabIndex={0}
                            title={`Inviter ${player.pseudo}`}
                            className="shrink-0 flex items-center justify-center w-3.5 h-3.5 rounded-full cursor-pointer transition-opacity hover:opacity-75"
                            style={{ background: '#92400e', color: '#fef3c7' }}
                            onClick={() => alert(`Invitation envoyée à ${player.pseudo}`)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') alert(`Invitation envoyée à ${player.pseudo}`); }}
                        >
                            <InviteIcon />
                        </div>
                    </li>
                ))}
            </ul>
        </Sign>
    );
}

function Lobby() {
    const { setRightColumnSigns } = useOutletContext();

    useEffect(() => {
        setRightColumnSigns([<LobbyInvitePanel key="invite" />]);
        return () => setRightColumnSigns([]);
    }, [setRightColumnSigns]);

    return null;
}

export default Lobby;
