// layouts/AuthLayout.jsx
import { Link, Outlet } from 'react-router-dom';
function AuthLayout() {
    return (
        <div>
            <div className="p-4">
                <Link to="/" className="text-blue-600 hover:underline text-sm">
                    ← Accueil
                </Link>
            </div>
            <Outlet />
        </div>
    );
}
export default AuthLayout;