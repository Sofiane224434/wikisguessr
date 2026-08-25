// components/Header.jsx
import LanguageSelect from "../ui/LanguageSelect";
import WikisGuessrLogo from "../ui/WikisGuessrLogo";
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/Authcontext.jsx';
import { BookOpen, Globe2, House, LogIn, LogOut, MoreHorizontal, ShoppingBag, Trophy, UserPlus, UserRound, UsersRound, X } from 'lucide-react';
import { createElement, useState } from 'react';
import { useTranslation } from 'react-i18next';

const PRIMARY_LINKS = [
    { to: '/', labelKey: 'nav.home', icon: House },
    { to: '/lobby', labelKey: 'nav.lobby', icon: UsersRound },
    { to: '/leaderboard', labelKey: 'nav.leaderboard', mobileLabelKey: 'nav.scores', icon: Trophy },
    { to: '/shop', labelKey: 'nav.shop', icon: ShoppingBag },
    { to: '/profile', labelKey: 'nav.profile', icon: UserRound }
];

const MOBILE_PRIMARY_LINKS = PRIMARY_LINKS.filter(({ to }) => to !== '/profile');

function Header() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout } = useAuth();
    const [menuOpen, setMenuOpen] = useState(false);
    const isLoginRoute = location.pathname === '/login';
    const isMoreRoute = location.pathname === '/profile' || location.pathname.startsWith('/admin');

    const handleLogout = () => {
        setMenuOpen(false);
        logout();
        navigate('/login');
    };

    const navLinks = user?.role === 'admin'
        ? [...PRIMARY_LINKS, { to: '/admin', labelKey: 'nav.admin', icon: BookOpen }]
        : PRIMARY_LINKS;

    return (
        <header className={`site-header ${user ? 'has-session' : 'is-public'}`}>
            <div className="site-header-inner">
                <button
                    type="button"
                    className="site-brand"
                    onClick={() => navigate('/')}
                    aria-label="Accueil WikisGuessr"
                >
                    <WikisGuessrLogo size="sm" duration={120} />
                </button>

                {user && (
                    <nav className="site-nav" aria-label="Navigation principale">
                        {navLinks.map(({ to, labelKey, icon }) => (
                            <NavLink
                                key={to}
                                to={to}
                                className={({ isActive }) => `site-nav-link${isActive ? ' is-active' : ''}`}
                            >
                                {createElement(icon, { size: 17, 'aria-hidden': true })}
                                <span>{t(labelKey)}</span>
                            </NavLink>
                        ))}
                    </nav>
                )}

                <div className="site-header-tools">
                    <div className="site-language">
                        <Globe2 size={18} aria-hidden="true" />
                        <LanguageSelect className="site-language-select" />
                    </div>
                    {user ? (
                        <button type="button" className="paper-btn site-session-button" onClick={handleLogout} title={t('nav.logout')}>
                            <LogOut size={18} aria-hidden="true" />
                            <span>{t('nav.logout')}</span>
                        </button>
                    ) : (
                        <div className="site-guest-actions">
                            <button type="button" className="paper-btn site-session-button is-register" onClick={() => navigate('/login?mode=register')}>
                                <UserPlus size={18} aria-hidden="true" />
                                <span>{t('nav.register')}</span>
                            </button>
                            {!isLoginRoute && (
                                <button type="button" className="paper-btn site-session-button" onClick={() => navigate('/login')}>
                                    <LogIn size={18} aria-hidden="true" />
                                    <span>{t('nav.login')}</span>
                                </button>
                            )}
                        </div>
                    )}
                    {user && (
                        <button
                            type="button"
                            className="site-menu-toggle"
                            onClick={() => setMenuOpen((open) => !open)}
                            aria-expanded={menuOpen}
                            aria-controls="mobile-navigation"
                            aria-label={menuOpen ? 'Fermer le menu Plus' : 'Ouvrir le menu Plus'}
                        >
                            {menuOpen ? <X size={22} /> : <MoreHorizontal size={22} />}
                        </button>
                    )}
                </div>
            </div>

            {user && (
                <nav id="mobile-navigation" className="site-mobile-nav" aria-label="Navigation mobile">
                    {MOBILE_PRIMARY_LINKS.map(({ to, labelKey, mobileLabelKey, icon }) => (
                        <NavLink
                            key={to}
                            to={to}
                            className={({ isActive }) => `site-mobile-nav-link${isActive ? ' is-active' : ''}`}
                        >
                            {createElement(icon, { size: 21, 'aria-hidden': true })}
                            <span>{t(mobileLabelKey || labelKey)}</span>
                        </NavLink>
                    ))}
                    <button
                        type="button"
                        className={`site-mobile-nav-link site-mobile-more${menuOpen || isMoreRoute ? ' is-active' : ''}`}
                        onClick={() => setMenuOpen((open) => !open)}
                        aria-expanded={menuOpen}
                    >
                        <MoreHorizontal size={21} aria-hidden="true" />
                        <span>{t('nav.more')}</span>
                    </button>
                </nav>
            )}

            {user && menuOpen && (
                <>
                    <button type="button" className="site-mobile-sheet-backdrop" onClick={() => setMenuOpen(false)} aria-label="Fermer le menu" />
                    <div className="site-mobile-sheet" role="dialog" aria-label="Plus d'options">
                        <div className="site-mobile-sheet-header">
                            <strong>{t('nav.more_options')}</strong>
                            <button type="button" onClick={() => setMenuOpen(false)} aria-label="Fermer">
                                <X size={20} aria-hidden="true" />
                            </button>
                        </div>
                        <NavLink to="/profile" onClick={() => setMenuOpen(false)} className="site-mobile-sheet-action">
                            <UserRound size={20} aria-hidden="true" />
                            <span>{t('nav.profile')}</span>
                        </NavLink>
                        {user.role === 'admin' && (
                            <NavLink to="/admin" onClick={() => setMenuOpen(false)} className="site-mobile-sheet-action">
                                <BookOpen size={20} aria-hidden="true" />
                                <span>{t('nav.admin')}</span>
                            </NavLink>
                        )}
                        <div className="site-mobile-sheet-language">
                            <Globe2 size={20} aria-hidden="true" />
                            <span>{t('nav.language')}</span>
                            <LanguageSelect className="site-mobile-language-select" />
                        </div>
                        <button type="button" className="site-mobile-sheet-action is-danger" onClick={handleLogout}>
                            <LogOut size={20} aria-hidden="true" />
                            <span>{t('nav.logout')}</span>
                        </button>
                    </div>
                </>
            )}
        </header>
    );
}
export default Header;