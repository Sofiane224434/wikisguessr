import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSiteState } from '../services/site-state.service.js';
import { normalizeWikiLanguage } from '../services/wiki-language.service.js';

const WIKI_ORIGIN = 'https://fr.wikipedia.org';
const WIKI_MOBILE_HTML_ORIGIN = 'https://fr.wikipedia.org/api/rest_v1/page/mobile-html';
const WIKI_API_ORIGIN = 'https://fr.wikipedia.org/w/api.php';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTICLES_FILE_PATH = path.resolve(__dirname, '../data/wiki-articles.json');
const DISAMBIGUATION_FILE_PATH = path.resolve(__dirname, '../data/wiki-disambiguation-pending.json');
const OFFLINE_DEMO_FILE_PATH = path.resolve(__dirname, '../data/wiki-offline-demo.json');
const DEFAULT_ADMIN_THEME = 'admin_custom';
const DEFAULT_VALIDATION_CONCURRENCY = 2;
const MOBILE_HTML_RETRY_ATTEMPTS = 4;
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});

const isOfflineDemoModeEnabled = () => {
    const envOffline = String(process.env.OFFLINE_DEMO_MODE || '').trim().toLowerCase() === 'true';
    const stateOffline = Boolean(readSiteState()?.offline);
    return envOffline || stateOffline;
};

const normalizeOfflineTitle = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

const readOfflineDemoDataset = () => {
    try {
        if (!fs.existsSync(OFFLINE_DEMO_FILE_PATH)) {
            return null;
        }

        const raw = fs.readFileSync(OFFLINE_DEMO_FILE_PATH, 'utf-8');
        const sanitized = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
        const parsed = JSON.parse(sanitized);
        const articles = Array.isArray(parsed?.articles) ? parsed.articles : [];

        const byTitle = new Map();
        articles.forEach((item) => {
            const title = String(item?.title || '').trim();
            const html = String(item?.html || '').trim();
            const key = normalizeOfflineTitle(title);
            if (!title || !html || !key) {
                return;
            }

            byTitle.set(key, { title, html });
        });

        const defaultStartArticle = String(parsed?.defaultStartArticle || '').trim();

        return {
            byTitle,
            defaultStartArticle
        };
    } catch {
        return null;
    }
};

const buildOfflineMobileHtmlPayload = (requestedTitle) => {
    const dataset = readOfflineDemoDataset();
    if (!dataset || !(dataset.byTitle instanceof Map) || dataset.byTitle.size === 0) {
        return null;
    }

    const requestedKey = normalizeOfflineTitle(requestedTitle);
    const requested = dataset.byTitle.get(requestedKey);
    if (requested) {
        return {
            title: requested.title,
            html: rewriteMobileHtmlLinks(requested.html),
            sourceUrl: `offline://demo/${encodeURIComponent(requested.title)}`,
            offline: true
        };
    }

    const fallbackKey = normalizeOfflineTitle(dataset.defaultStartArticle);
    const fallback = dataset.byTitle.get(fallbackKey) || Array.from(dataset.byTitle.values())[0];
    if (!fallback) {
        return null;
    }

    return {
        title: fallback.title,
        html: rewriteMobileHtmlLinks(fallback.html),
        sourceUrl: `offline://demo/${encodeURIComponent(fallback.title)}`,
        offline: true,
        requestedTitle: String(requestedTitle || '').trim()
    };
};

const fetchMobileHtmlByTitle = async (title, language = 'fr') => {
    const wikiLanguage = normalizeWikiLanguage(language);
    const targetUrl = `https://${wikiLanguage}.wikipedia.org/api/rest_v1/page/mobile-html/${encodeURIComponent(String(title || '').trim().replace(/\s+/g, '_'))}`;
    return fetch(targetUrl, {
        redirect: 'follow',
        headers: {
            'User-Agent': 'WikisGuessrBot/1.0 (+https://wikisguessr.azim404.com)'
        }
    });
};

const resolveFallbackTitle = async (title, language = 'fr') => {
    const rawTitle = String(title || '').trim();
    if (!rawTitle) {
        return '';
    }

    try {
        const wikiApiOrigin = `https://${normalizeWikiLanguage(language)}.wikipedia.org/w/api.php`;
        const queryUrl = `${wikiApiOrigin}?action=query&format=json&formatversion=2&redirects=1&prop=pageprops|categories&cllimit=max&titles=${encodeURIComponent(rawTitle)}`;
        const queryResponse = await fetch(queryUrl, {
            headers: {
                'User-Agent': 'WikisGuessrBot/1.0 (+https://wikisguessr.azim404.com)'
            }
        });

        if (queryResponse.ok) {
            const payload = await queryResponse.json();
            const page = payload?.query?.pages?.[0];
            if (page && !page.missing && page.title) {
                return String(page.title).trim();
            }
        }
    } catch {
        // Ignore and continue with search fallback.
    }

    try {
        const wikiApiOrigin = `https://${normalizeWikiLanguage(language)}.wikipedia.org/w/api.php`;
        const searchUrl = `${wikiApiOrigin}?action=query&format=json&formatversion=2&list=search&srnamespace=0&srlimit=1&srsearch=${encodeURIComponent(rawTitle)}`;
        const searchResponse = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'WikisGuessrBot/1.0 (+https://wikisguessr.azim404.com)'
            }
        });

        if (!searchResponse.ok) {
            return '';
        }

        const payload = await searchResponse.json();
        return String(payload?.query?.search?.[0]?.title || '').trim();
    } catch {
        return '';
    }
};

const resolveCanonicalTitle = async (title) => {
    const rawTitle = String(title || '').trim();
    if (!rawTitle) {
        return { status: 'missing', title: '' };
    }

    try {
        const queryUrl = `${WIKI_API_ORIGIN}?action=query&format=json&formatversion=2&redirects=1&prop=pageprops|categories&cllimit=max&titles=${encodeURIComponent(rawTitle)}`;
        const queryResponse = await fetch(queryUrl, {
            headers: {
                'User-Agent': 'WikisGuessrBot/1.0 (+https://wikisguessr.azim404.com)'
            }
        });

        if (!queryResponse.ok) {
            return { status: 'error', title: '' };
        }

        const payload = await queryResponse.json();
        const page = payload?.query?.pages?.[0];

        if (!page) {
            return { status: 'error', title: '' };
        }

        if (page.missing) {
            return { status: 'missing', title: '' };
        }

        const resolved = String(page.title || '').trim();
        if (!resolved) {
            return { status: 'error', title: '' };
        }

        const categories = Array.isArray(page?.categories)
            ? page.categories.map((item) => String(item?.title || '').toLowerCase())
            : [];
        const hasHomonymieCategory = categories.some((title) => title.includes('homonymie'));
        const isDisambiguation = Boolean(page?.pageprops?.disambiguation !== undefined) || hasHomonymieCategory;
        return { status: 'ok', title: resolved, isDisambiguation };
    } catch {
        return { status: 'error', title: '' };
    }
};

const toWikiPathFromTitle = (title) => {
    const cleaned = String(title || '').trim();
    if (!cleaned) {
        return null;
    }

    const encodedTitle = encodeURIComponent(cleaned.replace(/\s+/g, '_'));
    return `/wiki/${encodedTitle}`;
};

const sanitizePath = (path) => {
    const raw = String(path || '').trim();
    if (!raw) {
        return null;
    }

    if (!raw.startsWith('/wiki/')) {
        return null;
    }

    return raw;
};

const toProxyUrl = (wikiPath) => `/api/wiki/page?path=${encodeURIComponent(wikiPath)}`;

const toMobileHtmlProxyUrl = (articleTitle, language = 'fr') => `/api/wiki/mobile-html?title=${encodeURIComponent(articleTitle)}&lang=${encodeURIComponent(normalizeWikiLanguage(language))}`;

const toDisambiguationRefusalKey = (value) => String(value || '')
    .trim()
    .toLocaleLowerCase('fr');

const readArticlesDatasetRaw = () => {
    const raw = fs.readFileSync(ARTICLES_FILE_PATH, 'utf-8');
    const sanitized = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
    return JSON.parse(sanitized);
};

const writeArticlesDatasetRaw = (payload) => {
    fs.writeFileSync(ARTICLES_FILE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
};

const readDisambiguationState = () => {
    try {
        if (!fs.existsSync(DISAMBIGUATION_FILE_PATH)) {
            return { pending: {}, refused: {} };
        }

        const raw = fs.readFileSync(DISAMBIGUATION_FILE_PATH, 'utf-8');
        const sanitized = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
        const parsed = JSON.parse(sanitized);

        if (!parsed || typeof parsed !== 'object') {
            return { pending: {}, refused: {} };
        }

        return {
            pending: parsed.pending && typeof parsed.pending === 'object' ? parsed.pending : {},
            refused: parsed.refused && typeof parsed.refused === 'object' ? parsed.refused : {}
        };
    } catch {
        return { pending: {}, refused: {} };
    }
};

const writeDisambiguationState = (state) => {
    const payload = {
        pending: state?.pending && typeof state.pending === 'object' ? state.pending : {},
        refused: state?.refused && typeof state.refused === 'object' ? state.refused : {}
    };

    fs.writeFileSync(DISAMBIGUATION_FILE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
};

const fetchDisambiguationChoices = async (title) => {
    const rawTitle = String(title || '').trim();
    if (!rawTitle) {
        return [];
    }

    const normalizeTitleForRanking = (value) => String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('fr')
        .trim();

    const stripDisambiguationSuffix = (value) => String(value || '')
        .replace(/\s*\(homonymie\)\s*$/i, '')
        .trim();

    const isLikelyDisambiguationPageTitle = (value) => /\(homonymie\)\s*$/i.test(String(value || '').trim());

    const scoreChoice = (candidate, baseTitle, sourceBoost) => {
        const candidateRaw = String(candidate || '').trim();
        const baseRaw = String(baseTitle || '').trim();

        if (!candidateRaw || !baseRaw) {
            return Number.NEGATIVE_INFINITY;
        }

        const candidateNormalized = normalizeTitleForRanking(candidateRaw);
        const baseNormalized = normalizeTitleForRanking(baseRaw);

        let score = sourceBoost;

        if (candidateNormalized === baseNormalized) {
            score += 180;
        }

        if (candidateNormalized.startsWith(`${baseNormalized} (`)) {
            score += 160;
        }

        if (candidateNormalized.startsWith(`${baseNormalized},`)) {
            score += 90;
        }

        if (candidateNormalized.startsWith(baseNormalized)) {
            score += 70;
        }

        if (candidateNormalized.includes(baseNormalized)) {
            score += 40;
        }

        if (isDateLikeTitle(candidateRaw)) {
            score -= 120;
        }

        if (/^liste\s+/i.test(candidateRaw)) {
            score -= 35;
        }

        if (isLikelyDisambiguationPageTitle(candidateRaw)) {
            score -= 300;
        }

        score -= Math.abs(candidateRaw.length - baseRaw.length) * 0.6;
        return score;
    };

    const baseTitle = stripDisambiguationSuffix(rawTitle) || rawTitle;

    const headers = {
        'User-Agent': 'WikisGuessrBot/1.0 (+https://wikisguessr.azim404.com)'
    };

    const fetchLinksCandidates = async () => {
        const queryUrl = `${WIKI_API_ORIGIN}?action=query&format=json&formatversion=2&prop=links&titles=${encodeURIComponent(rawTitle)}&plnamespace=0&pllimit=max`;
        const queryResponse = await fetch(queryUrl, { headers });

        if (!queryResponse.ok) {
            return [];
        }

        const payload = await queryResponse.json();
        const links = payload?.query?.pages?.[0]?.links;

        if (!Array.isArray(links)) {
            return [];
        }

        return links
            .map((item) => String(item?.title || '').trim())
            .filter((item) => validateArticleFormat(item).valid)
            .map((item) => ({ title: item, sourceBoost: 90 }));
    };

    const fetchSearchCandidates = async () => {
        const searchQuery = `intitle:${JSON.stringify(baseTitle)}`;
        const searchUrl = `${WIKI_API_ORIGIN}?action=query&format=json&formatversion=2&list=search&srnamespace=0&srlimit=40&srsearch=${encodeURIComponent(searchQuery)}`;
        const searchResponse = await fetch(searchUrl, { headers });

        if (!searchResponse.ok) {
            return [];
        }

        const payload = await searchResponse.json();
        const searchItems = payload?.query?.search;

        if (!Array.isArray(searchItems)) {
            return [];
        }

        return searchItems
            .map((item) => String(item?.title || '').trim())
            .filter((item) => validateArticleFormat(item).valid)
            .map((item) => ({ title: item, sourceBoost: 35 }));
    };

    try {
        const [linksCandidates, searchCandidates] = await Promise.all([
            fetchLinksCandidates(),
            fetchSearchCandidates()
        ]);

        const merged = [...linksCandidates, ...searchCandidates];
        const dedupedByNormalizedTitle = new Map();

        merged.forEach((entry) => {
            const titleValue = String(entry?.title || '').trim();
            const normalizedKey = normalizeTitleForRanking(titleValue);

            if (!titleValue || !normalizedKey) {
                return;
            }

            if (normalizeTitleForRanking(stripDisambiguationSuffix(titleValue)) === normalizeTitleForRanking(baseTitle)) {
                return;
            }

            if (isLikelyDisambiguationPageTitle(titleValue)) {
                return;
            }

            if (isDateLikeTitle(titleValue)) {
                return;
            }

            const current = dedupedByNormalizedTitle.get(normalizedKey);
            if (!current || (entry.sourceBoost || 0) > (current.sourceBoost || 0)) {
                dedupedByNormalizedTitle.set(normalizedKey, {
                    title: titleValue,
                    sourceBoost: Number(entry.sourceBoost || 0)
                });
            }
        });

        return Array.from(dedupedByNormalizedTitle.values())
            .map((entry) => ({
                title: entry.title,
                score: scoreChoice(entry.title, baseTitle, entry.sourceBoost)
            }))
            .filter((entry) => Number.isFinite(entry.score))
            .sort((a, b) => {
                if (b.score !== a.score) {
                    return b.score - a.score;
                }

                return a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' });
            })
            .slice(0, 20)
            .map((entry) => entry.title);
    } catch {
        return [];
    }
};

const normalizeDatasetByTheme = (datasetRaw) => {
    if (Array.isArray(datasetRaw)) {
        return {
            shape: 'array',
            byTheme: {
                default: datasetRaw.map((item) => String(item || '').trim()).filter(Boolean)
            }
        };
    }

    if (!datasetRaw || typeof datasetRaw !== 'object') {
        return { shape: 'object', byTheme: {} };
    }

    const byTheme = Object.entries(datasetRaw).reduce((acc, [theme, items]) => {
        acc[String(theme || '').trim()] = Array.isArray(items)
            ? items.map((item) => String(item || '').trim()).filter(Boolean)
            : [];
        return acc;
    }, {});

    return { shape: 'object', byTheme };
};

const denormalizeDatasetByTheme = ({ shape, byTheme }) => {
    if (shape === 'array') {
        const merged = Object.values(byTheme || {})
            .flatMap((items) => (Array.isArray(items) ? items : []))
            .map((item) => String(item || '').trim())
            .filter(Boolean);

        return Array.from(new Set(merged));
    }

    return byTheme;
};

const parseArticleTitleFromLink = (link) => {
    const raw = String(link || '').trim();
    if (!raw) {
        return '';
    }

    if (raw.startsWith('/wiki/')) {
        return decodeURIComponent(raw.slice('/wiki/'.length)).replace(/_/g, ' ').trim();
    }

    try {
        const url = new URL(raw, 'http://localhost');

        if (url.pathname === '/api/wiki/mobile-html' || url.pathname === '/wiki/mobile-html') {
            const title = url.searchParams.get('title');
            return title ? decodeURIComponent(title).replace(/_/g, ' ').trim() : '';
        }

        if (url.pathname === '/api/wiki/page' || url.pathname === '/wiki/page') {
            const pathParam = url.searchParams.get('path');
            if (pathParam && pathParam.startsWith('/wiki/')) {
                return decodeURIComponent(pathParam.slice('/wiki/'.length)).replace(/_/g, ' ').trim();
            }
        }

        if (url.hostname === 'fr.wikipedia.org' && url.pathname.startsWith('/wiki/')) {
            return decodeURIComponent(url.pathname.slice('/wiki/'.length)).replace(/_/g, ' ').trim();
        }

        if (url.hostname === 'fr.wikipedia.org' && url.pathname === '/w/index.php') {
            const title = url.searchParams.get('title');
            return title ? decodeURIComponent(title).replace(/_/g, ' ').trim() : '';
        }
    } catch {
        return '';
    }

    return '';
};

const buildEffectiveArticleName = (name, link) => {
    const fromName = String(name || '').trim();
    const fromLink = parseArticleTitleFromLink(link);

    // In admin edit mode, link changes should be effective even if name is left untouched.
    return fromLink || fromName;
};

const toArticleId = (theme, name) => `${encodeURIComponent(String(theme || '').trim())}::${encodeURIComponent(String(name || '').trim())}`;

const fromArticleId = (id) => {
    const raw = String(id || '');
    const [themePart, namePart] = raw.split('::');
    if (!themePart || !namePart) {
        return { theme: '', name: '' };
    }

    return {
        theme: decodeURIComponent(themePart),
        name: decodeURIComponent(namePart)
    };
};

const flattenArticlesWithMeta = (byTheme) => Object.entries(byTheme)
    .flatMap(([theme, items]) => (Array.isArray(items) ? items : []).map((name) => ({
        id: toArticleId(theme, name),
        theme,
        name: String(name || '').trim()
    })))
    .filter((item) => item.theme && item.name);

const validateArticleFormat = (name) => {
    const value = String(name || '').trim();
    if (!value) {
        return { valid: false, reason: 'empty' };
    }

    if (/^Q\d+$/i.test(value)) {
        return { valid: false, reason: 'wikidata_id' };
    }

    if (/\.php($|\?)/i.test(value)) {
        return { valid: false, reason: 'php_path' };
    }

    if (/\//.test(value)) {
        return { valid: false, reason: 'path_like' };
    }

    return { valid: true, reason: 'ok' };
};

const isDateLikeTitle = (value) => {
    const title = String(value || '').trim().toLowerCase();
    if (!title) {
        return false;
    }

    const hasFrenchMonth = /(janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre)/i.test(title);
    const hasDayAndYear = /(\b\d{1,2}\b|\b1er\b).*(\b\d{4}\b)/i.test(title);
    return hasFrenchMonth && hasDayAndYear;
};

const canAutoRenameTitle = (fromTitle, toTitle) => {
    const from = String(fromTitle || '').trim();
    const to = String(toTitle || '').trim();
    if (!from || !to) {
        return false;
    }

    // Prevent destructive auto-renames from a semantic article to a calendar date page.
    if (!isDateLikeTitle(from) && isDateLikeTitle(to)) {
        return false;
    }

    return true;
};

export const validateSingleArticle = async (name) => {
    const input = String(name || '').trim();
    const formatState = validateArticleFormat(input);

    if (!formatState.valid) {
        return {
            input,
            status: 'invalid',
            resolvedTitle: '',
            reason: formatState.reason
        };
    }

    const fetchMobileHtmlWithRetries = async (title) => {
        let lastReason = 'mobile_html_unavailable';

        for (let attempt = 1; attempt <= MOBILE_HTML_RETRY_ATTEMPTS; attempt += 1) {
            try {
                const response = await fetchMobileHtmlByTitle(title);
                if (response.ok) {
                    return { response, reason: 'ok' };
                }

                if (TRANSIENT_HTTP_STATUSES.has(response.status)) {
                    lastReason = `transient_http_${response.status}`;
                    if (attempt < MOBILE_HTML_RETRY_ATTEMPTS) {
                        const backoffMs = 220 * attempt;
                        await sleep(backoffMs);
                        continue;
                    }
                } else {
                    lastReason = 'mobile_html_unavailable';
                    return { response, reason: lastReason };
                }
            } catch {
                lastReason = 'network_error';
                if (attempt < MOBILE_HTML_RETRY_ATTEMPTS) {
                    const backoffMs = 220 * attempt;
                    await sleep(backoffMs);
                    continue;
                }
            }
        }

        return { response: null, reason: lastReason };
    };

    const canonical = await resolveCanonicalTitle(input);
    if (canonical.status === 'missing') {
        return {
            input,
            status: 'invalid',
            resolvedTitle: '',
            reason: 'title_missing'
        };
    }

    if (canonical.status === 'ok' && canonical.isDisambiguation) {
        const disambiguationTitle = canonical.title || input;
        const choices = await fetchDisambiguationChoices(disambiguationTitle);

        return {
            input,
            status: 'disambiguation',
            resolvedTitle: '',
            reason: 'manual_choice_required',
            choices
        };
    }

    // Only after disambiguation guard, test renderability with mobile-html.
    let primaryResult = await fetchMobileHtmlWithRetries(input);
    if (primaryResult.response?.ok) {

        const resolvedTitle = canonical.status === 'ok' && canonical.title
            ? canonical.title
            : (extractArticleTitleFromUrl(primaryResult.response.url) || input);

        return {
            input,
            status: resolvedTitle.toLowerCase() === input.toLowerCase() ? 'ok' : 'redirected',
            resolvedTitle,
            reason: 'ok'
        };
    }

    // If title resolves to a different canonical page, retry once on canonical target.
    if (canonical.status === 'ok' && canonical.title && canonical.title.toLowerCase() !== input.toLowerCase()) {
        const canonicalResult = await fetchMobileHtmlWithRetries(canonical.title);
        if (canonicalResult.response?.ok) {
            return {
                input,
                status: 'correctable',
                resolvedTitle: canonical.title,
                reason: 'resolved_canonical'
            };
        }

        primaryResult = {
            response: canonicalResult.response || primaryResult.response,
            reason: canonicalResult.reason || primaryResult.reason
        };
    }

    if (String(primaryResult.reason || '').startsWith('transient_http_') || primaryResult.reason === 'network_error') {
        return {
            input,
            status: 'error',
            resolvedTitle: '',
            reason: primaryResult.reason
        };
    }

    if (canonical.status === 'error') {
        return {
            input,
            status: 'error',
            resolvedTitle: '',
            reason: 'title_resolution_unavailable'
        };
    }

    return {
        input,
        status: 'error',
        resolvedTitle: '',
        reason: 'mobile_html_unavailable'
    };
};

const resolveValidationConcurrency = () => {
    const raw = Number.parseInt(process.env.WIKI_VALIDATION_CONCURRENCY || '', 10);
    if (!Number.isFinite(raw) || raw <= 0) {
        return DEFAULT_VALIDATION_CONCURRENCY;
    }

    return Math.min(raw, 30);
};

const validateArticlesWithProgress = async (allArticles, { onProgress } = {}) => {
    const report = new Array(allArticles.length);
    const validationCache = new Map();
    const total = allArticles.length;
    const concurrency = Math.min(resolveValidationConcurrency(), Math.max(total, 1));

    let nextIndex = 0;
    let completed = 0;

    const worker = async () => {
        while (true) {
            const currentIndex = nextIndex;
            nextIndex += 1;

            if (currentIndex >= total) {
                return;
            }

            const item = allArticles[currentIndex];
            const cacheKey = String(item.name || '').trim().toLowerCase();

            let validationPromise = validationCache.get(cacheKey);
            if (!validationPromise) {
                validationPromise = validateSingleArticle(item.name);
                validationCache.set(cacheKey, validationPromise);
            }

            const validation = await validationPromise;
            const entry = {
                id: item.id,
                theme: item.theme,
                name: item.name,
                status: validation.status,
                resolvedTitle: validation.resolvedTitle,
                reason: validation.reason,
                choices: Array.isArray(validation.choices) ? validation.choices : []
            };

            report[currentIndex] = entry;
            completed += 1;

            if (onProgress) {
                await onProgress({ index: completed, total, entry });
            }
        }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    return report;
};

const buildValidationSummary = (report) => report.reduce((acc, entry) => {
    acc.total += 1;
    acc[entry.status] = (acc[entry.status] || 0) + 1;
    return acc;
}, {
    total: 0,
    ok: 0,
    redirected: 0,
    correctable: 0,
    disambiguation: 0,
    invalid: 0,
    error: 0
});

const isDefinitelyUnreachableInvalid = (entry) => {
    if (!entry || entry.status !== 'invalid') {
        return false;
    }

    // Only delete entries that are truly non-playable/unreachable.
    return [
        'empty',
        'wikidata_id',
        'php_path',
        'path_like',
        'title_missing'
    ].includes(String(entry.reason || ''));
};

const isDisambiguationRefused = (state, title) => {
    const key = toDisambiguationRefusalKey(title);
    if (!key) {
        return false;
    }

    return Boolean(state?.refused?.[key]);
};

const applyDisambiguationRefusalOverrides = (report, state) => {
    report.forEach((entry) => {
        if (entry.status !== 'disambiguation') {
            return;
        }

        if (!isDisambiguationRefused(state, entry.name)) {
            return;
        }

        entry.status = 'ok';
        entry.reason = 'disambiguation_refused';
        entry.choices = [];
    });
};

const applyValidationMutations = ({ normalized, report, autoFix, removeInvalid }) => {
    const byTheme = normalized.byTheme;
    const updatesByTheme = new Map();
    const removalsByTheme = new Map();
    const disambiguationState = readDisambiguationState();
    const pending = { ...(disambiguationState.pending || {}) };

    if (autoFix) {
        report.forEach((entry) => {
            if ((entry.status === 'correctable' || entry.status === 'redirected') && entry.resolvedTitle) {
                if (!canAutoRenameTitle(entry.name, entry.resolvedTitle)) {
                    return;
                }

                const arr = updatesByTheme.get(entry.theme) || [];
                arr.push({ from: entry.name, to: entry.resolvedTitle });
                updatesByTheme.set(entry.theme, arr);
            }
        });
    }

    if (removeInvalid) {
        report.forEach((entry) => {
            if (isDefinitelyUnreachableInvalid(entry)) {
                const arr = removalsByTheme.get(entry.theme) || [];
                arr.push(entry.name);
                removalsByTheme.set(entry.theme, arr);
            }
        });
    }

    report.forEach((entry) => {
        if (entry.status === 'disambiguation') {
            if (isDisambiguationRefused(disambiguationState, entry.name)) {
                if (pending[entry.id]) {
                    delete pending[entry.id];
                }
                return;
            }

            pending[entry.id] = {
                id: entry.id,
                theme: entry.theme,
                name: entry.name,
                choices: Array.isArray(entry.choices) ? entry.choices : [],
                updatedAt: new Date().toISOString()
            };
            return;
        }

        if (pending[entry.id]) {
            delete pending[entry.id];
        }
    });

    updatesByTheme.forEach((updates, theme) => {
        if (!Array.isArray(byTheme[theme])) {
            return;
        }

        byTheme[theme] = byTheme[theme].map((name) => {
            const match = updates.find((item) => item.from === name);
            return match ? match.to : name;
        });
    });

    removalsByTheme.forEach((names, theme) => {
        if (!Array.isArray(byTheme[theme])) {
            return;
        }

        const removalSet = new Set(names);
        byTheme[theme] = byTheme[theme].filter((name) => !removalSet.has(name));
    });

    if (removeInvalid) {
        const seenNames = new Set();

        Object.keys(byTheme).forEach((theme) => {
            if (!Array.isArray(byTheme[theme])) {
                return;
            }

            byTheme[theme] = byTheme[theme].filter((name) => {
                const normalizedName = String(name || '').trim().toLocaleLowerCase('fr');
                if (!normalizedName) {
                    return false;
                }

                if (seenNames.has(normalizedName)) {
                    return false;
                }

                seenNames.add(normalizedName);
                return true;
            });
        });
    }

    const hasDatasetMutation = autoFix || removeInvalid;
    if (hasDatasetMutation) {
        Object.keys(byTheme).forEach((theme) => {
            byTheme[theme] = Array.from(new Set((byTheme[theme] || []).map((name) => String(name || '').trim()).filter(Boolean)));
        });

        writeArticlesDatasetRaw(denormalizeDatasetByTheme({ shape: normalized.shape, byTheme }));
    }

    writeDisambiguationState({ pending, refused: disambiguationState.refused || {} });
};

const writeStreamEvent = (res, payload) => {
    res.write(`${JSON.stringify(payload)}\n`);
};

const readArticlesDataset = () => {
    const parsed = readArticlesDatasetRaw();
    const normalized = normalizeDatasetByTheme(parsed);

    return flattenArticlesWithMeta(normalized.byTheme);
};

const toArticleTitleFromRelativeHref = (href) => {
    const raw = String(href || '').trim();
    if (!raw) {
        return '';
    }

    const normalized = raw.replace(/^\.\//, '').replace(/^\.\.\//, '').replace(/^\/+/, '');

    if (!normalized) {
        return '';
    }

    if (normalized.startsWith('w/index.php')) {
        try {
            const url = new URL(`https://fr.wikipedia.org/${normalized}`);
            const title = url.searchParams.get('title');
            return title ? decodeURIComponent(title).replace(/_/g, ' ').trim() : '';
        } catch {
            return '';
        }
    }

    if (/\.(?:css|js|json|png|jpg|jpeg|gif|svg|webp|ico|pdf)$/i.test(normalized)) {
        return '';
    }

    return decodeURIComponent(normalized.split('#')[0].split('?')[0]).replace(/_/g, ' ').trim();
};

const extractArticleTitleFromUrl = (value) => {
    try {
        const url = new URL(value, WIKI_ORIGIN);
        if (url.hostname.endsWith('.wikipedia.org') && url.pathname.startsWith('/wiki/')) {
            return decodeURIComponent(url.pathname.slice('/wiki/'.length)).replace(/_/g, ' ').trim();
        }

        if (url.hostname.endsWith('.wikipedia.org') && url.pathname.startsWith('/api/rest_v1/page/mobile-html/')) {
            return decodeURIComponent(url.pathname.slice('/api/rest_v1/page/mobile-html/'.length)).replace(/_/g, ' ').trim();
        }

        if (url.pathname === '/api/wiki/mobile-html' || url.pathname === '/wiki/mobile-html') {
            const title = url.searchParams.get('title');
            if (title) {
                return decodeURIComponent(title).replace(/_/g, ' ').trim();
            }
        }
    } catch {
        return '';
    }

    return '';
};

const ARTICLE_TRACKER_SCRIPT = `
<script>
(() => {
    const extractTitleFromProxy = () => {
        try {
            const params = new URLSearchParams(window.location.search);
            const title = params.get('title');
            const path = params.get('path');
            if (title) {
                return decodeURIComponent(title).replace(/_/g, ' ').trim();
            }
            if (path && path.startsWith('/wiki/')) {
                const trimmed = path.slice('/wiki/'.length).split('#')[0].split('?')[0];
                return decodeURIComponent(trimmed).replace(/_/g, ' ').trim();
            }
        } catch {}
        return '';
    };

    const extractTitleFromDom = () => {
        const heading = document.getElementById('firstHeading');
        if (heading && heading.textContent) {
            return heading.textContent.trim();
        }
        return '';
    };

    const notifyParent = () => {
        const title = extractTitleFromDom() || extractTitleFromProxy();
        if (!title) {
            return;
        }
        window.parent.postMessage({ type: 'WIKISGUESSR_ARTICLE', title }, window.location.origin);
    };

    window.addEventListener('load', notifyParent);
    window.addEventListener('popstate', notifyParent);
    window.addEventListener('hashchange', notifyParent);
    document.addEventListener('click', () => setTimeout(notifyParent, 50), true);
    notifyParent();
})();
</script>
`;

const injectTracker = (html) => {
    if (html.includes('WIKISGUESSR_ARTICLE')) {
        return html;
    }

    if (html.includes('</body>')) {
        return html.replace('</body>', `${ARTICLE_TRACKER_SCRIPT}</body>`);
    }

    return `${html}${ARTICLE_TRACKER_SCRIPT}`;
};

const rewriteWikiLinks = (html) => {
    let output = html;

    // Keep pages inside the game iframe by proxying wiki article links.
    output = output.replace(
        /href="(https?:\/\/fr\.wikipedia\.org)?(\/wiki\/[^"#?]*)([^"#]*)?"/g,
        (_match, _host, pathPart, queryPart = '') => {
            const fullPath = `${pathPart}${queryPart}`;
            return `href="${toProxyUrl(fullPath)}"`;
        }
    );

    output = output.replace(/href="\/wiki\/([^"#?]*)([^"#]*)?"/g, (_match, slug, queryPart = '') => {
        const fullPath = `/wiki/${slug}${queryPart}`;
        return `href="${toProxyUrl(fullPath)}"`;
    });

    // Convert protocol-relative resources to explicit https URLs.
    output = output.replace(/(href|src)="\/\/([^"]+)"/g, (_match, attr, pathPart) => {
        return `${attr}="https://${pathPart}"`;
    });

    // Keep CSS/JS/images/fonts loading from Wikipedia when they are root-relative.
    output = output.replace(/(href|src|action)="\/(?!\/)(?!api\/wiki\/page)(?!wiki\/)([^"]+)"/g, (_match, attr, pathPart) => {
        return `${attr}="${WIKI_ORIGIN}/${pathPart}"`;
    });

    return injectTracker(output);
};

const rewriteMobileHtmlLinks = (html, language = 'fr') => {
    let output = html;
    const wikiLanguage = normalizeWikiLanguage(language);
    const wikiOrigin = `https://${wikiLanguage}.wikipedia.org`;

    output = output.replace(/href="(\.\.\/|\.\/)([^"#?]+)([^"#]*)?"/g, (_match, prefix, slug, queryPart = '') => {
        const articleTitle = toArticleTitleFromRelativeHref(`${prefix}${slug}${queryPart}`);
        if (!articleTitle) {
            return _match;
        }

        return `href="${toMobileHtmlProxyUrl(articleTitle, wikiLanguage)}"`;
    });

    output = output.replace(
        /href="(https?:\/\/[a-z-]+\.wikipedia\.org)?(\/wiki\/[^"#?]*)([^"#]*)?"/g,
        (_match, _host, pathPart, queryPart = '') => {
            const articleTitle = extractArticleTitleFromUrl(`${pathPart}${queryPart}`);
            if (!articleTitle) {
                return _match;
            }

            return `href="${toMobileHtmlProxyUrl(articleTitle, wikiLanguage)}"`;
        }
    );

    output = output.replace(/href="\/wiki\/([^"#?]*)([^"#]*)?"/g, (_match, slug, queryPart = '') => {
        const articleTitle = extractArticleTitleFromUrl(`/wiki/${slug}${queryPart}`);
        if (!articleTitle) {
            return _match;
        }

        return `href="${toMobileHtmlProxyUrl(articleTitle, wikiLanguage)}"`;
    });

    output = output.replace(/(href|src)="\/wiki\/([^"#?]*)([^"#]*)?"/g, (_match, attr, slug, queryPart = '') => {
        const articleTitle = extractArticleTitleFromUrl(`/wiki/${slug}${queryPart}`);
        if (!articleTitle) {
            return _match;
        }

        return `${attr}="${toMobileHtmlProxyUrl(articleTitle, wikiLanguage)}"`;
    });

    output = output.replace(/(href)="\/w\/index\.php\?title=([^"&]+)([^"]*)"/g, (_match, attr, titlePart, queryPart = '') => {
        const articleTitle = decodeURIComponent(titlePart).replace(/_/g, ' ').trim();
        if (!articleTitle) {
            return _match;
        }

        return `${attr}="${toMobileHtmlProxyUrl(articleTitle, wikiLanguage)}"`;
    });

    output = output.replace(/(href|src)="\/(?!\/)(?!api\/wiki\/mobile-html(?:[/?#&]|$))([^\"]+)"/g, (_match, attr, pathPart) => {
        return `${attr}="${wikiOrigin}/${pathPart}"`;
    });

    output = output.replace(/(href|src)="\/\/([^\"]+)"/g, (_match, attr, pathPart) => {
        return `${attr}="https://${pathPart}"`;
    });

    return output;
};

export const proxyWikiPage = async (req, res) => {
    try {
        const pathFromTitle = toWikiPathFromTitle(req.query.title);
        const requestedPath = sanitizePath(req.query.path) || pathFromTitle;

        if (!requestedPath) {
            return res.status(400).send('Parametre title ou path requis');
        }

        const targetUrl = `${WIKI_ORIGIN}${requestedPath}`;
        const response = await fetch(targetUrl, {
            redirect: 'follow',
            headers: {
                'User-Agent': 'WikisGuessrBot/1.0 (+https://wikisguessr.azim404.com)'
            }
        });

        if (!response.ok) {
            return res.status(502).send('Impossible de recuperer la page Wikipedia');
        }

        const html = await response.text();
        const rewrittenHtml = rewriteWikiLinks(html);

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(rewrittenHtml);
    } catch (error) {
        console.error('proxyWikiPage error:', error);
        return res.status(500).send('Erreur proxy Wikipedia');
    }
};

export const fetchWikiMobileHtml = async (req, res) => {
    try {
        const title = String(req.query.title || '').trim();
        const wikiLanguage = normalizeWikiLanguage(req.query.lang);

        if (!title) {
            return res.status(400).json({ error: 'Parametre title requis' });
        }

        if (isOfflineDemoModeEnabled()) {
            const forcedOfflinePayload = buildOfflineMobileHtmlPayload(title);
            if (forcedOfflinePayload) {
                return res.status(200).json(forcedOfflinePayload);
            }

            return res.status(503).json({ error: 'Mode offline actif mais parcours JSON indisponible' });
        }

        let requestedTitle = title;
        let response = await fetchMobileHtmlByTitle(requestedTitle, wikiLanguage);

        if (!response.ok) {
            const fallbackTitle = await resolveFallbackTitle(title, wikiLanguage);
            if (fallbackTitle && fallbackTitle.toLowerCase() !== title.toLowerCase()) {
                requestedTitle = fallbackTitle;
                response = await fetchMobileHtmlByTitle(requestedTitle, wikiLanguage);
            }
        }

        if (!response.ok) {
            const offlinePayload = buildOfflineMobileHtmlPayload(requestedTitle);
            if (offlinePayload) {
                return res.status(200).json(offlinePayload);
            }

            return res.status(502).json({ error: 'Impossible de recuperer la page Wikipedia' });
        }

        const html = await response.text();
        const resolvedTitle = extractArticleTitleFromUrl(response.url) || requestedTitle;

        return res.status(200).json({
            title: resolvedTitle,
            html: rewriteMobileHtmlLinks(html, wikiLanguage),
            language: wikiLanguage,
            sourceUrl: response.url
        });
    } catch (error) {
        console.error('fetchWikiMobileHtml error:', error);

        const title = String(req.query.title || '').trim();
        const offlinePayload = buildOfflineMobileHtmlPayload(title);
        if (offlinePayload) {
            return res.status(200).json(offlinePayload);
        }

        return res.status(500).json({ error: 'Erreur mobile-html Wikipedia' });
    }
};

export const getWikiArticlesList = async (_req, res) => {
    try {
        const disambiguationState = readDisambiguationState();
        const pending = disambiguationState.pending || {};

        const articles = readArticlesDataset()
            .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
            .map((item) => ({
                id: item.id,
                theme: item.theme,
                name: item.name,
                link: toMobileHtmlProxyUrl(item.name),
                hasPendingDisambiguation: Boolean(pending[item.id]),
                hasRefusedDisambiguation: isDisambiguationRefused(disambiguationState, item.name)
            }));

        return res.status(200).json({
            total: articles.length,
            articles
        });
    } catch (error) {
        console.error('getWikiArticlesList error:', error);
        return res.status(500).json({ error: 'Impossible de recuperer la liste des articles' });
    }
};

export const getWikiDisambiguationPending = async (_req, res) => {
    try {
        const state = readDisambiguationState();
        const pending = Object.values(state.pending || {})
            .filter((entry) => entry.id && entry.name)
            .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));

        return res.status(200).json({
            total: pending.length,
            pending
        });
    } catch (error) {
        console.error('getWikiDisambiguationPending error:', error);
        return res.status(500).json({ error: 'Impossible de recuperer les paronymies en attente' });
    }
};

export const createWikiArticle = async (req, res) => {
    try {
        const inputName = String(req.body?.name || '').trim();
        const inputLink = String(req.body?.link || '').trim();
        const resolvedName = buildEffectiveArticleName(inputName, inputLink);

        if (!resolvedName) {
            return res.status(400).json({ error: 'Nom ou lien valide requis' });
        }

        const datasetRaw = readArticlesDatasetRaw();
        const normalized = normalizeDatasetByTheme(datasetRaw);
        const byTheme = normalized.byTheme;

        if (!byTheme[DEFAULT_ADMIN_THEME]) {
            byTheme[DEFAULT_ADMIN_THEME] = [];
        }

        const duplicate = flattenArticlesWithMeta(byTheme)
            .find((item) => item.name.toLowerCase() === resolvedName.toLowerCase());

        if (duplicate) {
            return res.status(409).json({ error: 'Article deja present dans le dataset' });
        }

        byTheme[DEFAULT_ADMIN_THEME].push(resolvedName);
        byTheme[DEFAULT_ADMIN_THEME] = Array.from(new Set(byTheme[DEFAULT_ADMIN_THEME]));

        writeArticlesDatasetRaw(denormalizeDatasetByTheme({ shape: normalized.shape, byTheme }));

        return res.status(201).json({
            article: {
                id: toArticleId(DEFAULT_ADMIN_THEME, resolvedName),
                theme: DEFAULT_ADMIN_THEME,
                name: resolvedName,
                link: toMobileHtmlProxyUrl(resolvedName)
            }
        });
    } catch (error) {
        console.error('createWikiArticle error:', error);
        return res.status(500).json({ error: 'Impossible d\'ajouter l\'article' });
    }
};

export const updateWikiArticle = async (req, res) => {
    try {
        const { articleId } = req.params;
        const source = fromArticleId(articleId);

        if (!source.theme || !source.name) {
            return res.status(400).json({ error: 'Identifiant article invalide' });
        }

        const inputName = String(req.body?.name || '').trim();
        const inputLink = String(req.body?.link || '').trim();
        const resolvedName = buildEffectiveArticleName(inputName, inputLink);

        if (!resolvedName) {
            return res.status(400).json({ error: 'Nom ou lien valide requis' });
        }

        const datasetRaw = readArticlesDatasetRaw();
        const normalized = normalizeDatasetByTheme(datasetRaw);
        const byTheme = normalized.byTheme;

        if (!Array.isArray(byTheme[source.theme])) {
            return res.status(404).json({ error: 'Article introuvable' });
        }

        const index = byTheme[source.theme].findIndex((name) => String(name).trim() === source.name);
        if (index === -1) {
            return res.status(404).json({ error: 'Article introuvable' });
        }

        const hasDuplicate = flattenArticlesWithMeta(byTheme)
            .some((item) => item.name.toLowerCase() === resolvedName.toLowerCase() && item.id !== articleId);

        if (hasDuplicate) {
            return res.status(409).json({ error: 'Un article avec ce nom existe deja' });
        }

        byTheme[source.theme][index] = resolvedName;
        byTheme[source.theme] = Array.from(new Set(byTheme[source.theme]));

        writeArticlesDatasetRaw(denormalizeDatasetByTheme({ shape: normalized.shape, byTheme }));

        const disambiguationState = readDisambiguationState();
        if (disambiguationState.pending?.[articleId]) {
            delete disambiguationState.pending[articleId];
            writeDisambiguationState(disambiguationState);
        }

        return res.status(200).json({
            article: {
                id: toArticleId(source.theme, resolvedName),
                theme: source.theme,
                name: resolvedName,
                link: toMobileHtmlProxyUrl(resolvedName)
            }
        });
    } catch (error) {
        console.error('updateWikiArticle error:', error);
        return res.status(500).json({ error: 'Impossible de modifier l\'article' });
    }
};

export const deleteWikiArticle = async (req, res) => {
    try {
        const { articleId } = req.params;
        const source = fromArticleId(articleId);

        if (!source.theme || !source.name) {
            return res.status(400).json({ error: 'Identifiant article invalide' });
        }

        const datasetRaw = readArticlesDatasetRaw();
        const normalized = normalizeDatasetByTheme(datasetRaw);
        const byTheme = normalized.byTheme;

        if (!Array.isArray(byTheme[source.theme])) {
            return res.status(404).json({ error: 'Article introuvable' });
        }

        const index = byTheme[source.theme].findIndex((name) => String(name || '').trim() === source.name);
        if (index === -1) {
            return res.status(404).json({ error: 'Article introuvable' });
        }

        byTheme[source.theme].splice(index, 1);
        writeArticlesDatasetRaw(denormalizeDatasetByTheme({ shape: normalized.shape, byTheme }));

        const disambiguationState = readDisambiguationState();
        if (disambiguationState.pending?.[articleId]) {
            delete disambiguationState.pending[articleId];
            writeDisambiguationState(disambiguationState);
        }

        return res.status(200).json({
            removed: {
                id: articleId,
                theme: source.theme,
                name: source.name
            }
        });
    } catch (error) {
        console.error('deleteWikiArticle error:', error);
        return res.status(500).json({ error: 'Impossible de supprimer l\'article' });
    }
};

export const resolveWikiDisambiguation = async (req, res) => {
    try {
        const { articleId } = req.params;
        const source = fromArticleId(articleId);
        const selectedTitle = String(req.body?.selectedTitle || '').trim();

        if (!source.theme || !source.name) {
            return res.status(400).json({ error: 'Identifiant article invalide' });
        }

        if (!selectedTitle) {
            return res.status(400).json({ error: 'Choix de page requis' });
        }

        if (!validateArticleFormat(selectedTitle).valid) {
            return res.status(400).json({ error: 'Page choisie invalide' });
        }

        const disambiguationState = readDisambiguationState();
        const pendingEntry = disambiguationState.pending?.[articleId];

        if (!pendingEntry) {
            return res.status(404).json({ error: 'Aucune paronymie en attente pour cet article' });
        }

        const isInChoices = Array.isArray(pendingEntry.choices)
            ? pendingEntry.choices.some((choice) => String(choice || '').toLowerCase() === selectedTitle.toLowerCase())
            : false;

        if (!isInChoices) {
            return res.status(400).json({ error: 'Le choix doit faire partie des options proposees' });
        }

        const datasetRaw = readArticlesDatasetRaw();
        const normalized = normalizeDatasetByTheme(datasetRaw);
        const byTheme = normalized.byTheme;

        if (!Array.isArray(byTheme[source.theme])) {
            return res.status(404).json({ error: 'Article introuvable' });
        }

        const index = byTheme[source.theme].findIndex((name) => String(name || '').trim() === source.name);
        if (index === -1) {
            return res.status(404).json({ error: 'Article introuvable' });
        }

        byTheme[source.theme][index] = selectedTitle;
        byTheme[source.theme] = Array.from(new Set(byTheme[source.theme].map((item) => String(item || '').trim()).filter(Boolean)));
        writeArticlesDatasetRaw(denormalizeDatasetByTheme({ shape: normalized.shape, byTheme }));

        delete disambiguationState.pending[articleId];
        writeDisambiguationState(disambiguationState);

        return res.status(200).json({
            article: {
                id: toArticleId(source.theme, selectedTitle),
                theme: source.theme,
                name: selectedTitle,
                link: toMobileHtmlProxyUrl(selectedTitle)
            }
        });
    } catch (error) {
        console.error('resolveWikiDisambiguation error:', error);
        return res.status(500).json({ error: 'Impossible de resoudre la paronymie' });
    }
};

export const rejectWikiDisambiguation = async (req, res) => {
    try {
        const { articleId } = req.params;
        const source = fromArticleId(articleId);

        if (!source.theme || !source.name) {
            return res.status(400).json({ error: 'Identifiant article invalide' });
        }

        const disambiguationState = readDisambiguationState();
        const pendingEntry = disambiguationState.pending?.[articleId];

        if (!pendingEntry) {
            return res.status(404).json({ error: 'Aucune paronymie en attente pour cet article' });
        }

        const refusalKey = toDisambiguationRefusalKey(pendingEntry.name);
        if (!refusalKey) {
            return res.status(400).json({ error: 'Nom de paronymie invalide' });
        }

        disambiguationState.refused = disambiguationState.refused || {};
        disambiguationState.refused[refusalKey] = {
            name: pendingEntry.name,
            articleId,
            theme: pendingEntry.theme,
            updatedAt: new Date().toISOString()
        };

        delete disambiguationState.pending[articleId];
        writeDisambiguationState(disambiguationState);

        return res.status(200).json({
            rejected: {
                id: articleId,
                name: pendingEntry.name,
                theme: pendingEntry.theme
            }
        });
    } catch (error) {
        console.error('rejectWikiDisambiguation error:', error);
        return res.status(500).json({ error: 'Impossible de refuser la paronymie' });
    }
};

export const unrejectWikiDisambiguation = async (req, res) => {
    try {
        const { articleId } = req.params;
        const source = fromArticleId(articleId);

        if (!source.theme || !source.name) {
            return res.status(400).json({ error: 'Identifiant article invalide' });
        }

        const disambiguationState = readDisambiguationState();
        const refusalKey = toDisambiguationRefusalKey(source.name);

        if (!refusalKey || !disambiguationState.refused?.[refusalKey]) {
            return res.status(404).json({ error: 'Aucun refus de paronymie actif pour cet article' });
        }

        delete disambiguationState.refused[refusalKey];
        writeDisambiguationState(disambiguationState);

        return res.status(200).json({
            unrejected: {
                id: articleId,
                name: source.name,
                theme: source.theme
            }
        });
    } catch (error) {
        console.error('unrejectWikiDisambiguation error:', error);
        return res.status(500).json({ error: 'Impossible de retirer le refus de paronymie' });
    }
};

export const validateWikiArticles = async (req, res) => {
    try {
        const autoFix = Boolean(req.body?.autoFix);
        const removeInvalid = Boolean(req.body?.removeInvalid);

        const datasetRaw = readArticlesDatasetRaw();
        const normalized = normalizeDatasetByTheme(datasetRaw);
        const byTheme = normalized.byTheme;
        const allArticles = flattenArticlesWithMeta(byTheme);

        const report = await validateArticlesWithProgress(allArticles);
        applyDisambiguationRefusalOverrides(report, readDisambiguationState());

        applyValidationMutations({ normalized, report, autoFix, removeInvalid });

        const summary = buildValidationSummary(report);

        return res.status(200).json({
            summary,
            options: {
                autoFix,
                removeInvalid
            },
            report
        });
    } catch (error) {
        console.error('validateWikiArticles error:', error);
        return res.status(500).json({ error: 'Impossible de valider les articles' });
    }
};

export const validateWikiArticlesStream = async (req, res) => {
    const autoFix = Boolean(req.body?.autoFix);
    const removeInvalid = Boolean(req.body?.removeInvalid);

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    try {
        const datasetRaw = readArticlesDatasetRaw();
        const normalized = normalizeDatasetByTheme(datasetRaw);
        const allArticles = flattenArticlesWithMeta(normalized.byTheme);

        const total = allArticles.length;

        writeStreamEvent(res, {
            type: 'start',
            total,
            options: { autoFix, removeInvalid }
        });

        const report = await validateArticlesWithProgress(allArticles, {
            onProgress: ({ index, total: progressTotal, entry }) => {
                writeStreamEvent(res, {
                    type: 'progress',
                    index,
                    total: progressTotal,
                    entry
                });
            }
        });

        applyDisambiguationRefusalOverrides(report, readDisambiguationState());
        applyValidationMutations({ normalized, report, autoFix, removeInvalid });
        const summary = buildValidationSummary(report);

        writeStreamEvent(res, {
            type: 'done',
            summary,
            options: { autoFix, removeInvalid },
            report
        });

        return res.end();
    } catch (error) {
        console.error('validateWikiArticlesStream error:', error);
        writeStreamEvent(res, {
            type: 'error',
            message: 'Impossible de valider les articles'
        });
        return res.end();
    }
};
