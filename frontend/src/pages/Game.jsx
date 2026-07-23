import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { gameService } from '../services/api.js';

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

const MODE_LABELS = {
    normal: 'Normal',
    knowledge: 'Connaissance',
    chrono: 'Chrono',
    apercu: 'Apercu'
};

const toTimerStorageKey = (code) => `${TIMER_STORAGE_PREFIX}${String(code || '').trim().toUpperCase()}`;
const toStateStorageKey = (code) => `${STATE_STORAGE_PREFIX}${String(code || '').trim().toUpperCase()}`;

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
        const url = new URL(href, window.location.origin);
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

            img.setAttribute('loading', img.getAttribute('loading') || 'eager');
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
            return bodyHtml;
        }
    } catch {
        return html;
    }

    return html;
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
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const contentRef = useRef(null);
    const requestIdRef = useRef(0);
    const articleCacheRef = useRef(new Map());
    const startedAtRef = useRef(null);
    const lastArticleRef = useRef('');
    const chronoScoreTickRef = useRef(0);
    const visitedArticleDetailsRef = useRef(new Map());
    const knowledgeQuizRequestedRef = useRef(false);
    const gameStateSnapshotRef = useRef(null);
    const gameReadyRef = useRef(false);
    const resultSubmittedRef = useRef(false);

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

    const gameCode = searchParams.get('code');
    const previewTitle = searchParams.get('previewTitle');
    const isPreviewMode = !gameCode && Boolean(previewTitle);
    const gameMode = String(game?.mode || '').trim().toLowerCase();
    const isChronoMode = gameMode === 'chrono';
    const isKnowledgeMode = gameMode === 'knowledge';
    const chronoDefeat = isChronoMode && !won && (chronoRemainingSeconds <= 0 || chronoScore <= 0);
    const canInteractWithArticle = !won && !chronoDefeat;

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

    const fetchArticlePayload = useCallback(async (title) => {
        const normalizedTitle = String(title || '').trim();
        if (!isLikelyPlayableWikiTitle(normalizedTitle)) {
            throw new Error('Titre Wikipedia manquant');
        }

        if (!articleCacheRef.current.has(normalizedTitle)) {
            const promise = fetch(`/api/wiki/mobile-html?title=${encodeURIComponent(normalizedTitle)}`)
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
        const { fromHistory = false, mode = '', restoreSnapshot = null } = options;
        const isChronoGame = String(mode || gameMode).trim().toLowerCase() === 'chrono';
        const requestId = ++requestIdRef.current;
        setLoadingArticle(true);
        setError(null);

        try {
            const data = await fetchArticlePayload(title);

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
                    setElapsedSeconds(Number.isFinite(Number(restoredState.elapsedSeconds))
                        ? Number(restoredState.elapsedSeconds)
                        : Math.max(0, Math.floor((Date.now() - restoredStartedAt) / 1000)));
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

                    setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
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
                : elapsedSeconds;

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
    }, [articleHistory, chronoRemainingSeconds, chronoScore, clicks, elapsedSeconds, fetchArticlePayload, gameCode, gameMode, knowledgeQuiz, knowledgeQuizAnswers, knowledgeQuizSubmitted, saveCurrentGameState, won]);

    useEffect(() => {
        if (!won || !isKnowledgeMode || !gameCode || isPreviewMode) {
            return;
        }

        if (knowledgeQuizRequestedRef.current) {
            return;
        }

        knowledgeQuizRequestedRef.current = true;

        if (!resultSubmittedRef.current) {
            resultSubmittedRef.current = true;
            gameService.submitResult(gameCode, {
                clicks,
                time_seconds: elapsedSeconds,
                score: 0,
                won: true
            }).catch(() => { });
        }

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
        elapsedSeconds,
        gameCode,
        isKnowledgeMode,
        isPreviewMode,
        won
    ]);

    useEffect(() => {
        if (!gameCode) {
            return;
        }

        gameService
            .getByCode(gameCode)
            .then(async (data) => {
                gameReadyRef.current = false;
                setGame(data.game);
                const persistedState = readPersistedGameState(gameCode);

                if (persistedState?.currentArticle && Array.isArray(persistedState.articleHistory) && persistedState.articleHistory.length > 0) {
                    await loadArticle(persistedState.currentArticle, data.game.target_article, true, {
                        mode: data.game.mode,
                        restoreSnapshot: persistedState
                    });
                    gameReadyRef.current = true;
                    return;
                }

                await loadArticle(data.game.start_article, data.game.target_article, true, { mode: data.game.mode });
                gameReadyRef.current = true;
            })
            .catch((err) => {
                setError(err.message || 'Impossible de charger la partie');
            })
            .finally(() => {
                setLoadingGame(false);
            });
    }, [gameCode, loadArticle]);

    useEffect(() => {
        if (gameCode || !previewTitle) {
            return;
        }

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
        loadArticle(initialTitle, initialTitle, true, { mode: previewGame.mode })
            .catch((err) => {
                setError(err.message || 'Impossible de charger la previsualisation');
            })
            .finally(() => {
                gameReadyRef.current = true;
                setLoadingGame(false);
            });
    }, [gameCode, previewTitle, loadArticle]);

    // Soumission du résultat pour les modes non-knowledge (normal + chrono win/defeat)
    useEffect(() => {
        if (!game || !gameCode || isPreviewMode || isKnowledgeMode) {
            return;
        }

        const isTerminal = won || chronoDefeat;
        if (!isTerminal || resultSubmittedRef.current) {
            return;
        }

        resultSubmittedRef.current = true;
        gameService.submitResult(gameCode, {
            clicks,
            time_seconds: elapsedSeconds,
            score: isChronoMode ? chronoScore : 0,
            won: Boolean(won)
        }).catch(() => { });
    }, [won, chronoDefeat, game, gameCode, isPreviewMode, isKnowledgeMode, isChronoMode, clicks, elapsedSeconds, chronoScore]);

    // Mise à jour du score knowledge quand le quiz est soumis
    useEffect(() => {
        if (!knowledgeQuizSubmitted || !gameCode || isPreviewMode || !isKnowledgeMode) {
            return;
        }

        const score = knowledgeQuiz.reduce((total, item, index) => {
            return total + (knowledgeQuizAnswers[index] === item.answerIndex ? 1 : 0);
        }, 0);

        gameService.updateKnowledgeScore(gameCode, score).catch(() => { });
    }, [knowledgeQuizSubmitted, gameCode, isPreviewMode, isKnowledgeMode, knowledgeQuiz, knowledgeQuizAnswers]);

    useEffect(() => {
        if (!startedAt || won || chronoDefeat) {
            return undefined;
        }

        const intervalId = setInterval(() => {
            setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));

            if (isChronoMode) {
                setChronoRemainingSeconds((previous) => Math.max(0, previous - 1));

                chronoScoreTickRef.current += 1;
                if (chronoScoreTickRef.current >= CHRONO_SCORE_DECAY_INTERVAL_SECONDS) {
                    chronoScoreTickRef.current = 0;
                    setChronoScore((previous) => Math.max(0, previous - 1));
                }
            }
        }, 1000);

        return () => clearInterval(intervalId);
    }, [startedAt, won, isChronoMode, chronoDefeat]);

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
            elapsedSeconds,
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
        elapsedSeconds,
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

    const handleContentClick = (event) => {
        if (!canInteractWithArticle) {
            return;
        }

        const anchor = event.target.closest('a');
        if (!anchor) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const href = anchor.getAttribute('href') || anchor.href || '';
        const article = extractTitleFromHref(href);
        if (!article) {
            return;
        }

        loadArticle(article, game?.target_article || '', false, { mode: game?.mode });
    };

    useEffect(() => {
        const node = contentRef.current;
        if (!node) {
            return undefined;
        }

        const preventDefaultNavigation = (event) => {
            const anchor = event.target.closest?.('a');
            if (!anchor) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
        };

        node.addEventListener('click', preventDefaultNavigation, true);
        return () => {
            node.removeEventListener('click', preventDefaultNavigation, true);
        };
    }, [html]);

    const handleContentMouseOver = (event) => {
        const anchor = event.target.closest('a');
        if (!anchor) {
            return;
        }

        const href = anchor.getAttribute('href') || anchor.href || '';
        const article = extractTitleFromHref(href);
        if (!article) {
            return;
        }

        fetchArticlePayload(article).catch(() => { });
    };

    const handleQuitGame = () => {
        if (gameCode && !isPreviewMode) {
            clearPersistedGameState(gameCode);
        }

        navigate(isPreviewMode ? '/admin/articles' : '/lobby');
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
    };

    const handleGoBack = async () => {
        if (articleHistory.length < 2 || loadingArticle || !canInteractWithArticle) {
            return;
        }

        const previousArticle = articleHistory[articleHistory.length - 2];
        setArticleHistory((previous) => previous.slice(0, -1));
        setClicks((previous) => Math.max(0, previous - 1));
        await loadArticle(previousArticle, game?.target_article || '', false, { fromHistory: true, mode: game?.mode });
    };

    if (loadingGame) {
        return <div className="p-6 text-slate-700">Chargement de la partie...</div>;
    }

    if (!gameCode && !isPreviewMode) {
        return (
            <div className="p-6">
                <p className="text-red-600">Code de partie ou titre de previsualisation manquant</p>
                <button
                    type="button"
                    className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-white"
                    onClick={() => navigate('/lobby')}
                >
                    Retour au lobby
                </button>
            </div>
        );
    }

    if (!game) {
        return (
            <div className="p-6">
                <p className="text-red-600">{error || 'Partie introuvable'}</p>
                <button
                    type="button"
                    className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-white"
                    onClick={() => navigate('/lobby')}
                >
                    Retour au lobby
                </button>
            </div>
        );
    }

    const displayedSeconds = isChronoMode ? chronoRemainingSeconds : elapsedSeconds;
    const minutes = String(Math.floor(displayedSeconds / 60)).padStart(2, '0');
    const seconds = String(displayedSeconds % 60).padStart(2, '0');
    const isOnStartArticle = normalizeArticle(currentArticle) === normalizeArticle(game.start_article);
    const currentArticleLabel = isOnStartArticle ? 'Depart' : (currentArticle || '...');
    const modeLabel = MODE_LABELS[gameMode] || game.mode;
    const knowledgeAnsweredCount = Object.keys(knowledgeQuizAnswers).length;
    const knowledgeAllAnswered = knowledgeQuiz.length > 0 && knowledgeAnsweredCount === knowledgeQuiz.length;
    const knowledgeScore = knowledgeQuiz.reduce((total, item, index) => {
        const selected = knowledgeQuizAnswers[index];
        return total + (selected === item.answerIndex ? 1 : 0);
    }, 0);

    return (
        <div className="flex h-screen flex-col bg-slate-50 text-slate-900">
            <div className="border-b border-slate-200/80 bg-white/85 px-3 py-2 backdrop-blur">
                <div className="mx-auto grid max-w-6xl grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div className="flex min-w-0 items-center gap-2 overflow-hidden text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        <span className="rounded-full bg-slate-900 px-2.5 py-1 font-semibold text-white">{modeLabel}</span>
                        <span className="inline-flex min-w-0 items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-cyan-800">
                            Départ:
                            <strong className="max-w-40 truncate font-semibold normal-case text-cyan-950 md:max-w-56 lg:max-w-64" title={game.start_article}>{game.start_article}</strong>
                        </span>
                        <span className="inline-flex min-w-0 items-center gap-1 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 text-fuchsia-800">
                            Cible:
                            <strong className="max-w-36 truncate font-semibold normal-case text-fuchsia-950 md:max-w-52 lg:max-w-60" title={game.target_article}>{game.target_article}</strong>
                        </span>
                    </div>

                    <div className="flex min-w-0 items-center justify-start gap-2 overflow-hidden text-[11px] uppercase tracking-[0.22em] text-slate-500 lg:justify-end">
                        <span className="inline-flex min-w-0 items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-800">
                            Article:
                            <strong className="max-w-32 truncate font-semibold normal-case text-blue-950 md:max-w-48 lg:max-w-56" title={currentArticle || '...'}>{currentArticleLabel}</strong>
                        </span>
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800">
                            Clics: <strong className="font-semibold text-amber-950">{clicks}</strong>
                        </span>
                        <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-violet-800">
                            {isChronoMode ? 'Temps restant' : 'Temps'}: <strong className="font-semibold text-violet-950">{minutes}:{seconds}</strong>
                        </span>
                        {isChronoMode && (
                            <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-800">
                                Points: <strong className="font-semibold text-rose-950">{chronoScore}</strong>
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={handleGoBack}
                            disabled={articleHistory.length < 2 || loadingArticle}
                            aria-label="Retour à l'article précédent"
                            title="Retour"
                            className="h-8 w-8 shrink-0 rounded-md border border-slate-200 bg-white text-slate-700 transition enabled:hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true" className="block h-4 w-4" style={{ display: 'block' }}>
                                <path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            onClick={handleQuitGame}
                            aria-label="Quitter la partie"
                            title="Quitter"
                            className="h-8 w-8 shrink-0 rounded-md border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 hover:text-rose-800"
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true" className="block h-4 w-4" style={{ display: 'block' }}>
                                <path d="M7 3h10a1 1 0 011 1v16a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" fill="none" stroke="currentColor" strokeWidth="1.8" />
                                <path d="M10 3v18" fill="none" stroke="currentColor" strokeWidth="1.8" />
                                <circle cx="13.5" cy="12" r="1" fill="currentColor" />
                            </svg>
                        </button>
                    </div>
                </div>

                {won && (
                    <div className="mx-auto mt-2 max-w-6xl rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                        Objectif atteint ! Tu as trouvé l’article cible {isChronoMode ? `avec ${chronoScore} points restants.` : `en ${minutes}:${seconds}.`}
                    </div>
                )}

                {won && isKnowledgeMode && (
                    <div className="mx-auto mt-2 max-w-6xl rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-3 text-indigo-900">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">Quiz connaissance</p>

                        {knowledgeQuizLoading ? (
                            <p className="mt-2 text-sm">Generation du quiz en cours...</p>
                        ) : knowledgeQuizError ? (
                            <p className="mt-2 text-sm text-rose-700">{knowledgeQuizError}</p>
                        ) : knowledgeQuiz.length > 0 ? (
                            <div className="mt-3 space-y-3">
                                {knowledgeQuiz.map((item, questionIndex) => {
                                    const selectedAnswer = knowledgeQuizAnswers[questionIndex];
                                    const isAnswered = Number.isInteger(selectedAnswer);

                                    return (
                                        <div key={`${questionIndex}-${item.question}`} className="rounded-lg border border-indigo-200 bg-white p-3">
                                            <p className="text-sm font-semibold text-slate-900">{questionIndex + 1}. {item.question}</p>
                                            <div className="mt-2 grid gap-2 md:grid-cols-2">
                                                {item.choices.map((choice, choiceIndex) => {
                                                    const isSelected = selectedAnswer === choiceIndex;
                                                    const isRightChoice = item.answerIndex === choiceIndex;
                                                    const showCorrection = knowledgeQuizSubmitted;

                                                    let buttonClass = 'border-slate-200 bg-white text-slate-800';
                                                    if (isSelected) {
                                                        buttonClass = 'border-indigo-300 bg-indigo-50 text-indigo-900';
                                                    }

                                                    if (showCorrection && isRightChoice) {
                                                        buttonClass = 'border-emerald-300 bg-emerald-50 text-emerald-900';
                                                    } else if (showCorrection && isSelected && !isRightChoice) {
                                                        buttonClass = 'border-rose-300 bg-rose-50 text-rose-900';
                                                    }

                                                    return (
                                                        <button
                                                            key={`${questionIndex}-${choiceIndex}`}
                                                            type="button"
                                                            className={`rounded-md border px-3 py-2 text-left text-sm transition ${buttonClass}`}
                                                            onClick={() => handleSelectKnowledgeAnswer(questionIndex, choiceIndex)}
                                                            disabled={knowledgeQuizSubmitted}
                                                        >
                                                            {choice}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            {knowledgeQuizSubmitted && (
                                                <div className="mt-2 space-y-1">
                                                    <p className="text-xs text-slate-600">
                                                        {isAnswered && selectedAnswer === item.answerIndex ? 'Bonne reponse.' : `Bonne reponse: ${item.choices[item.answerIndex]}`}
                                                    </p>
                                                    {item.sourceQuote && (
                                                        <p className="text-xs italic text-slate-500">
                                                            Indice texte lu: "{item.sourceQuote}"{item.sourceTitle ? ` (${item.sourceTitle})` : ''}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={handleSubmitKnowledgeQuiz}
                                        disabled={!knowledgeAllAnswered || knowledgeQuizSubmitted}
                                        className="rounded-lg border border-indigo-300 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Valider le quiz
                                    </button>
                                    <p className="text-sm text-slate-700">
                                        Reponses: {knowledgeAnsweredCount}/{knowledgeQuiz.length}
                                        {knowledgeQuizSubmitted ? ` | Score: ${knowledgeScore}/${knowledgeQuiz.length}` : ''}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <p className="mt-2 text-sm">Aucune question disponible.</p>
                        )}
                    </div>
                )}

                {chronoDefeat && (
                    <div className="mx-auto mt-2 max-w-6xl rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
                        Defaite chrono: tu as atteint 0 point ou 0 temps.
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-hidden bg-[linear-gradient(180deg,rgba(248,250,252,1)_0%,rgba(241,245,249,1)_100%)]">
                {error ? (
                    <div className="flex h-full items-center justify-center px-4">
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-6 py-5 text-center text-rose-800">
                            <p className="text-lg font-semibold uppercase tracking-[0.16em]">Erreur</p>
                            <p className="mt-2 text-sm">{error}</p>
                        </div>
                    </div>
                ) : loadingArticle && !html ? (
                    <div className="flex h-full items-center justify-center text-slate-600">Chargement de l’article...</div>
                ) : (
                    <div
                        ref={contentRef}
                        className="h-full overflow-y-auto px-3 py-4 md:px-6 md:py-6"
                        onMouseOverCapture={handleContentMouseOver}
                        onClickCapture={handleContentClick}
                    >
                        <div
                            className="wiki-mobile-html prose mx-auto w-full max-w-5xl prose-slate"
                            dangerouslySetInnerHTML={{ __html: html || '<p>Aucun contenu disponible.</p>' }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

export default Game;
