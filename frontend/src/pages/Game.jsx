import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { gameService } from '../services/api.js';

const normalizeTitle = (value) =>
    String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/_/g, ' ')
        .trim()
        .toLowerCase();

const formatDuration = (seconds) => {
    const total = Math.max(0, Number(seconds || 0));
    const minutes = Math.floor(total / 60);
    const remain = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remain).padStart(2, '0')}`;
};

async function fetchWikipediaLinks(articleTitle) {
    const url = new URL('https://fr.wikipedia.org/w/api.php');
    url.searchParams.set('origin', '*');
    url.searchParams.set('format', 'json');
    url.searchParams.set('action', 'query');
    url.searchParams.set('prop', 'links');
    url.searchParams.set('titles', articleTitle);
    url.searchParams.set('plnamespace', '0');
    url.searchParams.set('pllimit', '50');

    const response = await fetch(url.toString());
    if (!response.ok) {
        throw new Error('Impossible de charger les liens Wikipedia');
    }

    const data = await response.json();
    const pages = data?.query?.pages || {};
    const firstPage = Object.values(pages)[0];

    if (!firstPage || firstPage.missing) {
        throw new Error('Article Wikipedia introuvable');
    }

    const links = (firstPage.links || [])
        .map((item) => item?.title)
        .filter(Boolean)
        .slice(0, 30);

    return {
        resolvedTitle: firstPage.title,
        links
    };
}

function Game() {
    const { code } = useParams();
    const [game, setGame] = useState(null);
    const [currentArticle, setCurrentArticle] = useState(null);
    const [articleLinks, setArticleLinks] = useState([]);
    const [clicks, setClicks] = useState(0);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [running, setRunning] = useState(true);
    const [loading, setLoading] = useState(true);
    const [loadingLinks, setLoadingLinks] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!running) {
            return undefined;
        }

        const timerId = setInterval(() => {
            setElapsedSeconds((prev) => prev + 1);
        }, 1000);

        return () => clearInterval(timerId);
    }, [running]);

    const isTargetReached = useMemo(() => {
        if (!game || !currentArticle) {
            return false;
        }

        return normalizeTitle(currentArticle) === normalizeTitle(game.target_article);
    }, [currentArticle, game]);

    useEffect(() => {
        if (!isTargetReached) {
            return;
        }

        setRunning(false);
    }, [isTargetReached]);

    const loadArticle = async (title) => {
        setLoadingLinks(true);
        setError(null);

        try {
            const result = await fetchWikipediaLinks(title);
            setCurrentArticle(result.resolvedTitle);
            setArticleLinks(result.links);
        } catch (err) {
            setError(err.message || 'Erreur lors du chargement de la page Wikipedia');
            setArticleLinks([]);
        } finally {
            setLoadingLinks(false);
        }
    };

    useEffect(() => {
        let isMounted = true;

        const loadGame = async () => {
            setLoading(true);
            setError(null);

            try {
                if (!code) {
                    throw new Error('Code de partie manquant');
                }

                const data = await gameService.getByCode(code);
                if (!isMounted) {
                    return;
                }

                setGame(data.game);
                setClicks(0);
                setElapsedSeconds(0);
                setRunning(true);
                await loadArticle(data.game.start_article);
            } catch (err) {
                if (isMounted) {
                    setError(err.message || 'Impossible de charger la partie');
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        loadGame();

        return () => {
            isMounted = false;
        };
    }, [code]);

    const handleFollowLink = async (title) => {
        if (!running || loadingLinks) {
            return;
        }

        setClicks((prev) => prev + 1);
        await loadArticle(title);
    };

    if (loading) {
        return <div className="px-4 py-8 text-slate-700">Chargement de la partie...</div>;
    }

    if (!game) {
        return (
            <div className="px-4 py-8">
                <p className="text-red-600">{error || 'Partie introuvable'}</p>
                <Link to="/lobby" className="mt-4 inline-block text-blue-600 underline">
                    Retour au lobby
                </Link>
            </div>
        );
    }

    return (
        <div className="mx-auto w-full max-w-6xl px-4 py-8">
            <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-medium text-slate-500">Code {game.code} | Mode {game.mode}</p>
                <h1 className="mt-1 text-2xl font-bold text-slate-900">{game.title}</h1>
                <p className="mt-2 text-slate-700">
                    Objectif: atteindre <strong>{game.target_article}</strong>
                </p>

                <div className="mt-4 flex flex-wrap gap-3 text-sm">
                    <span className="rounded-md bg-slate-100 px-3 py-1">Temps: {formatDuration(elapsedSeconds)}</span>
                    <span className="rounded-md bg-slate-100 px-3 py-1">Clics: {clicks}</span>
                    <span className="rounded-md bg-slate-100 px-3 py-1">Article actuel: {currentArticle || '-'}</span>
                </div>

                {isTargetReached && (
                    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
                        Cible atteinte. Partie terminee en {formatDuration(elapsedSeconds)} avec {clicks} clics.
                    </div>
                )}

                {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-slate-900">Liens Wikipedia disponibles</h2>
                    {currentArticle && (
                        <a
                            href={`https://fr.wikipedia.org/wiki/${encodeURIComponent(currentArticle.replace(/\s+/g, '_'))}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-blue-600 underline"
                        >
                            Ouvrir l'article sur Wikipedia
                        </a>
                    )}
                </div>

                {loadingLinks ? (
                    <p className="text-slate-600">Chargement des liens...</p>
                ) : articleLinks.length === 0 ? (
                    <p className="text-slate-600">Aucun lien navigable sur cette page.</p>
                ) : (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {articleLinks.map((linkTitle) => (
                            <button
                                key={linkTitle}
                                type="button"
                                onClick={() => handleFollowLink(linkTitle)}
                                disabled={!running}
                                className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                            >
                                {linkTitle}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default Game;
