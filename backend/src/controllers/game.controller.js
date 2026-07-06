import Game from '../models/game.model.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const parseText = (value) => String(value || '').trim();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTICLES_FILE_PATH = path.resolve(__dirname, '../data/wiki-articles.json');
const DISAMBIGUATION_FILE_PATH = path.resolve(__dirname, '../data/wiki-disambiguation-pending.json');

const toDatasetKey = (theme, name) => `${String(theme || '').trim().toLowerCase()}::${String(name || '').trim().toLowerCase()}`;

const normalizeArticle = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

const isLikelyPlayableWikiTitle = (value) => {
    const title = String(value || '').trim();
    if (!title) {
        return false;
    }

    if (/^Q\d+$/i.test(title)) {
        return false;
    }

    if (/\.php($|\?)/i.test(title) || /\//.test(title)) {
        return false;
    }

    return true;
};

const loadPendingDisambiguationKeys = () => {
    try {
        if (!fs.existsSync(DISAMBIGUATION_FILE_PATH)) {
            return new Set();
        }

        const raw = fs.readFileSync(DISAMBIGUATION_FILE_PATH, 'utf-8');
        const sanitized = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
        const parsed = JSON.parse(sanitized);
        const pending = parsed?.pending && typeof parsed.pending === 'object' ? parsed.pending : {};

        const keys = Object.values(pending)
            .map((entry) => toDatasetKey(entry?.theme, entry?.name))
            .filter(Boolean);

        return new Set(keys);
    } catch {
        return new Set();
    }
};

const loadThemePools = () => {
    try {
        const pendingKeys = loadPendingDisambiguationKeys();
        const raw = fs.readFileSync(ARTICLES_FILE_PATH, 'utf-8');
        const sanitized = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
        const parsed = JSON.parse(sanitized);

        if (Array.isArray(parsed)) {
            const articles = parsed
                .map((item) => String(item || '').trim())
                .filter((item) => isLikelyPlayableWikiTitle(item));
            return articles.length ? [{ theme: 'default', articles }] : [];
        }

        if (!parsed || typeof parsed !== 'object') {
            return [];
        }

        return Object.entries(parsed)
            .map(([theme, articles]) => ({
                theme: String(theme || '').trim(),
                articles: Array.isArray(articles)
                    ? articles
                        .map((item) => String(item || '').trim())
                        .filter((item) => isLikelyPlayableWikiTitle(item))
                        .filter((item) => !pendingKeys.has(toDatasetKey(theme, item)))
                    : []
            }))
            .filter((item) => item.theme && item.articles.length > 0);
    } catch (error) {
        console.error('loadThemePools error:', error);
        return [];
    }
};

const pickRandomItem = (items) => items[Math.floor(Math.random() * items.length)];

const pickRandomMatchup = () => {
    const themePools = loadThemePools();
    const validThemes = themePools.filter((item) => item.articles.length > 0);

    if (validThemes.length < 2) {
        const fallback = ['Couleur', 'France'];
        return {
            startArticle: fallback[0],
            targetArticle: fallback[1],
            startTheme: 'fallback',
            targetTheme: 'fallback'
        };
    }

    for (let attempt = 0; attempt < 30; attempt += 1) {
        const startTheme = pickRandomItem(validThemes);
        let targetTheme = pickRandomItem(validThemes);

        while (targetTheme.theme === startTheme.theme && validThemes.length > 1) {
            targetTheme = pickRandomItem(validThemes);
        }

        const startArticle = pickRandomItem(startTheme.articles);
        const targetArticle = pickRandomItem(targetTheme.articles);

        if (normalizeArticle(startArticle) && normalizeArticle(targetArticle) && normalizeArticle(startArticle) !== normalizeArticle(targetArticle)) {
            return {
                startArticle,
                targetArticle,
                startTheme: startTheme.theme,
                targetTheme: targetTheme.theme
            };
        }
    }

    return {
        startArticle: 'Couleur',
        targetArticle: 'France',
        startTheme: 'fallback',
        targetTheme: 'fallback'
    };
};

export const getRandomRoll = async (_req, res) => {
    try {
        const roll = pickRandomMatchup();
        return res.json({ roll });
    } catch (error) {
        console.error('getRandomRoll error:', error);
        return res.status(500).json({ error: 'Impossible de generer un roll' });
    }
};

export const createGame = async (req, res) => {
    try {
        const mode = parseText(req.body.mode).toLowerCase() || 'normal';
        const fallbackMatchup = pickRandomMatchup();
        const startArticle = parseText(req.body.startArticle) || fallbackMatchup.startArticle;
        const targetArticle = parseText(req.body.targetArticle) || fallbackMatchup.targetArticle;
        const title = parseText(req.body.title) || `Partie ${mode} de ${req.user.username}`;

        if (startArticle.toLowerCase() === targetArticle.toLowerCase()) {
            return res.status(400).json({ error: 'Les articles de depart et cible doivent etre differents' });
        }

        const game = await Game.create({
            title,
            startArticle,
            targetArticle,
            mode,
            createdBy: req.user.id
        });

        return res.status(201).json({ game });
    } catch (error) {
        console.error('createGame error:', error);
        return res.status(500).json({ error: 'Impossible de creer la partie' });
    }
};

export const getMyGames = async (req, res) => {
    try {
        const games = await Game.listByCreator(req.user.id);
        return res.json({ games });
    } catch (error) {
        console.error('getMyGames error:', error);
        return res.status(500).json({ error: 'Impossible de recuperer les parties' });
    }
};

export const getGameByCode = async (req, res) => {
    try {
        const code = parseText(req.params.code).toUpperCase();

        if (!code) {
            return res.status(400).json({ error: 'Code de partie requis' });
        }

        const game = await Game.findByCode(code);

        if (!game) {
            return res.status(404).json({ error: 'Partie introuvable' });
        }

        return res.json({ game });
    } catch (error) {
        console.error('getGameByCode error:', error);
        return res.status(500).json({ error: 'Impossible de recuperer la partie' });
    }
};
