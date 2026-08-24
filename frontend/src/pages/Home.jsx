import { ArrowRight, BookOpenCheck, Brain, Clock3, Compass, Flag, Link2, LogIn, MousePointerClick, Trophy, UserRound, UsersRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/Authcontext.jsx';

const MODES = [
    {
        key: 'normal',
        title: 'Exploration classique',
        description: 'Reliez deux articles avec le moins de clics possible.',
        icon: <Compass size={25} aria-hidden="true" />,
        accent: 'teal'
    },
    {
        key: 'chrono',
        title: 'Course contre la montre',
        description: 'Cinq minutes pour atteindre la cible avant la fin du temps.',
        icon: <Clock3 size={25} aria-hidden="true" />,
        accent: 'ochre'
    },
    {
        key: 'knowledge',
        title: 'Défi connaissance',
        description: 'Terminez le parcours puis répondez au quiz final.',
        icon: <Brain size={25} aria-hidden="true" />,
        accent: 'burgundy'
    }
];

const STEPS = [
    {
        title: 'Découvrez votre mission',
        description: 'Une page de départ et un article cible vous sont attribués au début de chaque manche.',
        icon: <Flag size={24} aria-hidden="true" />
    },
    {
        title: 'Suivez les liens',
        description: 'Parcourez les liens présents dans les articles Wikipédia, sans utiliser la barre de recherche.',
        icon: <MousePointerClick size={24} aria-hidden="true" />
    },
    {
        title: 'Atteignez la cible',
        description: 'Trouvez le chemin le plus court, puis comparez votre temps et votre nombre de clics.',
        icon: <BookOpenCheck size={24} aria-hidden="true" />
    }
];

function Home() {
    const navigate = useNavigate();
    const { user } = useAuth();

    const signIn = (destination = '/') => {
        navigate(`/login?next=${encodeURIComponent(destination)}`);
    };

    const openMode = (mode) => {
        const destination = `/lobby?mode=${mode}`;
        if (user) {
            navigate(destination);
            return;
        }

        signIn(destination);
    };

    return (
        <div className="home-dashboard">
            <section className="home-feature" aria-labelledby="home-title">
                <div className="home-feature-shade" />
                <div className="home-feature-content">
                    <p className="home-eyebrow">{user ? `Bienvenue, ${user.username}` : 'Le défi Wikipédia nouvelle génération'}</p>
                    <h1 id="home-title">Votre prochaine expédition commence ici</h1>
                    <p>Partez d’un article Wikipédia et rejoignez une page cible uniquement grâce aux liens rencontrés en chemin. Chaque clic compte.</p>
                    <div className="home-feature-actions">
                        <button type="button" className="home-primary-action" onClick={() => openMode('normal')}>
                            <Compass size={20} aria-hidden="true" />
                            <span>{user ? 'Partie rapide' : 'Jouer maintenant'}</span>
                            <ArrowRight size={18} aria-hidden="true" />
                        </button>
                        {!user && (
                            <button type="button" className="home-sign-in-action" onClick={() => signIn('/')}>
                                <LogIn size={19} aria-hidden="true" />
                                <span>Sign in</span>
                            </button>
                        )}
                    </div>
                </div>
            </section>

            <section className="home-how" aria-labelledby="how-title">
                <div className="home-how-intro">
                    <p>Le principe</p>
                    <h2 id="how-title">Comment jouer à WikisGuessr ?</h2>
                    <span>Pas besoin de connaître Wikipédia par cœur : observation, logique et curiosité font la différence.</span>
                </div>
                <div className="home-steps">
                    {STEPS.map(({ title, description, icon }, index) => (
                        <article key={title} className="home-step">
                            <span className="home-step-number">0{index + 1}</span>
                            <span className="home-step-icon">{icon}</span>
                            <h3>{title}</h3>
                            <p>{description}</p>
                        </article>
                    ))}
                </div>
                <div className="home-rule-note">
                    <Link2 size={20} aria-hidden="true" />
                    <p><strong>La règle essentielle :</strong> utilisez uniquement les liens des articles. La recherche directe est interdite pendant la manche.</p>
                </div>
            </section>

            <section className="home-modes" aria-labelledby="modes-title">
                <div className="home-section-heading">
                    <div>
                        <p>Choisir une expérience</p>
                        <h2 id="modes-title">Modes de jeu</h2>
                    </div>
                    <button type="button" onClick={() => user ? navigate('/lobby') : signIn('/lobby')}>
                        {user ? 'Voir le lobby' : 'Sign in'}
                        <ArrowRight size={17} aria-hidden="true" />
                    </button>
                </div>

                <div className="home-mode-grid">
                    {MODES.map(({ key, title, description, icon, accent }) => (
                        <button key={key} type="button" className={`home-mode-card is-${accent}`} onClick={() => openMode(key)}>
                            <span className="home-mode-icon">{icon}</span>
                            <strong>{title}</strong>
                            <span>{description}</span>
                            <ArrowRight className="home-mode-arrow" size={19} aria-hidden="true" />
                        </button>
                    ))}
                </div>
            </section>

            <section className="home-shortcuts" aria-label="Raccourcis">
                <button type="button" onClick={() => user ? navigate('/leaderboard') : signIn('/leaderboard')}>
                    <Trophy size={22} aria-hidden="true" />
                    <span><strong>Classement</strong><small>Comparez vos meilleurs scores</small></span>
                    <ArrowRight size={18} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => user ? navigate('/profile') : signIn('/')}>
                    {user ? <UserRound size={22} aria-hidden="true" /> : <LogIn size={22} aria-hidden="true" />}
                    <span><strong>{user ? 'Votre profil' : 'Sign in'}</strong><small>{user ? 'Historique et paramètres du compte' : 'Connectez-vous ou créez votre compte'}</small></span>
                    <ArrowRight size={18} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => user ? navigate('/lobby') : signIn('/lobby')}>
                    <UsersRound size={22} aria-hidden="true" />
                    <span><strong>Salon multijoueur</strong><small>Rejoignez vos amis avec un code</small></span>
                    <ArrowRight size={18} aria-hidden="true" />
                </button>
            </section>
        </div>
    );
}

export default Home;