// layouts/MainLayout.jsx
import { Outlet } from 'react-router-dom';
import Header from '../components/layouts/Header.jsx';
import Footer from '../components/layouts/Footer.jsx';
function MainLayout() {
    return (
        <div>
            <Header />
            <main>
                <Outlet />
            </main>
            <Footer />
        </div>
    );
}
export default MainLayout;