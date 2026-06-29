/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(Boolean(localStorage.getItem('token')));

    useEffect(() => {
        if (!token) {
            return;
        }

        authService
            .getProfile()
            .then((data) => {
                setUser(data.user);
                setLoading(false);
            })
            .catch(() => {
                localStorage.removeItem('token');
                setToken(null);
                setLoading(false);
            });
    }, [token]);

    const login = (userOrToken, maybeToken) => {
        const newToken = maybeToken ?? userOrToken;
        const newUser = maybeToken ? userOrToken : null;

        localStorage.setItem('token', newToken);
        setToken(newToken);

        if (newUser) {
            setUser(newUser);
        }

        setLoading(false);
    };

    const logout = () => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, token, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}