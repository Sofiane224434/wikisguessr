import Game, { GameResult } from '../models/game.model.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSiteState } from '../services/site-state.service.js';
import {
    getKnowledgeQuizUsageSummary,
    KnowledgeQuizError,
    generateKnowledgeQuiz
} from '../services/knowledge-quiz.service.js';

const parseText = (value) => String(value || '').trim();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTICLES_FILE_PATH = path.resolve(__dirname, '../data/wiki-articles.json');
const DISAMBIGUATION_FILE_PATH = path.resolve(__dirname, '../data/wiki-disambiguation-pending.json');
const OFFLINE_DEMO_FILE_PATH = path.resolve(__dirname, '../data/wiki-offline-demo.json');

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

const isOfflineDemoModeEnabled = () => {
    const envOffline = String(process.env.OFFLINE_DEMO_MODE || '').trim().toLowerCase() === 'true';
    const stateOffline = Boolean(readSiteState()?.offline);
    return envOffline || stateOffline;
};

const loadOfflineDemoMatchups = (mode = 'normal') => {
    try {
        if (!fs.existsSync(OFFLINE_DEMO_FILE_PATH)) {
            return [];
        }

        const raw = fs.readFileSync(OFFLINE_DEMO_FILE_PATH, 'utf-8');
        const sanitized = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
        const parsed = JSON.parse(sanitized);
        const modeKey = String(mode || 'normal').trim().toLowerCase();
        const modeMatchups = parsed?.modeMatchups && typeof parsed.modeMatchups === 'object'
            ? parsed.modeMatchups
            : null;

        const scopedList = modeMatchups && Array.isArray(modeMatchups[modeKey])
            ? modeMatchups[modeKey]
            : [];
        const fallbackList = Array.isArray(parsed?.matchups) ? parsed.matchups : [];
        const list = scopedList.length > 0 ? scopedList : fallbackList;

        return list
            .map((item) => ({
                startArticle: String(item?.startArticle || '').trim(),
                targetArticle: String(item?.targetArticle || '').trim()
            }))
            .filter((item) => item.startArticle && item.targetArticle && normalizeArticle(item.startArticle) !== normalizeArticle(item.targetArticle));
    } catch {
        return [];
    }
};

const pickRandomMatchup = (mode = 'normal') => {
    if (isOfflineDemoModeEnabled()) {
        const offlineMatchups = loadOfflineDemoMatchups(mode);
        if (offlineMatchups.length > 0) {
            const picked = pickRandomItem(offlineMatchups);
            return {
                startArticle: picked.startArticle,
                targetArticle: picked.targetArticle,
                startTheme: 'offline_demo',
                targetTheme: 'offline_demo'
            };
        }
    }

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
        const requestedMode = parseText(_req?.query?.mode).toLowerCase() || 'normal';
        const roll = pickRandomMatchup(requestedMode);
        return res.json({ roll });
    } catch (error) {
        console.error('getRandomRoll error:', error);
        return res.status(500).json({ error: 'Impossible de generer un roll' });
    }
};

export const createGame = async (req, res) => {
    try {
        const mode = parseText(req.body.mode).toLowerCase() || 'normal';
        const fallbackMatchup = pickRandomMatchup(mode);
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

export const getKnowledgeQuizUsage = async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Acces admin requis' });
        }

        const usage = getKnowledgeQuizUsageSummary();
        return res.json({ usage });
    } catch {
        return res.status(500).json({ error: 'Impossible de recuperer la consommation IA' });
    }
};

export const generateKnowledgeQuizForGame = async (req, res) => {
    try {
        const code = parseText(req.params.code).toUpperCase();

        if (!code) {
            return res.status(400).json({ error: 'Code de partie requis' });
        }

        const game = await Game.findByCode(code);

        if (!game) {
            return res.status(404).json({ error: 'Partie introuvable' });
        }

        const gameMode = parseText(game.mode).toLowerCase();
        if (gameMode !== 'knowledge') {
            return res.status(400).json({ error: 'Quiz reserve au mode connaissance' });
        }

        const visitedArticles = Array.isArray(req.body?.visitedArticles) ? req.body.visitedArticles : [];

        const intermediateVisitedArticles = visitedArticles.filter((item) => {
            const title = parseText(item?.title);
            if (!title) {
                return false;
            }

            const normalized = normalizeArticle(title);
            return normalized !== normalizeArticle(game.start_article)
                && normalized !== normalizeArticle(game.target_article);
        });

        const quiz = await generateKnowledgeQuiz({
            startArticle: game.start_article,
            targetArticle: game.target_article,
            visitedArticles: intermediateVisitedArticles,
            questionCount: 5
        });

        return res.json({ quiz });
    } catch (error) {
        const message = String(error?.message || 'Impossible de generer le quiz');
        let status = 500;

        if (error instanceof KnowledgeQuizError && Number.isInteger(error.status)) {
            status = error.status;
        } else if (/quota|rate|429|resource_exhausted/i.test(message)) {
            status = 429;
        }

        return res.status(status).json({ error: message });
    }
};

export const submitGameResult = async (req, res) => {
    try {
        const code = parseText(req.params.code).toUpperCase();
        if (!code) {
            return res.status(400).json({ error: 'Code de partie requis' });
        }

        const game = await Game.findByCode(code);
        if (!game) {
            return res.status(404).json({ error: 'Partie introuvable' });
        }

        if (game.created_by !== req.user.id) {
            return res.status(403).json({ error: 'Acces interdit' });
        }

        const clicks = Math.max(0, Number(req.body.clicks) || 0);
        const timeSeconds = Math.max(0, Number(req.body.time_seconds) || 0);
        const score = Math.max(0, Number(req.body.score) || 0);
        const won = Boolean(req.body.won);

        await GameResult.submit({
            gameId: game.id,
            userId: req.user.id,
            mode: game.mode,
            clicks,
            timeSeconds,
            score,
            won
        });

        return res.json({ ok: true });
    } catch (error) {
        console.error('submitGameResult error:', error);
        return res.status(500).json({ error: 'Impossible de sauvegarder le resultat' });
    }
};

export const updateKnowledgeScore = async (req, res) => {
    try {
        const code = parseText(req.params.code).toUpperCase();
        if (!code) {
            return res.status(400).json({ error: 'Code de partie requis' });
        }

        const game = await Game.findByCode(code);
        if (!game) {
            return res.status(404).json({ error: 'Partie introuvable' });
        }

        if (game.created_by !== req.user.id) {
            return res.status(403).json({ error: 'Acces interdit' });
        }

        const knowledgeScore = Math.max(0, Number(req.body.knowledge_score) || 0);

        await GameResult.updateKnowledgeScore({
            gameId: game.id,
            userId: req.user.id,
            knowledgeScore
        });

        return res.json({ ok: true });
    } catch (error) {
        console.error('updateKnowledgeScore error:', error);
        return res.status(500).json({ error: 'Impossible de mettre a jour le score' });
    }
};

export const getMyHistory = async (req, res) => {
    try {
        console.log('[getMyHistory] Called for user:', req.user?.id);
        console.log('[getMyHistory] req.user exists?', !!req.user);
        const results = await GameResult.getByUser(req.user.id, 30);
        console.log('[getMyHistory] Success, got', results.length, 'results');
        return res.json({ results });
    } catch (error) {
        console.error('[getMyHistory] ERROR:', error.message);
        console.error('[getMyHistory] Stack:', error.stack);
        return res.status(500).json({ error: 'Impossible de recuperer l\'historique', details: error.message });
    }
};

export const getLeaderboard = async (req, res) => {
    try {
        const allowedModes = ['all', 'normal', 'knowledge', 'chrono'];
        const mode = allowedModes.includes(String(req.query.mode || 'all').trim().toLowerCase())
            ? String(req.query.mode || 'all').trim().toLowerCase()
            : 'all';
        const rows = await GameResult.getLeaderboard(mode, 20);
        return res.json({ leaderboard: rows, mode });
    } catch (error) {
        console.error('getLeaderboard error:', error);
        return res.status(500).json({ error: 'Impossible de recuperer le classement' });
    }
};
