// components/Header.jsx
import LanguageSelect from "../ui/LanguageSelect";

function Header() {
    return (
        <header className="bg-blue-600 text-white shadow-lg">
            <div className="container mx-auto px-4 py-4 flex justify-between items-center">
                <span className="text-2xl font-bold">
                    WikisGuessr
                </span>
                <div className="flex gap-4 items-center">
                    <LanguageSelect />
                </div>
            </div>
        </header>
    );
}
export default Header;