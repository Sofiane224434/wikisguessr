// components/Header.jsx
import LanguageSelect from "../ui/LanguageSelect";
import WikisGuessrLogo from "../ui/WikisGuessrLogo";

function Header() {
    return (
        <header className="shadow-lg">
            <div className="container mx-auto flex items-center justify-center py-2 relative">
                <WikisGuessrLogo size="sm" />
                <div className="absolute right-4 flex gap-4 items-center">
                    <LanguageSelect />
                </div>
            </div>
        </header>
    );
}
export default Header;