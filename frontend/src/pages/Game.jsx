import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { gameService } from '../services/api.js';

const normalizeArticle = (value) =>
    decodeURIComponent(String(value || '').replace(/\+/g, ' '))
        .replace(/_/g, ' ')
        .trim()
        .toLowerCase();

const extractArticleFromProxyUrl = (urlLike) => {
    try {
        const url = new URL(urlLike, window.location.origin);
        const pathParam = url.searchParams.get('path');
        const titleParam = url.searchParams.get('title');

        if (titleParam) {
            return decodeURIComponent(titleParam).replace(/_/g, ' ').trim();
        }

        if (pathParam && pathParam.startsWith('/wiki/')) {
            return decodeURIComponent(pathParam.slice('/wiki/'.length)).replace(/_/g, ' ').trim();
        }
    } catch {
        return '';
    }

    return '';
};

function Game() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const iframeRef = useRef(null);
    const hasLoadedAtLeastOnceRef = useRef(false);

    const [game, setGame] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentArticle, setCurrentArticle] = useState('');
    const [clicks, setClicks] = useState(0);
    const [won, setWon] = useState(false);

    const gameCode = searchParams.get('code');

    useEffect(() => {
        if (!gameCode) {
            return;
        }

        gameService
            .getByCode(gameCode)
            .then((data) => {
                setGame(data.game);
                setCurrentArticle(data.game.start_article);
            })
            .catch((err) => {
                setError(err.message || 'Impossible de charger la partie');
            })
            .finally(() => {
                setLoading(false);
            });
    }, [gameCode]);

    const iframeSrc = useMemo(() => {
        if (!game?.start_article) {
            return '';
        }

        return `/api/wiki/page?title=${encodeURIComponent(game.start_article)}`;
    }, [game]);

    const handleFrameLoad = () => {
        const frame = iframeRef.current;
        if (!frame) {
            return;
        }

        let article = '';
        try {
            article = extractArticleFromProxyUrl(frame.contentWindow.location.href);
        } catch {
            article = '';
        }

        if (article) {
            setCurrentArticle(article);
        }

        if (hasLoadedAtLeastOnceRef.current) {
            setClicks((prev) => prev + 1);
        } else {
            hasLoadedAtLeastOnceRef.current = true;
        }

        if (article && game?.target_article && normalizeArticle(article) === normalizeArticle(game.target_article)) {
            setWon(true);
        }
    };

    if (loading) {
        return <div className="p-6 text-slate-700">Chargement de la partie...</div>;
    }

    if (!gameCode) {
        return (
            <div className="p-6">
                <p className="text-red-600">Code de partie manquant</p>
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

    return (
        <div className="flex h-[calc(100vh-120px)] flex-col">
            <div className="border-b border-slate-200 bg-white px-4 py-3">
                <p className="text-sm text-slate-600">
                    Code: <strong>{game.code}</strong> | Mode: <strong>{game.mode}</strong>
                </p>
                <p className="text-sm text-slate-700">
                    Depart: <strong>{game.start_article}</strong> | Cible: <strong>{game.target_article}</strong>
                </p>
                <p className="text-sm text-slate-700">
                    Article actuel: <strong>{currentArticle || '...'}</strong> | Clics: <strong>{clicks}</strong>
                </p>
                {won && (
                    <p className="mt-1 text-sm font-semibold text-emerald-700">
                        Objectif atteint ! Tu as trouve l'article cible.
                    </p>
                )}
            </div>

            {iframeSrc ? (
                <iframe
                    ref={iframeRef}
                    title="Wikipedia Game Frame"
                    src={iframeSrc}
                    onLoad={handleFrameLoad}
                    className="h-full w-full border-0"
                />
            ) : null}
        </div>
    );
}

export default Game;
