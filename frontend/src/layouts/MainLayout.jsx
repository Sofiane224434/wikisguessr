// layouts/MainLayout.jsx
import { Outlet, useLocation } from 'react-router-dom';
import Header from '../components/layouts/Header.jsx';
import Footer from '../components/layouts/Footer.jsx';
import SideColumn from '../components/layouts/SideColumn.jsx';

function MainLayout() {
    const location = useLocation();
    const isGameRoute = location.pathname === '/game';
    const isLobbyRoute = location.pathname === '/lobby';
    const isHomeRoute = location.pathname === '/';

    if (isGameRoute) {
        return (
            <div className="min-h-screen bg-white">
                <Outlet />
            </div>
        );
    }

    if (isLobbyRoute) {
        return (
            <div className="site-shell min-h-screen bg-[#1c1713]">
                <Header />
                <main>
                    <Outlet />
                </main>
            </div>
        );
    }

    if (isHomeRoute) {
        return (
            <div className="site-shell home-shell min-h-screen">
                <Header />
                <main>
                    <Outlet />
                </main>
            </div>
        );
    }

    return (
        <div className="site-shell flex min-h-screen flex-col">
            <Header />
            <div className="site-stage flex flex-1 items-stretch">
                <SideColumn />
                <main className="site-main flex-1 min-w-0">
                    <Outlet />
                </main>
                <SideColumn />
            </div>
            <Footer />
        </div>
    );
}

export default MainLayout;