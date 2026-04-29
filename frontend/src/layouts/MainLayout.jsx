// layouts/MainLayout.jsx
import { Outlet } from 'react-router-dom';
import Header from '../components/layouts/Header.jsx';
import Footer from '../components/layouts/Footer.jsx';
import SideColumn from '../components/layouts/SideColumn.jsx';
function MainLayout() {
    return (
        <div className="flex min-h-screen flex-col">
            <Header />
            <div className="flex flex-1 items-stretch bg-linear-to-br from-blue-50 to-indigo-100">
                <SideColumn />
                <main className="flex-1 min-w-0">
                    <Outlet />
                </main>
                <SideColumn />
            </div>
            <Footer />
        </div>
    );
}

export default MainLayout;