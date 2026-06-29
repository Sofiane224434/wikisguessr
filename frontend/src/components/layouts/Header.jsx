// components/Header.jsx
import LanguageSelect from "../ui/LanguageSelect";
import WikisGuessrLogo from "../ui/WikisGuessrLogo";
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/Authcontext.jsx';

function Header() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout } = useAuth();
    const isLoginRoute = location.pathname === '/login';

    return (
        <header className="shadow-lg">
            <div className="container mx-auto flex items-center justify-center py-2 relative">
                <WikisGuessrLogo size="sm" />
                <div className="absolute right-4 flex gap-4 items-center">
                    {user ? (
                        <button
                            type="button"
                            onClick={() => {
                                logout();
                                navigate('/login');
                            }}
                        >
                            Déconnexion
                        </button>
                    ) : !isLoginRoute ? (
                        <button type="button" onClick={() => navigate('/login')}>
                            Connexion
                        </button>
                    ) : null}
                    <LanguageSelect />
                </div>
            </div>
        </header>
    );
}
export default Header;