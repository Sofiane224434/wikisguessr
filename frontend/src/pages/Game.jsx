import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Compass } from 'lucide-react';
import DOMPurify from 'dompurify';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import { gameService, siteService, resolveMediaUrl } from '../services/api.js';

const normalizeArticle = (value) =>
    decodeURIComponent(String(value || '').replace(/\+/g, ' '))
        .replace(/_/g, ' ')
        .trim()
        .toLowerCase();

const isLikelyPlayableWikiTitle = (value) => {
    const title = String(value || '').trim();
    if (!title) {
        return false;
    }

    // Exclut les IDs Wikidata et chemins externes typiques non-articles.
    if (/^Q\d+$/i.test(title)) {
        return false;
    }

    if (/\.php($|\?)/i.test(title) || /\//.test(title)) {
        return false;
    }

    return true;
};

const TIMER_STORAGE_PREFIX = 'wikisguessr:game:start:';
const STATE_STORAGE_PREFIX = 'wikisguessr:game:state:';
const CHRONO_START_SECONDS = 5 * 60;
const CHRONO_SCORE_DECAY_INTERVAL_SECONDS = 2;

const PRESET_BOTS = [
    { username: 'Alex_Explorer', avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Alex_Explorer' },
    { username: 'Sophie_Wiki', avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Sophie_Wiki' },
    { username: 'Lucas_Chrono', avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Lucas_Chrono' },
    { username: 'Clara_Guess', avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Clara_Guess' },
    { username: 'Hugo_Search', avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Hugo_Search' },
    { username: 'Emma_Path', avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Emma_Path' },
    { username: 'Nathan_Link', avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Nathan_Link' },
    { username: 'Camille_Nav', avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Camille_Nav' }
];

const ensureEightParticipantsWithBots = (existingList = [], userUsername = 'Joueur') => {
    const list = Array.isArray(existingList) && existingList.length > 0
        ? existingList
        : [{ user_id: 'current_user', username: userUsername || 'Joueur', progress_status: 'playing' }];

    if (list.length >= 8) {
        return list;
    }

    const existingNames = new Set(list.map((p) => String(p.username || '').toLowerCase()));
    const needed = 8 - list.length;
    const available = PRESET_BOTS.filter((b) => !existingNames.has(b.username.toLowerCase()));

    const bots = available.slice(0, needed).map((bot, i) => ({
        user_id: `bot_${i + 1}`,
        username: bot.username,
        avatar_url: bot.avatar_url,
        isBot: true,
        progress_status: 'playing',
        clicks: 0,
        time_seconds: 0,
        score: 0,
        won: false
    }));

    return [...list, ...bots];
};

const computeFinalLeaderboard = (participants, currentUserResult, gameMode) => {
    const list = ensureEightParticipantsWithBots(participants, currentUserResult?.username || 'Vous');
    const playerWon = Boolean(currentUserResult?.won);
    const playerScore = Number(currentUserResult?.score) || 0;
    const playerClicks = Math.max(1, Number(currentUserResult?.clicks) || 1);
    const playerTime = Math.max(5, Number(currentUserResult?.time_seconds) || 5);

    const ranked = list.map((p, idx) => {
        const isCurrent = !p.isBot && (
            p.user_id === currentUserResult?.user_id
            || p.user_id === 'current_user'
            || p.username === currentUserResult?.username
            || idx === 0
        );

        if (isCurrent) {
            return {
                ...p,
                isCurrent: true,
                score: playerScore,
                clicks: playerClicks,
                time_seconds: playerTime,
                won: playerWon,
                status: currentUserResult?.status || (playerWon ? 'finished' : 'abandoned')
            };
        }

        const botSeed = ((idx + 1) * 73 + playerClicks * 17) % 100;
        const botWon = playerWon ? (botSeed > 25) : (botSeed > 65);
        const botClicks = botWon
            ? Math.max(2, Math.round(playerClicks * (1.1 + (idx * 0.12))))
            : Math.max(1, Math.round(playerClicks * 0.6));
        const botTime = botWon
            ? Math.max(20, Math.round(playerTime * (1.15 + (idx * 0.1))))
            : Math.max(10, Math.round(playerTime * 0.7));

        let botScore = 0;
        if (botWon) {
            if (gameMode === 'chrono') {
                botScore = Math.max(50, Math.round(Math.min(playerScore > 0 ? playerScore - (idx * 35) : 350, 480 - (idx * 35))));
            } else if (gameMode === 'knowledge') {
                botScore = Math.max(100, Math.round(Math.min(playerScore > 0 ? playerScore - (idx * 50) : 420, 680 - (idx * 55))));
            } else {
                botScore = Math.max(50, Math.round(Math.min(playerScore > 0 ? playerScore - (idx * 60) : 550, 780 - (idx * 65))));
            }
        }

        return {
            ...p,
            isCurrent: false,
            score: botScore,
            clicks: botClicks,
            time_seconds: botTime,
            won: botWon,
            status: botWon ? 'finished' : 'defeat'
        };
    });

    ranked.sort((a, b) => {
        if (a.won !== b.won) return a.won ? -1 : 1;
        if (b.score !== a.score) return b.score - a.score;
        if (a.time_seconds !== b.time_seconds) return a.time_seconds - b.time_seconds;
        return a.clicks - b.clicks;
    });

    return ranked;
};

const formatClock = (totalSeconds) => {
    const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
    const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, '0');
    const seconds = String(safeSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
};

const calculateGamePoints = ({ mode, clicks, elapsedSeconds, chronoScore, knowledgeScore, won }) => {
    if (!won) {
        return 0;
    }
    if (mode === 'chrono') {
        return Math.max(0, Math.round(chronoScore));
    }
    if (mode === 'knowledge') {
        return Math.max(0, Math.round((knowledgeScore * 100) + 500 - (clicks * 50) - (elapsedSeconds / 4)));
    }
    return Math.max(0, Math.round(1000 - (clicks * 100) - (elapsedSeconds / 2)));
};

const MODE_LABELS = {
    normal: 'Normal',
    knowledge: 'Connaissance',
    chrono: 'Chrono',
    apercu: 'Apercu'
};

const toTimerStorageKey = (code) => `${TIMER_STORAGE_PREFIX}${String(code || '').trim().toUpperCase()}`;
const toStateStorageKey = (code) => `${STATE_STORAGE_PREFIX}${String(code || '').trim().toUpperCase()}`;

const sanitizeWikiHtml = (html) => DOMPurify.sanitize(String(html || ''), {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['audio', 'video', 'source'],
    ADD_ATTR: ['controls', 'poster', 'preload', 'srcset'],
    FORBID_TAGS: ['button', 'embed', 'form', 'iframe', 'input', 'object']
});

const readPersistedStartAt = (code) => {
    try {
        const key = toTimerStorageKey(code);
        const raw = localStorage.getItem(key);
        const value = Number(raw);
        if (Number.isFinite(value) && value > 0) {
            return value;
        }
    } catch {
        return null;
    }

    return null;
};

const persistStartAt = (code, timestamp) => {
    try {
        if (!code || !timestamp) {
            return;
        }

        localStorage.setItem(toTimerStorageKey(code), String(timestamp));
    } catch {
        // Ignore storage errors (private mode, quota exceeded, etc.).
    }
};

const readPersistedGameState = (code) => {
    try {
        const raw = localStorage.getItem(toStateStorageKey(code));
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
};

const persistGameState = (code, state) => {
    try {
        if (!code || !state) {
            return;
        }

        localStorage.setItem(toStateStorageKey(code), JSON.stringify(state));
    } catch {
        // Ignore storage errors (private mode, quota exceeded, etc.).
    }
};

const clearPersistedGameState = (code) => {
    try {
        localStorage.removeItem(toStateStorageKey(code));
        localStorage.removeItem(toTimerStorageKey(code));
    } catch {
        // Ignore storage errors.
    }
};

const extractTitleFromHref = (href) => {
    try {
        const url = new URL(href, 'https://fr.wikipedia.org/wiki/');
        const isLocalHost = url.hostname === window.location.hostname;
        const isFrWiki = url.hostname === 'fr.wikipedia.org';

        if (url.pathname === '/api/wiki/mobile-html') {
            const title = url.searchParams.get('title');
            if (title) {
                return decodeURIComponent(title).replace(/_/g, ' ').trim();
            }
        }

        if (isFrWiki && url.pathname.startsWith('/wiki/')) {
            return decodeURIComponent(url.pathname.slice('/wiki/'.length)).replace(/_/g, ' ').trim();
        }

        if (isFrWiki && url.pathname === '/w/index.php') {
            const title = url.searchParams.get('title');
            if (title) {
                return decodeURIComponent(title).replace(/_/g, ' ').trim();
            }
        }

        // Accepte les chemins /wiki/... seulement s'ils sont locaux (liens relatifs restants).
        if (isLocalHost && url.pathname.startsWith('/wiki/')) {
            return decodeURIComponent(url.pathname.slice('/wiki/'.length)).replace(/_/g, ' ').trim();
        }
    } catch {
        return '';
    }

    return '';
};

const extractRenderableHtml = (rawHtml) => {
    const html = String(rawHtml || '').replace(/pcs\.c1\.Page\.onBodyStart\(\);/g, '');

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const articleRoot = doc.querySelector('.mw-parser-output') || doc.body;

        if (!articleRoot) {
            return html;
        }

        const toAbsoluteUrl = (value) => {
            const raw = String(value || '').trim();
            if (!raw) {
                return '';
            }

            try {
                return new URL(raw, 'https://fr.wikipedia.org').toString();
            } catch {
                return raw;
            }
        };

        const unwrapCollapseContainer = (container) => {
            const content = container.querySelector('.pcs-collapse-table-content');
            if (!content) {
                container.remove();
                return;
            }

            content.style.display = 'block';

            const wrapper = doc.createElement('div');
            wrapper.className = 'wiki-collapse-unwrapped';

            while (content.firstChild) {
                wrapper.appendChild(content.firstChild);
            }

            container.replaceWith(wrapper);
        };

        const normalizeMediaElement = (element) => {
            const tagName = element.tagName.toLowerCase();
            const clone = tagName === 'span' ? doc.createElement('img') : element;

            const src = element.getAttribute('data-src') || element.getAttribute('src') || '';
            const srcset = element.getAttribute('data-srcset') || element.getAttribute('srcset') || '';
            const poster = element.getAttribute('data-poster') || element.getAttribute('poster') || '';
            const alt = element.getAttribute('data-alt') || element.getAttribute('alt') || '';
            const width = element.getAttribute('data-width') || element.getAttribute('width') || '';
            const height = element.getAttribute('data-height') || element.getAttribute('height') || '';
            const className = element.getAttribute('class') || '';

            if (tagName === 'span') {
                clone.className = className.replace('pcs-lazy-load-placeholder', '').trim() || 'mw-file-element';
                clone.setAttribute('decoding', element.getAttribute('data-decoding') || element.getAttribute('decoding') || 'async');
                clone.setAttribute('loading', element.getAttribute('loading') || 'lazy');
                clone.setAttribute('referrerpolicy', 'no-referrer');
            }

            if (src) {
                clone.setAttribute('src', toAbsoluteUrl(src));
            }

            if (srcset) {
                clone.setAttribute('srcset', srcset.replace(/(https?:)?\/\//g, 'https://'));
            }

            if (poster && (tagName === 'video' || tagName === 'audio')) {
                clone.setAttribute('poster', toAbsoluteUrl(poster));
            }

            if (alt && tagName !== 'audio' && tagName !== 'video' && tagName !== 'source') {
                clone.setAttribute('alt', alt);
            }

            if (width) {
                clone.setAttribute('width', width);
            }

            if (height) {
                clone.setAttribute('height', height);
            }

            if (tagName === 'audio' || tagName === 'video' || tagName === 'source') {
                clone.setAttribute('controls', element.getAttribute('controls') || 'controls');
                clone.setAttribute('preload', element.getAttribute('preload') || 'metadata');
            }

            return clone;
        };

        articleRoot.querySelectorAll('.pcs-collapse-table-container').forEach(unwrapCollapseContainer);

        articleRoot.querySelectorAll('.pcs-collapse-table-collapse-text, .pcs-collapse-table-aria, .pcs-edit-section-header, .pcs-edit-section-link-container, .pcs-edit-section-link, .pcs-header-inner-left, .pcs-header-inner-right').forEach((element) => {
            element.remove();
        });

        articleRoot.querySelectorAll('script, style, noscript').forEach((element) => {
            element.remove();
        });

        articleRoot.querySelectorAll('[hidden]').forEach((element) => {
            element.removeAttribute('hidden');
        });

        articleRoot.querySelectorAll('[style]').forEach((element) => {
            const style = element.getAttribute('style') || '';
            if (/display\s*:\s*none/i.test(style)) {
                element.style.display = 'block';
            }

            if (/visibility\s*:\s*hidden/i.test(style)) {
                element.style.visibility = 'visible';
            }
        });

        articleRoot.querySelectorAll('span.pcs-lazy-load-placeholder, span[data-src], span[data-data-src], img[data-src], img[data-srcset], audio[data-src], video[data-src], source[data-src], source[data-srcset]').forEach((element) => {
            const normalized = normalizeMediaElement(element);
            if (normalized !== element) {
                element.replaceWith(normalized);
            }
        });

        articleRoot.querySelectorAll('img').forEach((img) => {
            const src = img.getAttribute('src');
            if (src) {
                img.setAttribute('src', toAbsoluteUrl(src));
            }

            const srcset = img.getAttribute('srcset');
            if (srcset) {
                img.setAttribute('srcset', srcset.replace(/(https?:)?\/\//g, 'https://'));
            }

            img.setAttribute('loading', 'lazy');
            img.setAttribute('decoding', img.getAttribute('decoding') || 'async');
            img.setAttribute('referrerpolicy', 'no-referrer');
        });

        articleRoot.querySelectorAll('audio, video').forEach((media) => {
            const src = media.getAttribute('src');
            if (src) {
                media.setAttribute('src', toAbsoluteUrl(src));
            }

            media.setAttribute('controls', media.getAttribute('controls') || 'controls');
            media.setAttribute('preload', media.getAttribute('preload') || 'metadata');
        });

        // Neutralise tous les liens qui ne pointent pas vers un article jouable.
        articleRoot.querySelectorAll('a').forEach((anchor) => {
            const href = anchor.getAttribute('href') || anchor.href || '';

            if (!href || href.startsWith('#')) {
                return;
            }

            const title = extractTitleFromHref(href);
            if (isLikelyPlayableWikiTitle(title)) {
                return;
            }

            const span = doc.createElement('span');
            while (anchor.firstChild) {
                span.appendChild(anchor.firstChild);
            }

            anchor.replaceWith(span);
        });

        const bodyHtml = articleRoot.innerHTML?.trim();

        if (bodyHtml) {
            return sanitizeWikiHtml(bodyHtml);
        }
    } catch {
        return sanitizeWikiHtml(html);
    }

    return sanitizeWikiHtml(html);
};

const extractSnippetFromHtml = (rawHtml) => {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(String(rawHtml || ''), 'text/html');
        const root = doc.querySelector('.mw-parser-output') || doc.body;
        const text = String(root?.textContent || '')
            .replace(/\s+/g, ' ')
            .trim();

        return text.slice(0, 260);
    } catch {
        return '';
    }
};

const buildPersistedGameState = ({
    gameCode,
    currentArticle,
    articleHistory,
    clicks,
    startedAt,
    elapsedSeconds,
    chronoRemainingSeconds,
    chronoScore,
    won,
    knowledgeQuiz,
    knowledgeQuizAnswers,
    knowledgeQuizSubmitted,
    visitedArticleDetails
}) => ({
    version: 1,
    gameCode,
    currentArticle,
    articleHistory,
    clicks,
    startedAt,
    elapsedSeconds,
    chronoRemainingSeconds,
    chronoScore,
    won,
    knowledgeQuiz,
    knowledgeQuizAnswers,
    knowledgeQuizSubmitted,
    visitedArticleDetails
});

function Game() {
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const contentRef = useRef(null);
    const requestIdRef = useRef(0);
    const articleCacheRef = useRef(new Map());
    const startedAtRef = useRef(null);
    const elapsedSecondsRef = useRef(0);
    const timerDisplayRef = useRef(null);
    const lastArticleRef = useRef('');
    const chronoScoreTickRef = useRef(0);
    const visitedArticleDetailsRef = useRef(new Map());
    const knowledgeQuizRequestedRef = useRef(false);
    const gameStateSnapshotRef = useRef(null);
    const gameReadyRef = useRef(false);
    const resultSubmittedRef = useRef(false);
    const initialLoadKeyRef = useRef('');
    const allowPageNavigationRef = useRef(false);
    const gameSocketRef = useRef(null);

    const [game, setGame] = useState(null);
    const [loadingGame, setLoadingGame] = useState(Boolean(searchParams.get('code') || searchParams.get('previewTitle')));
    const [loadingArticle, setLoadingArticle] = useState(false);
    const [error, setError] = useState(null);
    const [currentArticle, setCurrentArticle] = useState('');
    const [articleHistory, setArticleHistory] = useState([]);
    const [html, setHtml] = useState('');
    const [clicks, setClicks] = useState(0);
    const [won, setWon] = useState(false);
    const [startedAt, setStartedAt] = useState(null);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [chronoRemainingSeconds, setChronoRemainingSeconds] = useState(CHRONO_START_SECONDS);
    const [chronoScore, setChronoScore] = useState(CHRONO_START_SECONDS);
    const [knowledgeQuiz, setKnowledgeQuiz] = useState([]);
    const [knowledgeQuizLoading, setKnowledgeQuizLoading] = useState(false);
    const [knowledgeQuizError, setKnowledgeQuizError] = useState('');
    const [knowledgeQuizAnswers, setKnowledgeQuizAnswers] = useState({});
    const [knowledgeQuizSubmitted, setKnowledgeQuizSubmitted] = useState(false);
    const [knowledgeQuizAttempt, setKnowledgeQuizAttempt] = useState(0);
    const [participants, setParticipants] = useState([]);
    const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
    const [abandoned, setAbandoned] = useState(false);
    const [showResultModal, setShowResultModal] = useState(false);
    const [resultSaving, setResultSaving] = useState(false);
    const [resultSaved, setResultSaved] = useState(false);
    const [resultSaveError, setResultSaveError] = useState('');
    const [replaying, setReplaying] = useState(false);
    const [replayReadyCount, setReplayReadyCount] = useState(0);
    const [replayRequiredCount, setReplayRequiredCount] = useState(0);
    const [adminCheatActive, setAdminCheatActive] = useState(false);
    const [abandonQuizPrompt, setAbandonQuizPrompt] = useState(false);

    useEffect(() => {
        siteService
            .getState()
            .then((data) => {
                if (data?.state?.adminCheat) {
                    authService
                        .getProfile()
                        .then((profile) => {
                            if (profile?.user?.role === 'admin') {
                                setAdminCheatActive(true);
                            }
                        })
                        .catch(() => {});
                }
            })
            .catch(() => {});
    }, []);

    const gameCode = searchParams.get('code');
    const previewTitle = searchParams.get('previewTitle');
    const isPreviewMode = !gameCode && Boolean(previewTitle);
    const gameMode = String(game?.mode || '').trim().toLowerCase();
    const isChronoMode = gameMode === 'chrono';
    const isKnowledgeMode = gameMode === 'knowledge';
    const chronoDefeat = isChronoMode && !won && (chronoRemainingSeconds <= 0 || chronoScore <= 0);
    const canInteractWithArticle = !won && !chronoDefeat && !abandoned;

    const saveCurrentGameState = useCallback((snapshot) => {
        if (!gameCode) {
            return;
        }

        const nextSnapshot = buildPersistedGameState({
            gameCode,
            currentArticle: String(snapshot?.currentArticle || '').trim(),
            articleHistory: Array.isArray(snapshot?.articleHistory) ? snapshot.articleHistory : [],
            clicks: Number(snapshot?.clicks || 0),
            startedAt: Number(snapshot?.startedAt || 0),
            elapsedSeconds: Number(snapshot?.elapsedSeconds || 0),
            chronoRemainingSeconds: Number(snapshot?.chronoRemainingSeconds || CHRONO_START_SECONDS),
            chronoScore: Number(snapshot?.chronoScore || CHRONO_START_SECONDS),
            won: Boolean(snapshot?.won),
            knowledgeQuiz: Array.isArray(snapshot?.knowledgeQuiz) ? snapshot.knowledgeQuiz : [],
            knowledgeQuizAnswers: snapshot?.knowledgeQuizAnswers && typeof snapshot.knowledgeQuizAnswers === 'object' ? snapshot.knowledgeQuizAnswers : {},
            knowledgeQuizSubmitted: Boolean(snapshot?.knowledgeQuizSubmitted),
            visitedArticleDetails: Array.isArray(snapshot?.visitedArticleDetails) ? snapshot.visitedArticleDetails : []
        });

        gameStateSnapshotRef.current = nextSnapshot;
        persistGameState(gameCode, nextSnapshot);
    }, [gameCode]);

    const fetchArticlePayload = useCallback(async (title, wikiLanguage = 'fr') => {
        const normalizedTitle = String(title || '').trim();
        if (!isLikelyPlayableWikiTitle(normalizedTitle)) {
            throw new Error('Titre Wikipedia manquant');
        }

        if (!articleCacheRef.current.has(normalizedTitle)) {
            const promise = fetch(`/api/wiki/mobile-html?title=${encodeURIComponent(normalizedTitle)}&lang=${encodeURIComponent(wikiLanguage)}`)
                .then(async (response) => {
                    const data = await response.json();

                    if (!response.ok) {
                        throw new Error(data.error || 'Impossible de charger l’article Wikipedia');
                    }

                    return data;
                })
                .catch((error) => {
                    articleCacheRef.current.delete(normalizedTitle);
                    throw error;
                });

            articleCacheRef.current.set(normalizedTitle, promise);
        }

        return articleCacheRef.current.get(normalizedTitle);
    }, []);

    const loadArticle = useCallback(async (title, targetArticle, isInitial = false, options = {}) => {
        const { fromHistory = false, mode = '', restoreSnapshot = null, wikiLanguage = game?.wiki_lang || 'fr' } = options;
        const isChronoGame = String(mode || gameMode).trim().toLowerCase() === 'chrono';
        const requestId = ++requestIdRef.current;
        if (!isChronoGame) {
            setElapsedSeconds(elapsedSecondsRef.current);
        }
        setLoadingArticle(true);
        setError(null);

        try {
            const data = await fetchArticlePayload(title, wikiLanguage);

            if (requestId !== requestIdRef.current) {
                return;
            }

            const resolvedArticle = String(data.title || title).trim();
            const snippet = extractSnippetFromHtml(data.html || '');

            setHtml(extractRenderableHtml(data.html || ''));
            setCurrentArticle(resolvedArticle);

            if (contentRef.current) {
                contentRef.current.scrollTo({ top: 0, left: 0, behavior: 'auto' });
            }

            if (isInitial) {
                const restoredState = restoreSnapshot && typeof restoreSnapshot === 'object' ? restoreSnapshot : null;

                if (restoredState) {
                    const restoredHistory = Array.isArray(restoredState.articleHistory) && restoredState.articleHistory.length > 0
                        ? restoredState.articleHistory
                        : [resolvedArticle];

                    setClicks(Number.isFinite(Number(restoredState.clicks)) ? Number(restoredState.clicks) : 0);
                    setWon(Boolean(restoredState.won));
                    setArticleHistory(restoredHistory);
                    setChronoRemainingSeconds(Number.isFinite(Number(restoredState.chronoRemainingSeconds)) ? Number(restoredState.chronoRemainingSeconds) : CHRONO_START_SECONDS);
                    setChronoScore(Number.isFinite(Number(restoredState.chronoScore)) ? Number(restoredState.chronoScore) : CHRONO_START_SECONDS);
                    chronoScoreTickRef.current = 0;
                    setKnowledgeQuiz(Array.isArray(restoredState.knowledgeQuiz) ? restoredState.knowledgeQuiz : []);
                    setKnowledgeQuizError('');
                    setKnowledgeQuizAnswers(restoredState.knowledgeQuizAnswers && typeof restoredState.knowledgeQuizAnswers === 'object' ? restoredState.knowledgeQuizAnswers : {});
                    setKnowledgeQuizSubmitted(Boolean(restoredState.knowledgeQuizSubmitted));
                    knowledgeQuizRequestedRef.current = Array.isArray(restoredState.knowledgeQuiz) && restoredState.knowledgeQuiz.length > 0;
                    visitedArticleDetailsRef.current = new Map(Array.isArray(restoredState.visitedArticleDetails) ? restoredState.visitedArticleDetails : []);

                    if (visitedArticleDetailsRef.current.size === 0 && snippet) {
                        visitedArticleDetailsRef.current.set(normalizeArticle(resolvedArticle), {
                            title: resolvedArticle,
                            snippet
                        });
                    }

                    const restoredStartedAt = Number.isFinite(Number(restoredState.startedAt)) && Number(restoredState.startedAt) > 0
                        ? Number(restoredState.startedAt)
                        : Date.now();

                    startedAtRef.current = restoredStartedAt;
                    setStartedAt(restoredStartedAt);
                    const savedElapsedSeconds = Number.isFinite(Number(restoredState.elapsedSeconds))
                        ? Number(restoredState.elapsedSeconds)
                        : 0;
                    const restoredElapsedSeconds = restoredState.won
                        ? savedElapsedSeconds
                        : Math.max(savedElapsedSeconds, Math.floor((Date.now() - restoredStartedAt) / 1000));
                    elapsedSecondsRef.current = restoredElapsedSeconds;
                    setElapsedSeconds(restoredElapsedSeconds);
                } else {
                    setClicks(0);
                    setWon(false);
                    setArticleHistory([resolvedArticle]);
                    setChronoRemainingSeconds(CHRONO_START_SECONDS);
                    setChronoScore(CHRONO_START_SECONDS);
                    chronoScoreTickRef.current = 0;
                    setKnowledgeQuiz([]);
                    setKnowledgeQuizError('');
                    setKnowledgeQuizAnswers({});
                    setKnowledgeQuizSubmitted(false);
                    knowledgeQuizRequestedRef.current = false;
                    visitedArticleDetailsRef.current = new Map();

                    if (snippet) {
                        visitedArticleDetailsRef.current.set(normalizeArticle(resolvedArticle), {
                            title: resolvedArticle,
                            snippet
                        });
                    }

                    const persistedStart = readPersistedStartAt(gameCode);
                    const startTime = persistedStart || Date.now();
                    startedAtRef.current = startTime;
                    setStartedAt(startTime);

                    const initialElapsedSeconds = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
                    elapsedSecondsRef.current = initialElapsedSeconds;
                    setElapsedSeconds(initialElapsedSeconds);
                    persistStartAt(gameCode, startTime);
                }
            } else {
                if (lastArticleRef.current && normalizeArticle(lastArticleRef.current) !== normalizeArticle(resolvedArticle)) {
                    if (!fromHistory) {
                        setClicks((previous) => previous + 1);

                        if (isChronoGame) {
                            setChronoRemainingSeconds((previous) => previous + 5);
                            setChronoScore((previous) => Math.max(0, previous - 10));
                        }
                    }
                }

                if (!startedAtRef.current) {
                    const startTime = Date.now();
                    startedAtRef.current = startTime;
                    setStartedAt(startTime);
                    persistStartAt(gameCode, startTime);
                }

                if (!fromHistory) {
                    setArticleHistory((previous) => {
                        if (previous.length === 0) {
                            return [resolvedArticle];
                        }

                        const last = previous[previous.length - 1];
                        if (normalizeArticle(last) === normalizeArticle(resolvedArticle)) {
                            return previous;
                        }

                        return [...previous, resolvedArticle];
                    });
                }

                if (snippet) {
                    visitedArticleDetailsRef.current.set(normalizeArticle(resolvedArticle), {
                        title: resolvedArticle,
                        snippet
                    });
                }
            }

            const didCountAsMove = !restoreSnapshot
                && !fromHistory
                && Boolean(lastArticleRef.current)
                && normalizeArticle(lastArticleRef.current) !== normalizeArticle(resolvedArticle);

            const nextArticleHistory = restoreSnapshot
                ? (Array.isArray(restoreSnapshot.articleHistory) && restoreSnapshot.articleHistory.length > 0 ? restoreSnapshot.articleHistory : [resolvedArticle])
                : (isInitial
                    ? [resolvedArticle]
                    : (() => {
                        if (fromHistory) {
                            return articleHistory;
                        }

                        const last = articleHistory[articleHistory.length - 1];
                        if (!last || normalizeArticle(last) === normalizeArticle(resolvedArticle)) {
                            return articleHistory.length > 0 ? articleHistory : [resolvedArticle];
                        }

                        return [...articleHistory, resolvedArticle];
                    })());

            const nextClicks = restoreSnapshot
                ? (Number.isFinite(Number(restoreSnapshot.clicks)) ? Number(restoreSnapshot.clicks) : 0)
                : clicks + (didCountAsMove ? 1 : 0);

            const nextStartedAt = restoreSnapshot
                ? (Number.isFinite(Number(restoreSnapshot.startedAt)) && Number(restoreSnapshot.startedAt) > 0
                    ? Number(restoreSnapshot.startedAt)
                    : (startedAtRef.current || Date.now()))
                : (startedAtRef.current || Date.now());

            const nextElapsedSeconds = restoreSnapshot
                ? (Number.isFinite(Number(restoreSnapshot.elapsedSeconds)) ? Number(restoreSnapshot.elapsedSeconds) : 0)
                : elapsedSecondsRef.current;

            const nextChronoRemainingSeconds = restoreSnapshot
                ? (Number.isFinite(Number(restoreSnapshot.chronoRemainingSeconds)) ? Number(restoreSnapshot.chronoRemainingSeconds) : CHRONO_START_SECONDS)
                : chronoRemainingSeconds + (didCountAsMove && isChronoGame ? 5 : 0);

            const nextChronoScore = restoreSnapshot
                ? (Number.isFinite(Number(restoreSnapshot.chronoScore)) ? Number(restoreSnapshot.chronoScore) : CHRONO_START_SECONDS)
                : Math.max(0, chronoScore - (didCountAsMove && isChronoGame ? 10 : 0));

            const nextWon = restoreSnapshot ? Boolean(restoreSnapshot.won) : won;
            const nextKnowledgeQuiz = restoreSnapshot && Array.isArray(restoreSnapshot.knowledgeQuiz) ? restoreSnapshot.knowledgeQuiz : knowledgeQuiz;
            const nextKnowledgeQuizAnswers = restoreSnapshot && restoreSnapshot.knowledgeQuizAnswers && typeof restoreSnapshot.knowledgeQuizAnswers === 'object'
                ? restoreSnapshot.knowledgeQuizAnswers
                : knowledgeQuizAnswers;
            const nextKnowledgeQuizSubmitted = restoreSnapshot ? Boolean(restoreSnapshot.knowledgeQuizSubmitted) : knowledgeQuizSubmitted;
            const nextVisitedArticleDetails = new Map(visitedArticleDetailsRef.current);

            saveCurrentGameState({
                currentArticle: resolvedArticle,
                articleHistory: nextArticleHistory,
                clicks: nextClicks,
                startedAt: nextStartedAt,
                elapsedSeconds: nextElapsedSeconds,
                chronoRemainingSeconds: nextChronoRemainingSeconds,
                chronoScore: nextChronoScore,
                won: nextWon || Boolean(targetArticle && normalizeArticle(resolvedArticle) === normalizeArticle(targetArticle)),
                knowledgeQuiz: nextKnowledgeQuiz,
                knowledgeQuizAnswers: nextKnowledgeQuizAnswers,
                knowledgeQuizSubmitted: nextKnowledgeQuizSubmitted,
                visitedArticleDetails: Array.from(nextVisitedArticleDetails.entries())
            });

            lastArticleRef.current = resolvedArticle;

            if (targetArticle && normalizeArticle(resolvedArticle) === normalizeArticle(targetArticle)) {
                const finalElapsedSeconds = startedAtRef.current
                    ? Math.max(elapsedSecondsRef.current, Math.floor((Date.now() - startedAtRef.current) / 1000))
                    : elapsedSecondsRef.current;
                elapsedSecondsRef.current = finalElapsedSeconds;
                setElapsedSeconds(finalElapsedSeconds);
                setWon(true);
            }
        } catch (err) {
            if (requestId === requestIdRef.current) {
                setError(err.message || 'Impossible de charger l’article Wikipedia');
            }
        } finally {
            if (requestId === requestIdRef.current) {
                setLoadingArticle(false);
            }
        }
    }, [articleHistory, chronoRemainingSeconds, chronoScore, clicks, fetchArticlePayload, game?.wiki_lang, gameCode, gameMode, knowledgeQuiz, knowledgeQuizAnswers, knowledgeQuizSubmitted, saveCurrentGameState, won]);

    const loadInitialArticle = useEffectEvent((...args) => loadArticle(...args));

    useEffect(() => {
        if ((!won && !abandonQuizPrompt) || !isKnowledgeMode || !gameCode || isPreviewMode) {
            return;
        }

        if (knowledgeQuizRequestedRef.current) {
            return;
        }

        knowledgeQuizRequestedRef.current = true;

        setKnowledgeQuizLoading(true);
        setKnowledgeQuizError('');

        const visitedArticlesPayload = articleHistory
            .map((title) => {
                const key = normalizeArticle(title);
                const details = visitedArticleDetailsRef.current.get(key);

                return {
                    title: details?.title || title,
                    snippet: details?.snippet || ''
                };
            })
            .filter((item) => String(item.title || '').trim());

        gameService
            .generateKnowledgeQuiz(gameCode, { visitedArticles: visitedArticlesPayload })
            .then((data) => {
                const questions = Array.isArray(data?.quiz?.questions) ? data.quiz.questions : [];
                setKnowledgeQuiz(questions);
                setKnowledgeQuizAnswers({});
                setKnowledgeQuizSubmitted(false);

                if (!questions.length) {
                    setKnowledgeQuizError('Quiz non disponible pour cette partie.');
                }
            })
            .catch((err) => {
                if (Number(err?.status) === 429) {
                    setKnowledgeQuizError('Quota IA atteint temporairement. Reessaie dans quelques instants.');
                    return;
                }

                setKnowledgeQuizError(err?.message || 'Impossible de generer le quiz.');
            })
            .finally(() => {
                setKnowledgeQuizLoading(false);
            });
    }, [
        articleHistory,
        clicks,
        gameCode,
        isKnowledgeMode,
        isPreviewMode,
        knowledgeQuizAttempt,
        won
    ]);

    useEffect(() => {
        if (!gameCode) {
            return;
        }

        const loadKey = `game:${gameCode}`;
        if (initialLoadKeyRef.current === loadKey) {
            return;
        }
        initialLoadKeyRef.current = loadKey;

        gameService
            .getByCode(gameCode)
            .then(async (data) => {
                gameReadyRef.current = false;
                setGame(data.game);
                const persistedState = readPersistedGameState(gameCode);

                if (persistedState?.currentArticle && Array.isArray(persistedState.articleHistory) && persistedState.articleHistory.length > 0) {
                    await loadInitialArticle(persistedState.currentArticle, data.game.target_article, true, {
                        mode: data.game.mode,
                        wikiLanguage: data.game.wiki_lang,
                        restoreSnapshot: persistedState
                    });
                    gameReadyRef.current = true;
                    return;
                }

                await loadInitialArticle(data.game.start_article, data.game.target_article, true, { mode: data.game.mode, wikiLanguage: data.game.wiki_lang });
                gameReadyRef.current = true;
            })
            .catch((err) => {
                setError(err.message || 'Impossible de charger la partie');
            })
            .finally(() => {
                setLoadingGame(false);
            });
    }, [gameCode]);

    useEffect(() => {
        if (gameCode || !previewTitle) {
            return;
        }

        const loadKey = `preview:${previewTitle}`;
        if (initialLoadKeyRef.current === loadKey) {
            return;
        }
        initialLoadKeyRef.current = loadKey;

        const initialTitle = decodeURIComponent(String(previewTitle || '')).replace(/_/g, ' ').trim();
        if (!isLikelyPlayableWikiTitle(initialTitle)) {
            setError('Titre de previsualisation invalide');
            setLoadingGame(false);
            return;
        }

        const previewGame = {
            mode: 'Apercu',
            start_article: initialTitle,
            target_article: initialTitle
        };

        setGame(previewGame);
        gameReadyRef.current = false;
        loadInitialArticle(initialTitle, initialTitle, true, { mode: previewGame.mode })
            .catch((err) => {
                setError(err.message || 'Impossible de charger la previsualisation');
                setError('Impossible de charger la previsualisation');
            })
            .finally(() => {
                gameReadyRef.current = true;
                setLoadingGame(false);
            });
    }, [gameCode, previewTitle]);

    useEffect(() => {
        if (!gameCode || isPreviewMode) {
            return undefined;
        }

        const token = localStorage.getItem('token');
        const socketUrl = import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin;
        const socket = io(socketUrl, {
            auth: { token },
            transports: import.meta.env.DEV ? ['polling'] : ['websocket', 'polling']
        });
        gameSocketRef.current = socket;

        socket.on('game:participants', ({ code, participants: nextParticipants }) => {
            if (String(code || '').toUpperCase() === String(gameCode).toUpperCase()) {
                setParticipants(Array.isArray(nextParticipants) ? nextParticipants : []);
            }
        });
        socket.on('game:replay-status', ({ code, readyCount, requiredCount }) => {
            if (String(code || '').toUpperCase() !== String(gameCode).toUpperCase()) {
                return;
            }
            setReplayReadyCount(Number(readyCount) || 0);
            setReplayRequiredCount(Number(requiredCount) || 0);
        });
        socket.on('game:replay-started', ({ game: nextGame }) => {
            if (!nextGame?.code) {
                return;
            }
            allowPageNavigationRef.current = true;
            clearPersistedGameState(gameCode);
            window.location.assign(`/game?code=${encodeURIComponent(nextGame.code)}`);
        });
        socket.on('game:replay-error', ({ error: replayError }) => {
            setResultSaveError(replayError || 'Impossible de relancer une partie.');
            setReplaying(false);
        });
        socket.emit('game:join', gameCode);

        return () => {
            socket.emit('game:leave', gameCode);
            socket.disconnect();
            gameSocketRef.current = null;
        };
    }, [gameCode, isPreviewMode, navigate]);

    const knowledgeResultReady = isKnowledgeMode
        && (won || abandoned)
        && knowledgeQuizSubmitted;
    const resultReady = (abandoned && (!isKnowledgeMode || !abandonQuizPrompt || knowledgeQuizSubmitted))
        || chronoDefeat
        || (won && !isKnowledgeMode)
        || knowledgeResultReady;

    // La modale précède la sortie et la sauvegarde termine avant d'activer le bouton Quitter.
    useEffect(() => {
        if (!resultReady) {
            return;
        }

        setShowResultModal(true);
    }, [resultReady]);

    const saveFinalResult = useCallback(async () => {
        if (!game || !gameCode || isPreviewMode || resultSubmittedRef.current) {
            return;
        }

        resultSubmittedRef.current = true;
        setResultSaving(true);
        setResultSaveError('');

        try {
            const finalKnowledgeScore = isKnowledgeMode && knowledgeQuizSubmitted
                ? knowledgeQuiz.reduce((total, item, index) => {
                    return total + (knowledgeQuizAnswers[index] === item.answerIndex ? 1 : 0);
                }, 0)
                : 0;
            const finalWon = Boolean(won && !abandoned);
            await gameService.submitResult(gameCode, {
                clicks,
                time_seconds: elapsedSecondsRef.current,
                score: calculateGamePoints({
                    mode: gameMode,
                    clicks,
                    elapsedSeconds: elapsedSecondsRef.current,
                    chronoScore,
                    knowledgeScore: finalKnowledgeScore,
                    won: finalWon
                }),
                won: finalWon
            });

            if (isKnowledgeMode && knowledgeQuizSubmitted) {
                await gameService.updateKnowledgeScore(gameCode, finalKnowledgeScore);
            }
            setResultSaved(true);
        } catch (saveError) {
            resultSubmittedRef.current = false;
            setResultSaveError(saveError?.message || 'Impossible d’enregistrer le résultat.');
        } finally {
            setResultSaving(false);
        }
    }, [abandoned, chronoScore, clicks, game, gameCode, gameMode, isKnowledgeMode, isPreviewMode, knowledgeQuiz, knowledgeQuizAnswers, knowledgeQuizSubmitted, won]);

    useEffect(() => {
        if (!resultReady) {
            return;
        }

        saveFinalResult();
    }, [resultReady, saveFinalResult]);

    useEffect(() => {
        if (!startedAt || won || chronoDefeat || abandoned) {
            return undefined;
        }

        const intervalId = setInterval(() => {
            const nextElapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
            elapsedSecondsRef.current = nextElapsedSeconds;

            if (isChronoMode) {
                setElapsedSeconds(nextElapsedSeconds);
                setChronoRemainingSeconds((previous) => Math.max(0, previous - 1));

                chronoScoreTickRef.current += 1;
                if (chronoScoreTickRef.current >= CHRONO_SCORE_DECAY_INTERVAL_SECONDS) {
                    chronoScoreTickRef.current = 0;
                    setChronoScore((previous) => Math.max(0, previous - 1));
                }
            } else if (timerDisplayRef.current) {
                timerDisplayRef.current.textContent = formatClock(nextElapsedSeconds);
            }
        }, 1000);

        return () => clearInterval(intervalId);
    }, [startedAt, won, isChronoMode, chronoDefeat, abandoned]);

    useEffect(() => {
        if (!gameCode || !game) {
            return;
        }

        if (!gameReadyRef.current) {
            return;
        }

        const snapshot = buildPersistedGameState({
            gameCode,
            currentArticle,
            articleHistory,
            clicks,
            startedAt,
            elapsedSeconds: elapsedSecondsRef.current,
            chronoRemainingSeconds,
            chronoScore,
            won,
            knowledgeQuiz,
            knowledgeQuizAnswers,
            knowledgeQuizSubmitted,
            visitedArticleDetails: Array.from(visitedArticleDetailsRef.current.entries())
        });

        gameStateSnapshotRef.current = snapshot;
        persistGameState(gameCode, snapshot);
    }, [
        articleHistory,
        clicks,
        currentArticle,
        game,
        gameCode,
        knowledgeQuiz,
        knowledgeQuizAnswers,
        knowledgeQuizSubmitted,
        won,
        chronoRemainingSeconds,
        chronoScore,
        startedAt
    ]);

    useEffect(() => {
        const handleKeyDown = (event) => {
            const isFindShortcut = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && String(event.key || '').toLowerCase() === 'f';

            if (!isFindShortcut) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, []);

    useEffect(() => {
        if (!gameCode || isPreviewMode) {
            return undefined;
        }

        window.history.pushState({ wikisguessrGameGuard: true }, '', window.location.href);
        const handleBrowserBack = () => {
            if (allowPageNavigationRef.current) {
                return;
            }
            window.history.pushState({ wikisguessrGameGuard: true }, '', window.location.href);
            if (resultReady) {
                setShowResultModal(true);
            } else {
                setShowAbandonConfirm(true);
            }
        };

        window.addEventListener('popstate', handleBrowserBack);
        return () => window.removeEventListener('popstate', handleBrowserBack);
    }, [gameCode, isPreviewMode, resultReady]);

    const handleContentClick = (event) => {
        const anchor = event.target.closest('a');
        if (!anchor) {
            return;
        }

        if (event.target.closest('img, picture, figure')) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        if (!canInteractWithArticle) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        const href = anchor.getAttribute('href') || anchor.href || '';
        if (href.startsWith('#')) {
            return;
        }

        const article = extractTitleFromHref(href);
        if (!article) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        loadArticle(article, game?.target_article || '', false, { mode: game?.mode, wikiLanguage: game?.wiki_lang });
    };

    const handleQuitGame = () => {
        if (isPreviewMode) {
            navigate('/admin/articles');
            return;
        }

        if (resultReady) {
            setShowResultModal(true);
            return;
        }

        setShowAbandonConfirm(true);
    };

    const handleConfirmAbandon = () => {
        elapsedSecondsRef.current = startedAtRef.current
            ? Math.max(elapsedSecondsRef.current, Math.floor((Date.now() - startedAtRef.current) / 1000))
            : elapsedSecondsRef.current;
        setElapsedSeconds(elapsedSecondsRef.current);
        setShowAbandonConfirm(false);

        // Si on est en mode connaissance et qu'on n'a pas encore fait le quiz,
        // on propose d'abord le quiz d'abandon pour marquer des points sur les articles découverts !
        if (isKnowledgeMode && !won && !knowledgeQuizSubmitted && !abandonQuizPrompt) {
            setAbandonQuizPrompt(true);
            return;
        }

        setAbandoned(true);
    };

    const handleFinalizeQuit = () => {
        if (!resultSaved) {
            return;
        }
        allowPageNavigationRef.current = true;
        clearPersistedGameState(gameCode);
        navigate('/lobby');
    };

    const handleReplay = async () => {
        if (!resultSaved || replaying) {
            return;
        }
        setReplaying(true);
        setResultSaveError('');
        if (game?.room_id) {
            gameSocketRef.current?.emit('game:replay-ready', gameCode);
            return;
        }
        try {
            const response = await gameService.create({ mode: gameMode, solo: true, wikiLanguage: game?.wiki_lang });
            allowPageNavigationRef.current = true;
            clearPersistedGameState(gameCode);
            window.location.assign(`/game?code=${encodeURIComponent(response.game.code)}`);
        } catch (replayError) {
            setResultSaveError(replayError?.message || 'Impossible de relancer une partie.');
            setReplaying(false);
        }
    };

    const handleSelectKnowledgeAnswer = (questionIndex, answerIndex) => {
        if (knowledgeQuizSubmitted) {
            return;
        }

        setKnowledgeQuizAnswers((previous) => ({
            ...previous,
            [questionIndex]: answerIndex
        }));
    };

    const handleSubmitKnowledgeQuiz = () => {
        setKnowledgeQuizSubmitted(true);
        if (abandonQuizPrompt) {
            setAbandoned(true);
        }
    };

    const handleRetryKnowledgeQuiz = () => {
        knowledgeQuizRequestedRef.current = false;
        setKnowledgeQuizError('');
        setKnowledgeQuizAttempt((attempt) => attempt + 1);
    };

    const handleGoBack = async () => {
        if (articleHistory.length < 2 || loadingArticle || !canInteractWithArticle) {
            return;
        }

        const previousArticle = articleHistory[articleHistory.length - 2];
        setArticleHistory((previous) => previous.slice(0, -1));
        await loadArticle(previousArticle, game?.target_article || '', false, { fromHistory: true, mode: game?.mode, wikiLanguage: game?.wiki_lang });
    };

    if (loadingGame) {
        return <div className="game-loading"><Compass className="game-loading-icon" size={44} /><strong>{t('game.preparing')}</strong><span>{t('game.opening')}</span></div>;
    }

    if (!gameCode && !isPreviewMode) {
        return (
            <div className="p-6">
                <p className="text-red-600">{t('game.missing_code')}</p>
                <button
                    type="button"
                    className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-white"
                    onClick={() => navigate('/lobby')}
                >
                    {t('game.back_lobby')}
                </button>
            </div>
        );
    }

    if (!game) {
        return (
            <div className="p-6">
                <p className="text-red-600">{error || t('game.not_found')}</p>
                <button
                    type="button"
                    className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-white"
                    onClick={() => navigate('/lobby')}
                >
                    {t('game.back_lobby')}
                </button>
            </div>
        );
    }

    const displayedSeconds = isChronoMode ? chronoRemainingSeconds : elapsedSeconds;
    const displayedTime = formatClock(displayedSeconds);
    const isOnStartArticle = normalizeArticle(currentArticle) === normalizeArticle(game.start_article);
    const currentArticleLabel = isOnStartArticle ? t('game.start') : (currentArticle || '...');
    const modeLabel = t(`common.${gameMode}`, { defaultValue: MODE_LABELS[gameMode] || game.mode });
    const knowledgeAnsweredCount = Object.keys(knowledgeQuizAnswers).length;
    const knowledgeAllAnswered = knowledgeQuiz.length > 0 && knowledgeAnsweredCount === knowledgeQuiz.length;
    const knowledgeScore = knowledgeQuiz.reduce((total, item, index) => {
        const selected = knowledgeQuizAnswers[index];
        return total + (selected === item.answerIndex ? 1 : 0);
    }, 0);
    const finalPoints = calculateGamePoints({
        mode: gameMode,
        clicks,
        elapsedSeconds: elapsedSecondsRef.current,
        chronoScore,
        knowledgeScore,
        won: Boolean(won && !abandoned) || (isKnowledgeMode && knowledgeQuizSubmitted)
    });
    const finalLeaderboard = useMemo(() => {
        if (!showResultModal) return [];
        return computeFinalLeaderboard(participants, {
            user_id: 'current_user',
            username: 'Vous',
            score: finalPoints,
            clicks,
            time_seconds: elapsedSecondsRef.current,
            won: Boolean(won && !abandoned) || (isKnowledgeMode && knowledgeQuizSubmitted),
            status: abandoned ? 'abandoned' : chronoDefeat ? 'timeout' : (won ? 'finished' : 'defeat')
        }, gameMode);
    }, [showResultModal, participants, finalPoints, clicks, won, abandoned, chronoDefeat, isKnowledgeMode, knowledgeQuizSubmitted, gameMode]);
    const resultTitle = abandoned
        ? t('game.result_abandoned_title', { defaultValue: 'Partie interrompue' })
        : chronoDefeat
            ? t('game.result_defeat_title', { defaultValue: 'Temps écoulé' })
            : finalPoints < 300
                ? t('game.result_low_title', { defaultValue: 'Objectif atteint' })
                : finalPoints < 700
                    ? t('game.result_good_title', { defaultValue: 'Bon parcours' })
                    : t('game.result_great_title', { defaultValue: 'Excellent parcours !' });

    return (
        <div className="game-shell flex h-screen flex-col text-slate-900">
            <div className="game-toolbar px-3 py-2">
                <div className="mx-auto grid max-w-6xl grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    {/* Gauche : Mode + Départ + Cible */}
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                        <span className="rounded-full bg-slate-900 px-2.5 py-1 font-semibold text-white shadow-sm">{modeLabel}</span>
                        <span className="inline-flex min-w-0 max-w-[44vw] sm:max-w-56 lg:max-w-64 items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-cyan-800 shadow-sm">
                            <span className="shrink-0">{t('game.start')}:</span>
                            <strong className="truncate font-semibold normal-case text-cyan-950" title={game?.start_article}>{game?.start_article}</strong>
                        </span>
                        <span className="inline-flex min-w-0 max-w-[44vw] sm:max-w-52 lg:max-w-60 items-center gap-1 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 text-fuchsia-800 shadow-sm">
                            <span className="shrink-0">{t('game.target')}:</span>
                            <strong className="truncate font-semibold normal-case text-fuchsia-950" title={game?.target_article}>{game?.target_article}</strong>
                        </span>
                        {adminCheatActive && game?.target_article && !won && (
                            <button
                                type="button"
                                onClick={() => {
                                    loadArticle(game.target_article, game.target_article, false, {
                                        mode: game?.mode,
                                        wikiLanguage: game?.wiki_lang
                                    });
                                }}
                                disabled={loadingArticle}
                                title="Arriver directement au lien wiki de fin (Triche Admin)"
                                className="inline-flex items-center gap-1.5 rounded-full border border-purple-400 bg-purple-600 px-3 py-1 text-[10px] font-bold tracking-wider text-white shadow-md transition hover:bg-purple-500 animate-pulse active:scale-95 disabled:opacity-50"
                            >
                                <span>⚡ Triche</span>
                            </button>
                        )}
                    </div>

                    {/* Droite : Article courant + Clics + Temps + Points + Boutons */}
                    <div className="flex min-w-0 flex-wrap items-center justify-start gap-1.5 sm:gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-500 lg:justify-end">
                        <span className="inline-flex min-w-0 max-w-[40vw] sm:max-w-48 lg:max-w-56 items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-800 shadow-sm">
                            <span className="shrink-0">{t('game.article')}:</span>
                            <strong className="truncate font-semibold normal-case text-blue-950" title={currentArticle || '...'}>{currentArticleLabel}</strong>
                        </span>
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800 shadow-sm whitespace-nowrap">
                            {t('game.clicks')}: <strong className="font-semibold text-amber-950">{clicks}</strong>
                        </span>
                        <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-violet-800 shadow-sm whitespace-nowrap">
                            {isChronoMode ? t('game.remaining_time') : t('game.time')}: <strong ref={timerDisplayRef} className="font-semibold text-violet-950">{displayedTime}</strong>
                        </span>
                        {isChronoMode && (
                            <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-800 shadow-sm whitespace-nowrap">
                                {t('game.points')}: <strong className="font-semibold text-rose-950">{chronoScore}</strong>
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={handleGoBack}
                            disabled={articleHistory.length < 2 || loadingArticle}
                            aria-label={t('game.back_article')}
                            title={t('game.back')}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm transition enabled:hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
                                <path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            onClick={handleQuitGame}
                            aria-label={t('game.quit_game')}
                            title={t('game.quit')}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-rose-700 shadow-sm transition hover:bg-rose-100 hover:text-rose-800"
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
                                <path d="M7 3h10a1 1 0 011 1v16a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" fill="none" stroke="currentColor" strokeWidth="1.8" />
                                <path d="M10 3v18" fill="none" stroke="currentColor" strokeWidth="1.8" />
                                <circle cx="13.5" cy="12" r="1" fill="currentColor" />
                            </svg>
                        </button>
                    </div>
                </div>

                {(() => {
                    const fullParticipants = ensureEightParticipantsWithBots(participants);
                    return (
                        <div className="game-participants mx-auto mt-2 flex max-w-6xl gap-2 overflow-x-auto pb-1" aria-label="Progression des 8 joueurs">
                            {fullParticipants.map((participant) => {
                                const avatarUrl = resolveMediaUrl(participant.avatar_url);
                                const finished = participant.progress_status === 'finished';
                                const isBotPlayer = Boolean(participant.isBot);
                                return (
                                    <div className={`game-participant${finished ? ' is-finished' : ''}${isBotPlayer ? ' is-bot opacity-90' : ''}`} key={participant.user_id}>
                                        <span className="game-participant-avatar">
                                            {avatarUrl ? <img src={avatarUrl} alt="" /> : String(participant.username || '?').slice(0, 1).toUpperCase()}
                                        </span>
                                        <span className="flex flex-col text-[10px] leading-tight">
                                            <strong className="truncate max-w-[80px]">{participant.username}</strong>
                                            <small className="text-slate-500">{isBotPlayer ? '🤖 Bot' : finished ? 'Terminé' : 'En cours'}</small>
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}

                {won && (
                    <div className="mx-auto mt-2 max-w-6xl rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                        {isChronoMode ? t('game.won_points', { points: chronoScore }) : t('game.won_time', { time: displayedTime })}
                    </div>
                )}

                {((won && isKnowledgeMode) || (abandonQuizPrompt && isKnowledgeMode && !abandoned)) && (
                    <div className="knowledge-quiz-card mx-auto mt-3 max-w-6xl shadow-xl">
                        {/* En-tête du Quiz */}
                        <div className="knowledge-quiz-header">
                            <div className="flex items-center gap-2">
                                <span className="text-base">📜</span>
                                <h3 className="knowledge-quiz-header-title text-sm sm:text-base">
                                    {abandonQuizPrompt ? "Quiz d'abandon — Connaissances acquises" : "Épreuve des Savoirs — Quiz Connaissance"}
                                </h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="rounded-full bg-black/30 border border-amber-500/40 px-2.5 py-0.5 text-xs text-amber-200 font-medium">
                                    {knowledgeAnsweredCount}/{knowledgeQuiz.length} répondues
                                </span>
                                {abandonQuizPrompt && !knowledgeQuizSubmitted && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setAbandoned(true);
                                            setAbandonQuizPrompt(false);
                                        }}
                                        className="rounded-full border border-red-400/60 bg-red-900/50 px-3 py-1 text-xs font-semibold text-red-200 hover:bg-red-800/80 transition"
                                    >
                                        Abandon direct sans quiz
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="p-4 sm:p-5 space-y-4">
                            {abandonQuizPrompt && (
                                <div className="rounded-lg border border-amber-800/30 bg-[#f4ebd9] p-3 text-xs text-[#4a3928] leading-relaxed">
                                    💡 <strong>Vous avez choisi d’abandonner l’exploration :</strong> répondez à ce quiz pour tester votre mémoire sur les articles visités et marquer des points bonus sur votre score final !
                                </div>
                            )}

                            {knowledgeQuizLoading ? (
                                <div className="py-8 text-center text-[#5a4635] flex flex-col items-center gap-2">
                                    <Compass className="animate-spin text-amber-700" size={32} />
                                    <p className="font-serif text-sm font-medium">{t('game.quiz_loading', { defaultValue: 'Génération du quiz depuis vos lectures Wikipedia…' })}</p>
                                </div>
                            ) : knowledgeQuizError ? (
                                <div className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-center text-sm text-rose-800 space-y-2">
                                    <p>{knowledgeQuizError}</p>
                                    <button
                                        type="button"
                                        className="rounded-full border border-rose-400 bg-white px-4 py-1.5 text-xs font-bold text-rose-900 hover:bg-rose-100"
                                        onClick={handleRetryKnowledgeQuiz}
                                    >
                                        {t('common.retry', { defaultValue: 'Réessayer la génération' })}
                                    </button>
                                </div>
                            ) : knowledgeQuiz.length > 0 ? (
                                <div className="space-y-4">
                                    {knowledgeQuiz.map((item, questionIndex) => {
                                        const selectedAnswer = knowledgeQuizAnswers[questionIndex];
                                        const isAnswered = Number.isInteger(selectedAnswer);

                                        return (
                                            <div key={`${questionIndex}-${item.question}`} className="knowledge-question-box">
                                                <div className="flex items-start gap-2.5 mb-3">
                                                    <span className="inline-flex shrink-0 items-center justify-center w-6 h-6 rounded-full bg-[#8b652b] text-white font-bold text-xs shadow-sm">
                                                        {questionIndex + 1}
                                                    </span>
                                                    <p className="knowledge-question-title">{item.question}</p>
                                                </div>

                                                <div className="grid gap-2.5 sm:grid-cols-2">
                                                    {item.choices.map((choice, choiceIndex) => {
                                                        const choiceLetters = ['A', 'B', 'C', 'D'];
                                                        const isSelected = selectedAnswer === choiceIndex;
                                                        const isRightChoice = item.answerIndex === choiceIndex;
                                                        const showCorrection = knowledgeQuizSubmitted;

                                                        let stateClass = '';
                                                        if (showCorrection) {
                                                            if (isRightChoice) {
                                                                stateClass = 'is-correct';
                                                            } else if (isSelected && !isRightChoice) {
                                                                stateClass = 'is-wrong';
                                                            }
                                                        } else if (isSelected) {
                                                            stateClass = 'is-selected';
                                                        }

                                                        return (
                                                            <button
                                                                key={`${questionIndex}-${choiceIndex}`}
                                                                type="button"
                                                                className={`knowledge-choice-btn ${stateClass}`}
                                                                onClick={() => handleSelectKnowledgeAnswer(questionIndex, choiceIndex)}
                                                                disabled={knowledgeQuizSubmitted}
                                                            >
                                                                <span className="knowledge-choice-letter">
                                                                    {choiceLetters[choiceIndex] || choiceIndex + 1}
                                                                </span>
                                                                <span className="flex-1">{choice}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>

                                                {knowledgeQuizSubmitted && (
                                                    <div className="mt-3 space-y-1.5">
                                                        <p className={`text-xs font-semibold ${isAnswered && selectedAnswer === item.answerIndex ? 'text-emerald-800' : 'text-rose-800'}`}>
                                                            {isAnswered && selectedAnswer === item.answerIndex
                                                                ? `✓ ${t('game.correct', { defaultValue: 'Excellente réponse !' })}`
                                                                : `✗ ${t('game.correct_answer', { answer: item.choices[item.answerIndex] })}`}
                                                        </p>
                                                        {item.sourceQuote && (
                                                            <div className="knowledge-quote-hint">
                                                                <p className="italic">
                                                                    « {item.sourceQuote} » {item.sourceTitle ? `— Extrait de l’article ${item.sourceTitle}` : ''}
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {/* Barre de validation du quiz */}
                                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#dccbb2]">
                                        <div className="flex items-center gap-2 text-sm text-[#493928]">
                                            <span className="font-semibold">{knowledgeAnsweredCount}/{knowledgeQuiz.length} questions répondues</span>
                                            {knowledgeQuizSubmitted && (
                                                <span className="rounded-full bg-emerald-800 text-white px-2.5 py-0.5 text-xs font-bold shadow-sm">
                                                    Score : {knowledgeScore}/{knowledgeQuiz.length} (+{knowledgeScore * 100} pts)
                                                </span>
                                            )}
                                        </div>

                                        {!knowledgeQuizSubmitted && (
                                            <button
                                                type="button"
                                                onClick={handleSubmitKnowledgeQuiz}
                                                disabled={!knowledgeAllAnswered || knowledgeQuizSubmitted}
                                                className="rounded-full bg-[#315d62] hover:bg-[#24474b] border border-[#1f3e42] px-6 py-2.5 text-sm font-bold text-white shadow-md transition disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                                            >
                                                {t('game.validate_quiz', { defaultValue: 'Valider mes réponses' })}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="py-4 text-center text-sm text-[#5a4635]">
                                    <p>{knowledgeQuizError || t('game.no_question', { defaultValue: 'Aucune question disponible.' })}</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {chronoDefeat && (
                    <div className="mx-auto mt-2 max-w-6xl rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
                        {t('game.chrono_defeat')}
                    </div>
                )}
            </div>

            <div className="game-reading-room min-h-0 flex-1 overflow-hidden">
                {error ? (
                    <div className="flex h-full items-center justify-center px-4">
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-6 py-5 text-center text-rose-800">
                            <p className="text-lg font-semibold uppercase tracking-[0.16em]">{t('game.error')}</p>
                            <p className="mt-2 text-sm">{error}</p>
                        </div>
                    </div>
                ) : loadingArticle && !html ? (
                    <div className="flex h-full items-center justify-center text-slate-600">{t('game.article_loading')}</div>
                ) : (
                    <div
                        ref={contentRef}
                        className="game-article-scroll h-full min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-4 touch-pan-y md:px-6 md:py-6"
                        onClick={handleContentClick}
                    >
                        <div
                            className="game-article-sheet wiki-mobile-html prose mx-auto w-full max-w-5xl prose-slate"
                            dangerouslySetInnerHTML={{ __html: html || `<p>${t('game.no_content')}</p>` }}
                        />
                    </div>
                )}
            </div>

            {showAbandonConfirm && (
                <div className="game-modal-backdrop" role="presentation">
                    <section className="game-modal" role="dialog" aria-modal="true" aria-labelledby="abandon-title">
                        <p className="game-modal-kicker">Partie en cours</p>
                        <h2 id="abandon-title">Abandonner la partie ?</h2>
                        <p>
                            {isKnowledgeMode
                                ? "En mode Connaissance, vous pourrez d'abord tester vos connaissances sur les articles explorés pour marquer des points !"
                                : "Votre progression actuelle sera enregistrée comme une partie abandonnée."}
                        </p>
                        <div className="game-modal-actions">
                            <button type="button" className="is-secondary" onClick={() => setShowAbandonConfirm(false)}>Continuer à jouer</button>
                            <button type="button" className="is-danger" onClick={handleConfirmAbandon}>
                                {isKnowledgeMode ? "Passer au quiz d'abandon" : "Abandonner"}
                            </button>
                        </div>
                    </section>
                </div>
            )}

            {showResultModal && (
                <div className="game-modal-backdrop" role="presentation">
                    <section className="game-modal game-result-modal" role="dialog" aria-modal="true" aria-labelledby="result-title">
                        <p className="game-modal-kicker">Résultat de la partie</p>
                        <h2 id="result-title">{resultTitle}</h2>
                        <p className="game-result-status">
                            {abandoned ? 'Partie abandonnée' : chronoDefeat ? 'Temps écoulé' : 'Objectif atteint !'}
                        </p>
                        <div className="game-result-stats">
                            <div><strong>{finalPoints}</strong><span>Points</span></div>
                            <div><strong>{clicks}</strong><span>Clics</span></div>
                            <div><strong>{formatClock(elapsedSecondsRef.current)}</strong><span>Temps</span></div>
                            {isKnowledgeMode && knowledgeQuizSubmitted && <div><strong>{knowledgeScore}/{knowledgeQuiz.length}</strong><span>Quiz</span></div>}
                        </div>

                        {/* Classement des 8 joueurs de la session */}
                        <div className="my-4 text-left">
                            <div className="mb-1.5 flex items-center justify-between">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1">
                                    <span>🏆</span>
                                    <span>Classement de la partie</span>
                                </p>
                                <span className="text-[10px] text-amber-800/80 font-medium">8 participants</span>
                            </div>
                            <div className="max-h-56 overflow-y-auto rounded-lg border border-amber-900/20 bg-white/70 shadow-inner">
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-[#ebe1cf] text-slate-800 border-b border-amber-900/20">
                                        <tr>
                                            <th className="py-1 px-2 font-bold text-center w-8">#</th>
                                            <th className="py-1 px-2 font-bold text-left">Joueur</th>
                                            <th className="py-1 px-2 font-bold text-center">Score</th>
                                            <th className="py-1 px-2 font-bold text-center">Clics</th>
                                            <th className="py-1 px-2 font-bold text-center">Temps</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-amber-900/10">
                                        {finalLeaderboard.map((player, idx) => {
                                            const rankIcon = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
                                            return (
                                                <tr
                                                    key={player.user_id || idx}
                                                    className={`transition ${player.isCurrent ? 'bg-amber-200/80 font-semibold text-amber-950' : 'text-slate-800 hover:bg-black/5'}`}
                                                >
                                                    <td className="py-1.5 px-2 text-center font-bold">{rankIcon}</td>
                                                    <td className="py-1.5 px-2">
                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                            <span className="w-5 h-5 rounded-full overflow-hidden shrink-0 bg-slate-700 text-[10px] flex items-center justify-center text-white font-bold">
                                                                {player.avatar_url ? <img src={resolveMediaUrl(player.avatar_url)} alt="" className="w-full h-full object-cover" /> : String(player.username || '?').slice(0, 1).toUpperCase()}
                                                            </span>
                                                            <span className="truncate max-w-[100px]">{player.username}</span>
                                                            {player.isCurrent && (
                                                                <span className="rounded bg-amber-800 text-white px-1 py-0.2 text-[9px] uppercase font-bold tracking-wider shrink-0">Vous</span>
                                                            )}
                                                            {player.isBot && !player.isCurrent && (
                                                                <span className="text-[10px] opacity-60 shrink-0" title="Bot">🤖</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="py-1.5 px-2 text-center font-bold text-amber-900">{player.score} pts</td>
                                                    <td className="py-1.5 px-2 text-center">{player.clicks}</td>
                                                    <td className="py-1.5 px-2 text-center font-mono text-[11px]">{formatClock(player.time_seconds)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {resultSaveError && <p className="game-result-error">{resultSaveError}</p>}
                        <div className="game-modal-actions">
                            {resultSaveError && (
                                <button type="button" className="is-secondary" onClick={saveFinalResult} disabled={resultSaving}>Réessayer</button>
                            )}
                            <button type="button" className="is-secondary" onClick={handleReplay} disabled={!resultSaved || resultSaving || replaying}>
                                {replaying && game?.room_id
                                    ? `En attente du groupe (${replayReadyCount}/${replayRequiredCount || participants.length})`
                                    : replaying ? 'Relance…' : 'Rejouer'}
                            </button>
                            <button type="button" onClick={handleFinalizeQuit} disabled={!resultSaved || resultSaving || replaying}>
                                {resultSaving ? 'Enregistrement…' : resultSaved ? 'Quitter la partie' : 'Préparation…'}
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}

export default Game;
