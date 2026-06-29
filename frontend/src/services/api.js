// services/api.js
const API_URL = 'http://localhost:5000/api';
async function fetchAPI(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` })
    };
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers
        });
        const data = await response.json();
        if (!response.ok) {
            throw { status: response.status, message: data.error || 'Erreur' };
        }
        return data;
    } catch (error) {
        if (!error.status) {
            throw { status: 0, message: 'Serveur inaccessible' };
        }
        throw error;
    }
}
export const authService = {
    register: (userData) => fetchAPI('/auth/register', {
        method: 'POST',
        body: JSON.stringify(userData)
    }),
    login: (identifier, password) => fetchAPI('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password })
    }),
    getProfile: () => fetchAPI('/auth/me'),
    verifyEmail: (token) => fetchAPI(`/auth/verify-email?token=${encodeURIComponent(token)}`),
    forgotPassword: (email) => fetchAPI('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
    }),
    resetPassword: (token, password) => fetchAPI('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password })
    })
}

export const emailService = {
    send: (payload) => fetchAPI('/email/send', {
        method: 'POST',
        body: JSON.stringify(payload)
    })
}

export const gameService = {
    create: (payload) => fetchAPI('/games', {
        method: 'POST',
        body: JSON.stringify(payload)
    }),
    getMine: () => fetchAPI('/games/my')
}