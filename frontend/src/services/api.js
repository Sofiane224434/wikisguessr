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
    getUsers: () => fetchAPI('/auth/users'),
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
    getRandomRoll: () => fetchAPI('/games/random-roll'),
    getMine: () => fetchAPI('/games/my'),
    getKnowledgeQuizUsage: () => fetchAPI('/games/knowledge-quiz/usage'),
    getByCode: (code) => fetchAPI(`/games/by-code/${encodeURIComponent(code)}`),
    generateKnowledgeQuiz: (code, payload) => fetchAPI(`/games/${encodeURIComponent(code)}/knowledge-quiz`, {
        method: 'POST',
        body: JSON.stringify(payload)
    })
}

export const wikiService = {
    getArticles: () => fetchAPI('/wiki/articles'),
    addArticle: (payload) => fetchAPI('/wiki/articles', {
        method: 'POST',
        body: JSON.stringify(payload)
    }),
    validateArticles: (payload) => fetchAPI('/wiki/articles/validate', {
        method: 'POST',
        body: JSON.stringify(payload)
    }),
    validateArticlesStream: (payload) => {
        const token = localStorage.getItem('token');
        const headers = {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` })
        };

        return fetch(`${API_URL}/wiki/articles/validate-stream`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });
    },
    updateArticle: (articleId, payload) => fetchAPI(`/wiki/articles/${encodeURIComponent(articleId)}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
    }),
    getDisambiguationPending: () => fetchAPI('/wiki/articles/disambiguation-pending'),
    resolveDisambiguation: (articleId, payload) => fetchAPI(`/wiki/articles/${encodeURIComponent(articleId)}/resolve-disambiguation`, {
        method: 'POST',
        body: JSON.stringify(payload)
    }),
    rejectDisambiguation: (articleId) => fetchAPI(`/wiki/articles/${encodeURIComponent(articleId)}/reject-disambiguation`, {
        method: 'POST'
    }),
    unrejectDisambiguation: (articleId) => fetchAPI(`/wiki/articles/${encodeURIComponent(articleId)}/unreject-disambiguation`, {
        method: 'POST'
    }),
    deleteArticle: (articleId) => fetchAPI(`/wiki/articles/${encodeURIComponent(articleId)}`, {
        method: 'DELETE'
    })
}

export const siteService = {
    getState: () => fetchAPI('/site-state'),
    setOfflineMode: (offline) => fetchAPI('/site-state/offline', {
        method: 'PUT',
        body: JSON.stringify({ offline: Boolean(offline) })
    })
}