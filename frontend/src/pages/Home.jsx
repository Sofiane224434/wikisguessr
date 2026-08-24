import { ArrowRight, BookOpenCheck, Brain, Clock3, Compass, Flag, Link2, LogIn, MousePointerClick, Trophy, UserRound, UsersRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/Authcontext.jsx';
import { useTranslation } from 'react-i18next';

const MODES = [
    {
        key: 'normal',
        titleKey: 'home.normal_title',
        descriptionKey: 'home.normal_description',
        icon: <Compass size={25} aria-hidden="true" />,
        accent: 'teal'
    },
    {
        key: 'chrono',
        titleKey: 'home.chrono_title',
        descriptionKey: 'home.chrono_description',
        icon: <Clock3 size={25} aria-hidden="true" />,
        accent: 'ochre'
    },
    {
        key: 'knowledge',
        titleKey: 'home.knowledge_title',
        descriptionKey: 'home.knowledge_description',
        icon: <Brain size={25} aria-hidden="true" />,
        accent: 'burgundy'
    }
];

const STEPS = [
    {
        titleKey: 'home.step_1_title',
        descriptionKey: 'home.step_1_description',
        icon: <Flag size={24} aria-hidden="true" />
    },
    {
        titleKey: 'home.step_2_title',
        descriptionKey: 'home.step_2_description',
        icon: <MousePointerClick size={24} aria-hidden="true" />
    },
    {
        titleKey: 'home.step_3_title',
        descriptionKey: 'home.step_3_description',
        icon: <BookOpenCheck size={24} aria-hidden="true" />
    }
];

function Home() {
    const { t } = useTranslation();
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
                    <p className="home-eyebrow">{user ? t('home.welcome', { username: user.username }) : t('home.guest_eyebrow')}</p>
                    <h1 id="home-title">{t('home.title')}</h1>
                    <p>{t('home.subtitle')}</p>
                    <div className="home-feature-actions">
                        <button type="button" className="home-primary-action" onClick={() => openMode('normal')}>
                            <Compass size={20} aria-hidden="true" />
                            <span>{user ? t('home.quick_game') : t('home.play_now')}</span>
                            <ArrowRight size={18} aria-hidden="true" />
                        </button>
                        {!user && (
                            <button type="button" className="home-sign-in-action" onClick={() => signIn('/')}>
                                <LogIn size={19} aria-hidden="true" />
                                <span>{t('login.submit')}</span>
                            </button>
                        )}
                    </div>
                </div>
            </section>

            <section className="home-how" aria-labelledby="how-title">
                <div className="home-how-intro">
                    <p>{t('home.principle')}</p>
                    <h2 id="how-title">{t('home.how_title')}</h2>
                    <span>{t('home.how_subtitle')}</span>
                </div>
                <div className="home-steps">
                    {STEPS.map(({ titleKey, descriptionKey, icon }, index) => (
                        <article key={titleKey} className="home-step">
                            <span className="home-step-number">0{index + 1}</span>
                            <span className="home-step-icon">{icon}</span>
                            <h3>{t(titleKey)}</h3>
                            <p>{t(descriptionKey)}</p>
                        </article>
                    ))}
                </div>
                <div className="home-rule-note">
                    <Link2 size={20} aria-hidden="true" />
                    <p><strong>{t('home.rule_title')}</strong> {t('home.rule')}</p>
                </div>
            </section>

            <section className="home-modes" aria-labelledby="modes-title">
                <div className="home-section-heading">
                    <div>
                        <p>{t('home.choose')}</p>
                        <h2 id="modes-title">{t('home.modes')}</h2>
                    </div>
                    <button type="button" onClick={() => user ? navigate('/lobby') : signIn('/lobby')}>
                        {user ? t('home.view_lobby') : t('login.submit')}
                        <ArrowRight size={17} aria-hidden="true" />
                    </button>
                </div>

                <div className="home-mode-grid">
                    {MODES.map(({ key, titleKey, descriptionKey, icon, accent }) => (
                        <button key={key} type="button" className={`home-mode-card is-${accent}`} onClick={() => openMode(key)}>
                            <span className="home-mode-icon">{icon}</span>
                            <strong>{t(titleKey)}</strong>
                            <span>{t(descriptionKey)}</span>
                            <ArrowRight className="home-mode-arrow" size={19} aria-hidden="true" />
                        </button>
                    ))}
                </div>
            </section>

            <section className="home-shortcuts" aria-label={t('home.shortcuts')}>
                <button type="button" onClick={() => user ? navigate('/leaderboard') : signIn('/leaderboard')}>
                    <Trophy size={22} aria-hidden="true" />
                    <span><strong>{t('nav.leaderboard')}</strong><small>{t('home.leaderboard_description')}</small></span>
                    <ArrowRight size={18} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => user ? navigate('/profile') : signIn('/')}>
                    {user ? <UserRound size={22} aria-hidden="true" /> : <LogIn size={22} aria-hidden="true" />}
                    <span><strong>{user ? t('home.your_profile') : t('login.submit')}</strong><small>{user ? t('home.profile_description') : t('home.login_description')}</small></span>
                    <ArrowRight size={18} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => user ? navigate('/lobby') : signIn('/lobby')}>
                    <UsersRound size={22} aria-hidden="true" />
                    <span><strong>{t('home.multiplayer')}</strong><small>{t('home.multiplayer_description')}</small></span>
                    <ArrowRight size={18} aria-hidden="true" />
                </button>
            </section>
        </div>
    );
}

export default Home;