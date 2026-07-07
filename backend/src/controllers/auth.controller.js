// controllers/auth.controller.js
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/user.model.js';
import { sendCustomEmail } from '../services/email.service.js';
// Génère un token JWT
const generateToken = (user) => {
    return jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24;
const RESET_PASSWORD_TOKEN_TTL_MS = 1000 * 60 * 30;

const getFirstForwardedValue = (value) => {
    if (!value) {
        return null;
    }

    return String(value).split(',')[0].trim();
};

const resolveAppUrl = (req) => {
    const origin = req.headers.origin;
    if (origin) {
        return origin;
    }

    const forwardedProto = getFirstForwardedValue(req.headers['x-forwarded-proto']);
    const forwardedHost = getFirstForwardedValue(req.headers['x-forwarded-host']);
    if (forwardedProto && forwardedHost) {
        return `${forwardedProto}://${forwardedHost}`;
    }

    return APP_URL;
};

const buildVerificationUrl = (token, redirectPath, appUrl) => {
    const url = new URL('/login', appUrl || APP_URL);
    url.searchParams.set('token', token);

    if (redirectPath) {
        url.searchParams.set('next', redirectPath);
    }

    return url.toString();
};

const buildResetPasswordUrl = (token, appUrl) => {
    const url = new URL('/login', appUrl || APP_URL);
    url.searchParams.set('resetToken', token);
    return url.toString();
};

const sendVerificationEmail = async ({ email, username, verificationUrl }) => {
    const message = [
        `Salut ${username},`,
        '',
        'Bienvenue sur WikisGuessr. Clique sur ce lien pour verifier ton adresse mail :',
        verificationUrl,
        '',
        'Si tu n\'es pas a l\'origine de cette inscription, tu peux ignorer ce message.'
    ].join('\n');

    await sendCustomEmail({
        to: email,
        name: username,
        subject: 'Verifie ton adresse mail WikisGuessr',
        message
    });
};

const sendResetPasswordEmail = async ({ email, username, resetUrl }) => {
    const message = [
        `Salut ${username},`,
        '',
        'Tu as demande la reinitialisation de ton mot de passe.',
        'Clique sur ce lien pour choisir un nouveau mot de passe :',
        resetUrl,
        '',
        'Ce lien expire dans 30 minutes.',
        'Si tu n\'es pas a l\'origine de cette demande, ignore ce message.'
    ].join('\n');

    await sendCustomEmail({
        to: email,
        name: username,
        subject: 'Reinitialisation de mot de passe WikisGuessr',
        message
    });
};
// POST /api/auth/register
export const register = async (req, res) => {
    try {
        const { username, email, password, confirmPassword, role, redirectPath } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email et mot de passe requis' });
        }

        if (confirmPassword !== undefined && password !== confirmPassword) {
            return res.status(400).json({ error: 'La confirmation du mot de passe ne correspond pas' });
        }
        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            return res.status(409).json({ error: 'Email déjà utilisé' });
        }
        const existingUsername = await User.findByUsername(username);
        if (existingUsername) {
            return res.status(409).json({ error: 'Username déjà utilisé' });
        }

        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

        const user = await User.create({
            username,
            email,
            password,
            role: role === 'admin' ? 'admin' : 'user',
            emailVerified: 0,
            verificationToken,
            verificationExpiresAt
        });

        const appUrl = resolveAppUrl(req);
        const verificationUrl = buildVerificationUrl(
            verificationToken,
            redirectPath && redirectPath !== '/login' ? redirectPath : '/lobby',
            appUrl
        );

        try {
            await sendVerificationEmail({ email, username, verificationUrl });
        } catch (mailError) {
            await User.deleteById(user.id);
            return res.status(502).json({
                error: mailError.message || 'Impossible d\'envoyer l\'email de vérification'
            });
        }

        res.status(201).json({ message: 'Compte créé. Un email de vérification a été envoyé.' });
    } catch (error) {
        console.error('register error:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};
// POST /api/auth/login
export const login = async (req, res) => {
    try {
        const { identifier, email, password } = req.body;
        const loginIdentifier = String(identifier || email || '').trim();

        if (!loginIdentifier || !password) {
            return res.status(400).json({ error: 'Email/username et mot de passe requis' });
        }

        const user = await User.findByEmailOrUsername(loginIdentifier);
        if (!user || !(await User.verifyPassword(password, user.password))) {
            return res.status(401).json({ error: 'Identifiants incorrects' });
        }

        if (!user.email_verified) {
            return res.status(403).json({ error: 'Adresse mail non vérifiée. Vérifie ton email pour continuer.' });
        }

        const token = generateToken(user);
        res.json({
            user: { id: user.id, username: user.username, email: user.email, role: user.role, email_verified: user.email_verified },
            token
        });
    } catch (error) {
        console.error('login error:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// GET /api/auth/verify-email?token=...
export const verifyEmail = async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({ error: 'Token de vérification manquant' });
        }

        const user = await User.findByVerificationToken(token);

        if (!user) {
            return res.status(404).json({ error: 'Lien de vérification invalide' });
        }

        if (user.email_verified) {
            const verifiedUser = await User.findById(user.id);
            const authToken = generateToken(verifiedUser);
            return res.json({
                message: 'Adresse mail déjà vérifiée',
                user: verifiedUser,
                token: authToken
            });
        }

        if (user.email_verification_expires_at && new Date(user.email_verification_expires_at) < new Date()) {
            return res.status(410).json({ error: 'Lien de vérification expiré' });
        }

        await User.markEmailVerified(user.id);
        const verifiedUser = await User.findById(user.id);
        const authToken = generateToken(verifiedUser);

        res.json({
            message: 'Adresse mail vérifiée avec succès',
            user: verifiedUser,
            token: authToken
        });
    } catch (error) {
        console.error('verifyEmail error:', error);
        res.status(500).json({ error: 'Impossible de vérifier l\'adresse mail' });
    }
};

// POST /api/auth/forgot-password
export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email requis' });
        }

        const user = await User.findByEmail(email);
        if (!user) {
            return res.json({ message: 'Si cet email existe, un lien de reinitialisation a ete envoye.' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpiresAt = new Date(Date.now() + RESET_PASSWORD_TOKEN_TTL_MS);
        await User.setPasswordResetToken(user.id, resetToken, resetExpiresAt);

        const appUrl = resolveAppUrl(req);
        const resetUrl = buildResetPasswordUrl(resetToken, appUrl);

        try {
            await sendResetPasswordEmail({
                email: user.email,
                username: user.username,
                resetUrl
            });
        } catch (mailError) {
            return res.status(502).json({
                error: mailError.message || 'Impossible d\'envoyer l\'email de reinitialisation'
            });
        }

        res.json({ message: 'Si cet email existe, un lien de reinitialisation a ete envoye.' });
    } catch (error) {
        console.error('forgotPassword error:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// POST /api/auth/reset-password
export const resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({ error: 'Token et mot de passe requis' });
        }

        if (String(password).length < 8) {
            return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caracteres' });
        }

        const user = await User.findByPasswordResetToken(token);

        if (!user) {
            return res.status(404).json({ error: 'Lien de reinitialisation invalide' });
        }

        if (user.password_reset_expires_at && new Date(user.password_reset_expires_at) < new Date()) {
            return res.status(410).json({ error: 'Lien de reinitialisation expire' });
        }

        await User.updatePassword(user.id, password);
        res.json({ message: 'Mot de passe reinitialise avec succes. Tu peux maintenant te connecter.' });
    } catch (error) {
        console.error('resetPassword error:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// GET /api/auth/me
export const getProfile = async (req, res) => {
    res.json({ user: req.user });
};

// GET /api/auth/users (admin)
export const getUsers = async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Acces admin requis' });
        }

        const users = await User.listForAdmin();
        return res.json({
            total: users.length,
            users
        });
    } catch (error) {
        console.error('getUsers error:', error);
        return res.status(500).json({ error: 'Impossible de recuperer les joueurs' });
    }
};