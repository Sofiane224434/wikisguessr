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

const toTimerStorageKey = (code) => `${TIMER_STORAGE_PREFIX}${String(code || '').trim().toUpperCase()}`;

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

function Game() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const contentRef = useRef(null);
    const requestIdRef = useRef(0);
    const articleCacheRef = useRef(new Map());
    const startedAtRef = useRef(null);
    const lastArticleRef = useRef('');

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

    const gameCode = searchParams.get('code');
    const previewTitle = searchParams.get('previewTitle');
    const isPreviewMode = !gameCode && Boolean(previewTitle);

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
        const { fromHistory = false } = options;
        const requestId = ++requestIdRef.current;
        setLoadingArticle(true);
        setError(null);

        try {
            const data = await fetchArticlePayload(title);

            if (requestId !== requestIdRef.current) {
                return;
            }

            const resolvedArticle = String(data.title || title).trim();

            setHtml(extractRenderableHtml(data.html || ''));
            setCurrentArticle(resolvedArticle);

            if (contentRef.current) {
                contentRef.current.scrollTo({ top: 0, left: 0, behavior: 'auto' });
            }

            if (isInitial) {
                setClicks(0);
                setWon(false);
                setArticleHistory([resolvedArticle]);

                const persistedStart = readPersistedStartAt(gameCode);
                const startTime = persistedStart || Date.now();
                startedAtRef.current = startTime;
                setStartedAt(startTime);

                setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
                persistStartAt(gameCode, startTime);
            } else {
                if (lastArticleRef.current && normalizeArticle(lastArticleRef.current) !== normalizeArticle(resolvedArticle)) {
                    if (!fromHistory) {
                        setClicks((previous) => previous + 1);
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
            }

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
    }, [fetchArticlePayload, gameCode]);

    useEffect(() => {
        if (!gameCode) {
            return;
        }

        gameService
            .getByCode(gameCode)
            .then(async (data) => {
                setGame(data.game);
                await loadArticle(data.game.start_article, data.game.target_article, true);
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
        loadArticle(initialTitle, initialTitle, true)
            .catch((err) => {
                setError(err.message || 'Impossible de charger la previsualisation');
            })
            .finally(() => {
                setLoadingGame(false);
            });
    }, [gameCode, previewTitle, loadArticle]);

    useEffect(() => {
        if (!startedAt || won) {
            return undefined;
        }

        const intervalId = setInterval(() => {
            setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
        }, 1000);

        return () => clearInterval(intervalId);
    }, [startedAt, won]);

    const handleContentClick = (event) => {
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

        loadArticle(article, game?.target_article || '', false);
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
        navigate(isPreviewMode ? '/admin/articles' : '/lobby');
    };

    const handleGoBack = async () => {
        if (articleHistory.length < 2 || loadingArticle) {
            return;
        }

        const previousArticle = articleHistory[articleHistory.length - 2];
        setArticleHistory((previous) => previous.slice(0, -1));
        setClicks((previous) => Math.max(0, previous - 1));
        await loadArticle(previousArticle, game?.target_article || '', false, { fromHistory: true });
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

    if (error || !game) {
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

    const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
    const seconds = String(elapsedSeconds % 60).padStart(2, '0');
    const isOnStartArticle = normalizeArticle(currentArticle) === normalizeArticle(game.start_article);
    const currentArticleLabel = isOnStartArticle ? 'Depart' : (currentArticle || '...');

    return (
        <div className="flex h-screen flex-col bg-slate-50 text-slate-900">
            <div className="border-b border-slate-200/80 bg-white/85 px-3 py-2 backdrop-blur">
                <div className="mx-auto grid max-w-6xl grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div className="flex min-w-0 items-center gap-2 overflow-hidden text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        <span className="rounded-full bg-slate-900 px-2.5 py-1 font-semibold text-white">{game.mode}</span>
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
                            Temps: <strong className="font-semibold text-violet-950">{minutes}:{seconds}</strong>
                        </span>
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
                        Objectif atteint ! Tu as trouvé l’article cible en {minutes}:{seconds}.
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-hidden bg-[linear-gradient(180deg,rgba(248,250,252,1)_0%,rgba(241,245,249,1)_100%)]">
                {loadingArticle && !html ? (
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
