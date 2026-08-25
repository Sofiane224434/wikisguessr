// controllers/auth.controller.js
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import User from '../models/user.model.js';
import { query } from '../config/db.js';
import { sendCustomEmail } from '../services/email.service.js';
// Génère un token JWT
const generateToken = (user) => {
    return jwt.sign(
        { id: user.id, email: user.email, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24;
const RESET_PASSWORD_TOKEN_TTL_MS = 1000 * 60 * 30;
const USERNAME_CHANGE_COOLDOWN_DAYS = 30;
const USERNAME_CHANGE_COOLDOWN_MS = USERNAME_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
const USERNAME_PATTERN = /^[\p{L}\p{N}_.-]{3,30}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isUserSuperAdmin = (user) => {
    if (!user) return false;
    return Boolean(
        user.id === 1
        || String(user.username || '').toLowerCase() === 'azim'
        || (process.env.BREVO_SENDER_EMAIL && user.email === process.env.BREVO_SENDER_EMAIL)
    );
};

const addUsernameCooldown = (user) => {
    if (!user) {
        return user;
    }

    const availableAt = user.username_changed_at
        ? new Date(new Date(user.username_changed_at).getTime() + USERNAME_CHANGE_COOLDOWN_MS).toISOString()
        : null;

    return {
        ...user,
        isSuperAdmin: isUserSuperAdmin(user),
        canChangeUsername: !availableAt || new Date(availableAt).getTime() <= Date.now(),
        usernameAvailableAt: availableAt
    };
};

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
        const { username, email, password, confirmPassword, redirectPath } = req.body;
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
            role: 'user',
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

        if (user.banned_at) {
            return res.status(403).json({ error: 'Votre compte a été banni' });
        }

        const token = generateToken(user);
        res.json({
            user: addUsernameCooldown({
                id: user.id,
                username: user.username,
                username_changed_at: user.username_changed_at,
                email: user.email,
                role: user.role,
                avatar_url: user.avatar_url,
                email_verified: user.email_verified
            }),
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
    res.json({ user: addUsernameCooldown(req.user) });
};

// PATCH /api/auth/profile
export const updateProfile = async (req, res) => {
    try {
        const { username, email, currentPassword, newPassword } = req.body;
        const currentUser = await User.findPrivateById(req.user.id);

        if (!currentUser) {
            return res.status(404).json({ error: 'Utilisateur non trouve' });
        }
        if (!currentPassword || !(await User.verifyPassword(currentPassword, currentUser.password))) {
            return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
        }

        const nextUsername = username === undefined ? undefined : String(username).trim();
        const nextEmail = email === undefined ? undefined : String(email).trim().toLowerCase();
        const usernameChanged = nextUsername !== undefined && nextUsername !== currentUser.username;
        const emailChanged = nextEmail !== undefined && nextEmail !== currentUser.email;
        const passwordChanged = newPassword !== undefined && String(newPassword).length > 0;

        if (!usernameChanged && !emailChanged && !passwordChanged) {
            return res.status(400).json({ error: 'Aucune modification a enregistrer' });
        }

        if (usernameChanged) {
            if (!USERNAME_PATTERN.test(nextUsername)) {
                return res.status(400).json({
                    error: 'Le username doit contenir entre 3 et 30 caracteres (lettres, chiffres, point, tiret ou underscore)'
                });
            }

            if (currentUser.username_changed_at) {
                const availableAt = new Date(currentUser.username_changed_at).getTime() + USERNAME_CHANGE_COOLDOWN_MS;
                if (availableAt > Date.now()) {
                    return res.status(429).json({
                        error: `Le username ne peut etre change qu'une fois tous les ${USERNAME_CHANGE_COOLDOWN_DAYS} jours`,
                        usernameChangeAvailableAt: new Date(availableAt).toISOString()
                    });
                }
            }

            const existingUsername = await User.findByUsername(nextUsername);
            if (existingUsername && existingUsername.id !== currentUser.id) {
                return res.status(409).json({ error: 'Username deja utilise' });
            }
        }

        if (emailChanged) {
            if (nextEmail.length > 255 || !EMAIL_PATTERN.test(nextEmail)) {
                return res.status(400).json({ error: 'Adresse email invalide' });
            }
            const existingEmail = await User.findByEmail(nextEmail);
            if (existingEmail && existingEmail.id !== currentUser.id) {
                return res.status(409).json({ error: 'Email deja utilise' });
            }
        }

        if (passwordChanged && String(newPassword).length < 8) {
            return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 8 caracteres' });
        }

        const updatedUser = await User.updateProfile(currentUser.id, {
            username: usernameChanged ? nextUsername : undefined,
            email: emailChanged ? nextEmail : undefined,
            plainPassword: passwordChanged ? String(newPassword) : undefined
        });

        return res.json({
            message: 'Profil mis a jour',
            user: addUsernameCooldown(updatedUser)
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Username ou email deja utilise' });
        }
        console.error('updateProfile error:', error);
        return res.status(500).json({ error: 'Impossible de mettre a jour le profil' });
    }
};

const avatarsDirectory = path.resolve('uploads', 'avatars');

const removeStoredAvatar = async (avatarUrl) => {
    if (!String(avatarUrl || '').startsWith('/uploads/avatars/')) {
        return;
    }
    await fs.unlink(path.join(avatarsDirectory, path.basename(avatarUrl))).catch(() => {});
};

export const updateAvatar = async (req, res) => {
    let outputPath = null;
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Sélectionnez une photo de profil' });
        }

        const currentUser = await User.findPrivateById(req.user.id);
        if (!currentUser) {
            return res.status(404).json({ error: 'Utilisateur non trouve' });
        }

        await fs.mkdir(avatarsDirectory, { recursive: true });
        const filename = `user-${currentUser.id}-${crypto.randomUUID()}.webp`;
        outputPath = path.join(avatarsDirectory, filename);
        await sharp(req.file.buffer)
            .rotate()
            .resize(512, 512, { fit: 'cover', position: 'attention' })
            .webp({ quality: 86 })
            .toFile(outputPath);

        const avatarUrl = `/uploads/avatars/${filename}`;
        const updatedUser = await User.updateAvatar(currentUser.id, avatarUrl);
        await removeStoredAvatar(currentUser.avatar_url);
        return res.json({
            message: 'Photo de profil mise a jour',
            user: addUsernameCooldown(updatedUser)
        });
    } catch (error) {
        if (outputPath) {
            await fs.unlink(outputPath).catch(() => {});
        }
        console.error('updateAvatar error:', error);
        return res.status(400).json({ error: 'Cette image ne peut pas être utilisée' });
    }
};

export const deleteAvatar = async (req, res) => {
    try {
        const currentUser = await User.findPrivateById(req.user.id);
        if (!currentUser) {
            return res.status(404).json({ error: 'Utilisateur non trouve' });
        }

        const updatedUser = await User.updateAvatar(currentUser.id, null);
        await removeStoredAvatar(currentUser.avatar_url);
        return res.json({
            message: 'Photo de profil supprimée',
            user: addUsernameCooldown(updatedUser)
        });
    } catch (error) {
        console.error('deleteAvatar error:', error);
        return res.status(500).json({ error: 'Impossible de supprimer la photo de profil' });
    }
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

export const setUserSubscription = async (req, res) => {
    try {
        const userId = Number(req.params.userId);
        const tier = String(req.body?.tier || '').trim().toLowerCase();
        if (!Number.isInteger(userId) || !['free', 'silver', 'gold'].includes(tier)) {
            return res.status(400).json({ error: 'Utilisateur ou offre invalide' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'Utilisateur introuvable' });
        }
        if (user.role === 'admin') {
            return res.status(400).json({ error: 'Gold est déjà inclus pour les administrateurs' });
        }

        const updatedUser = await User.setSubscriptionByAdmin(userId, tier);
        return res.json({
            message: tier === 'free' ? 'Offre révoquée' : `Offre ${tier} attribuée pour un mois`,
            user: updatedUser
        });
    } catch (error) {
        console.error('setUserSubscription error:', error);
        return res.status(500).json({ error: 'Impossible de modifier l’offre' });
    }
};

// POST /api/auth/ban (admin)
export const banUser = async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'ID utilisateur requis' });
        }
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }
        const sql = 'UPDATE users SET banned_at = NOW() WHERE id = ?';
        await query(sql, [userId]);
        return res.json({ ok: true, message: `${user.username} a été banni` });
    } catch (error) {
        console.error('banUser error:', error);
        return res.status(500).json({ error: 'Impossible de bannir l\'utilisateur' });
    }
};

// POST /api/auth/unban (admin)
export const unbanUser = async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'ID utilisateur requis' });
        }
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }
        const sql = 'UPDATE users SET banned_at = NULL WHERE id = ?';
        await query(sql, [userId]);
        return res.json({ ok: true, message: `${user.username} a été débanni` });
    } catch (error) {
        console.error('unbanUser error:', error);
        return res.status(500).json({ error: 'Impossible de débannir l\'utilisateur' });
    }
};

// PATCH /api/auth/users/:userId/role (Super-Admin uniquement)
export const setUserRole = async (req, res) => {
    try {
        if (!isUserSuperAdmin(req.user)) {
            return res.status(403).json({ error: 'Seul le Super-Admin principal peut nommer ou rétrograder des administrateurs' });
        }

        const targetUserId = Number(req.params.userId);
        const newRole = String(req.body?.role || '').trim().toLowerCase();
        if (!Number.isInteger(targetUserId) || !['user', 'moderator', 'admin'].includes(newRole)) {
            return res.status(400).json({ error: 'Rôle invalide (user, moderator, admin)' });
        }

        if (targetUserId === req.user.id && newRole !== 'admin') {
            return res.status(400).json({ error: 'Vous ne pouvez pas retirer votre propre statut Super-Admin' });
        }

        const targetUser = await User.findById(targetUserId);
        if (!targetUser) {
            return res.status(404).json({ error: 'Utilisateur introuvable' });
        }

        const updatedUser = await User.setUserRole(targetUserId, newRole);
        return res.json({
            message: `Rôle de ${updatedUser.username} mis à jour : ${newRole}`,
            user: updatedUser
        });
    } catch (error) {
        console.error('setUserRole error:', error);
        return res.status(500).json({ error: 'Impossible de modifier le rôle' });
    }
};