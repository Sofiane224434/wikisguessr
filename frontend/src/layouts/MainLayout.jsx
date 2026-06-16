// layouts/MainLayout.jsx
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Header from '../components/layouts/Header.jsx';
import Footer from '../components/layouts/Footer.jsx';
import SideColumn from '../components/layouts/SideColumn.jsx';
function MainLayout() {
    const [leftColumnSigns, setLeftColumnSigns] = useState([]);
    const [rightColumnSigns, setRightColumnSigns] = useState([]);

    return (
        <div className="flex min-h-screen flex-col">
            <Header />
            <div className="flex flex-1 items-stretch bg-linear-to-br from-blue-50 to-indigo-100">
                <SideColumn signs={leftColumnSigns} />
                <main className="flex-1 min-w-0">
                    <Outlet context={{ setLeftColumnSigns, setRightColumnSigns }} />
                </main>
                <SideColumn signs={rightColumnSigns} />
            </div>
            <Footer />
        </div>
    );
}

export default MainLayout;