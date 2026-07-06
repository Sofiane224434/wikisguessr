import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { wikiService } from '../services/api.js';

const normalizeForSearch = (value) => String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const toWikipediaUrl = (title) => {
    const normalizedTitle = String(title || '').trim();
    if (!normalizedTitle) {
        return 'https://fr.wikipedia.org';
    }

    return `https://fr.wikipedia.org/wiki/${encodeURIComponent(normalizedTitle.replace(/\s+/g, '_'))}`;
};

const toMobileHtmlLink = (title) => {
    const normalizedTitle = String(title || '').trim();
    const encodedTitle = encodeURIComponent(normalizedTitle.replace(/\s+/g, '_'));
    return `/api/wiki/mobile-html?title=${encodedTitle}`;
};

const extractTitleFromFlexibleLinkInput = (value) => {
    const raw = String(value || '').trim();
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

        if (url.hostname === 'fr.wikipedia.org' && url.pathname.startsWith('/wiki/')) {
            return decodeURIComponent(url.pathname.slice('/wiki/'.length)).replace(/_/g, ' ').trim();
        }

        if (url.hostname === 'fr.wikipedia.org' && url.pathname === '/w/index.php') {
            const title = url.searchParams.get('title');
            return title ? decodeURIComponent(title).replace(/_/g, ' ').trim() : '';
        }
    } catch {
        // Fallback to raw title.
    }

    return raw;
};

const toMobileHtmlLinkFromInput = (value) => {
    const title = extractTitleFromFlexibleLinkInput(value);
    return title ? toMobileHtmlLink(title) : '';
};

function AdminArticles() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [actionError, setActionError] = useState(null);
    const [actionSuccess, setActionSuccess] = useState(null);
    const [search, setSearch] = useState('');
    const [articles, setArticles] = useState([]);
    const [newName, setNewName] = useState('');
    const [newLink, setNewLink] = useState('');
    const [adding, setAdding] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editingName, setEditingName] = useState('');
    const [editingLink, setEditingLink] = useState('');
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [validating, setValidating] = useState(false);
    const [autoFix, setAutoFix] = useState(true);
    const [removeInvalid, setRemoveInvalid] = useState(false);
    const [validationResult, setValidationResult] = useState(null);
    const [liveProgress, setLiveProgress] = useState(null);
    const [liveEvents, setLiveEvents] = useState([]);
    const [pendingDisambiguations, setPendingDisambiguations] = useState([]);
    const [disambiguationSelection, setDisambiguationSelection] = useState({});
    const [manualPendingLink, setManualPendingLink] = useState({});
    const [resolvingDisambiguationId, setResolvingDisambiguationId] = useState(null);
    const [rejectingDisambiguationId, setRejectingDisambiguationId] = useState(null);
    const [applyingPendingLinkId, setApplyingPendingLinkId] = useState(null);
    const [unrejectingDisambiguationId, setUnrejectingDisambiguationId] = useState(null);

    const goToGamePreview = (title) => {
        const normalizedTitle = String(title || '').trim();
        if (!normalizedTitle) {
            return;
        }

        navigate(`/game?previewTitle=${encodeURIComponent(normalizedTitle)}`);
    };

    const loadDisambiguations = async () => {
        const data = await wikiService.getDisambiguationPending();
        const pending = Array.isArray(data.pending) ? data.pending : [];
        setPendingDisambiguations(pending);

        setDisambiguationSelection((previous) => {
            const next = { ...previous };
            pending.forEach((item) => {
                if (!next[item.id] && Array.isArray(item.choices) && item.choices.length > 0) {
                    next[item.id] = item.choices[0];
                }
            });

            return next;
        });

        setManualPendingLink((previous) => {
            const next = { ...previous };
            pending.forEach((item) => {
                if (!next[item.id]) {
                    next[item.id] = item.name;
                }
            });

            return next;
        });
    };

    const handleResolveDisambiguation = async (item) => {
        const selectedTitle = String(disambiguationSelection[item.id] || '').trim();
        if (!selectedTitle) {
            setActionError('Choisis une page cible pour cette paronymie/homonymie.');
            return;
        }

        setActionError(null);
        setActionSuccess(null);
        setResolvingDisambiguationId(item.id);

        try {
            await wikiService.resolveDisambiguation(item.id, { selectedTitle });
            const data = await wikiService.getArticles();
            setArticles(Array.isArray(data.articles) ? data.articles : []);
            await loadDisambiguations();
            setActionSuccess('Paronymie/homonymie résolue et article mis à jour.');
        } catch (err) {
            setActionError(err.message || 'Impossible de résoudre la paronymie/homonymie');
        } finally {
            setResolvingDisambiguationId(null);
        }
    };

    const handleRejectDisambiguation = async (item) => {
        setActionError(null);
        setActionSuccess(null);
        setRejectingDisambiguationId(item.id);

        try {
            await wikiService.rejectDisambiguation(item.id);
            const data = await wikiService.getArticles();
            setArticles(Array.isArray(data.articles) ? data.articles : []);
            await loadDisambiguations();
            setActionSuccess('Paronymie/homonymie refusée. Cet article ne sera plus remis en paronymie/homonymie automatiquement.');
        } catch (err) {
            setActionError(err.message || 'Impossible de refuser la paronymie/homonymie');
        } finally {
            setRejectingDisambiguationId(null);
        }
    };

    const handleDeletePendingDisambiguationArticle = async (item) => {
        const confirmed = window.confirm(`Supprimer l'article "${item.name}" ?`);
        if (!confirmed) {
            return;
        }

        setActionError(null);
        setActionSuccess(null);
        setDeletingId(item.id);

        try {
            await wikiService.deleteArticle(item.id);
            const data = await wikiService.getArticles();
            setArticles(Array.isArray(data.articles) ? data.articles : []);
            await loadDisambiguations();
            setActionSuccess('Article supprimé depuis les paronymies/homonymies en attente.');
        } catch (err) {
            setActionError(err.message || 'Impossible de supprimer cet article');
        } finally {
            setDeletingId(null);
        }
    };

    const handleUnrejectDisambiguation = async (item) => {
        const confirmed = window.confirm(`Retirer le refus de paronymie/homonymie pour "${item.name}" ?`);
        if (!confirmed) {
            return;
        }

        setActionError(null);
        setActionSuccess(null);
        setUnrejectingDisambiguationId(item.id);

        try {
            await wikiService.unrejectDisambiguation(item.id);
            const data = await wikiService.getArticles();
            setArticles(Array.isArray(data.articles) ? data.articles : []);
            await loadDisambiguations();
            setActionSuccess('Refus de paronymie/homonymie retiré.');
        } catch (err) {
            setActionError(err.message || 'Impossible de retirer le refus de paronymie/homonymie');
        } finally {
            setUnrejectingDisambiguationId(null);
        }
    };

    const handleApplyPendingLink = async (item) => {
        const linkInput = String(manualPendingLink[item.id] || '').trim();
        if (!linkInput) {
            setActionError('Saisis un titre pour appliquer cette paronymie/homonymie.');
            return;
        }

        const linkValue = toMobileHtmlLinkFromInput(linkInput);

        setActionError(null);
        setActionSuccess(null);
        setApplyingPendingLinkId(item.id);

        try {
            await wikiService.updateArticle(item.id, {
                name: '',
                link: linkValue
            });

            const data = await wikiService.getArticles();
            setArticles(Array.isArray(data.articles) ? data.articles : []);
            await loadDisambiguations();
            setActionSuccess('Lien appliqué avec succès.');
        } catch (err) {
            setActionError(err.message || 'Impossible d\'appliquer ce lien');
        } finally {
            setApplyingPendingLinkId(null);
        }
    };

    useEffect(() => {
        const loadArticles = async () => {
            setLoading(true);
            setError(null);

            try {
                const data = await wikiService.getArticles();
                setArticles(Array.isArray(data.articles) ? data.articles : []);
                await loadDisambiguations();
            } catch (err) {
                setError(err.message || 'Impossible de charger la liste des articles');
            } finally {
                setLoading(false);
            }
        };

        loadArticles();
    }, []);

    const handleAddArticle = async (event) => {
        event.preventDefault();
        setActionError(null);
        setActionSuccess(null);
        setAdding(true);

        try {
            const normalizedLink = toMobileHtmlLinkFromInput(newLink);

            await wikiService.addArticle({
                name: newName,
                link: normalizedLink
            });

            const data = await wikiService.getArticles();
            setArticles(Array.isArray(data.articles) ? data.articles : []);
            await loadDisambiguations();
            setNewName('');
            setNewLink('');
            setActionSuccess('Article ajouté avec succès.');
        } catch (err) {
            setActionError(err.message || 'Impossible d\'ajouter l\'article');
        } finally {
            setAdding(false);
        }
    };

    const startEdit = (article) => {
        setEditingId(article.id);
        setEditingName(article.name || '');
        setEditingLink(article.link || '');
        setActionError(null);
        setActionSuccess(null);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditingName('');
        setEditingLink('');
    };

    const handleSaveEdit = async (articleId) => {
        setActionError(null);
        setActionSuccess(null);
        setSaving(true);

        try {
            const normalizedLink = toMobileHtmlLinkFromInput(editingLink);

            await wikiService.updateArticle(articleId, {
                name: editingName,
                link: normalizedLink
            });

            const data = await wikiService.getArticles();
            setArticles(Array.isArray(data.articles) ? data.articles : []);
            await loadDisambiguations();
            cancelEdit();
            setActionSuccess('Article modifié avec succès.');
        } catch (err) {
            setActionError(err.message || 'Impossible de modifier l\'article');
        } finally {
            setSaving(false);
        }
    };

    const handleValidateAll = async () => {
        setActionError(null);
        setActionSuccess(null);
        setValidating(true);
        setLiveProgress(null);
        setLiveEvents([]);

        try {
            const response = await wikiService.validateArticlesStream({
                autoFix,
                removeInvalid
            });

            if (!response.ok || !response.body) {
                throw new Error('Impossible de lancer la validation globale');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let donePayload = null;

            while (true) {
                const { value, done } = await reader.read();
                if (done) {
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                lines.forEach((line) => {
                    const text = line.trim();
                    if (!text) {
                        return;
                    }

                    try {
                        const payload = JSON.parse(text);
                        if (payload.type === 'start') {
                            setLiveProgress({
                                index: 0,
                                total: payload.total || 0
                            });
                        }

                        if (payload.type === 'progress') {
                            setLiveProgress({
                                index: payload.index || 0,
                                total: payload.total || 0
                            });
                            setLiveEvents((previous) => [payload.entry, ...previous].slice(0, 120));
                        }

                        if (payload.type === 'done') {
                            donePayload = payload;
                        }

                        if (payload.type === 'error') {
                            throw new Error(payload.message || 'Erreur validation streaming');
                        }
                    } catch (parseError) {
                        if (parseError instanceof SyntaxError) {
                            return;
                        }

                        throw parseError;
                    }
                });
            }

            const result = donePayload || { summary: null, report: [] };

            setValidationResult(result);
            const data = await wikiService.getArticles();
            setArticles(Array.isArray(data.articles) ? data.articles : []);
            await loadDisambiguations();

            setActionSuccess('Validation terminée. Rapport mis à jour.');
        } catch (err) {
            setActionError(err.message || 'Impossible de lancer la validation globale');
        } finally {
            setValidating(false);
        }
    };

    const handleDeleteArticle = async (article) => {
        const confirmed = window.confirm(`Supprimer l'article "${article.name}" ?`);
        if (!confirmed) {
            return;
        }

        setActionError(null);
        setActionSuccess(null);
        setDeletingId(article.id);

        try {
            await wikiService.deleteArticle(article.id);
            const data = await wikiService.getArticles();
            setArticles(Array.isArray(data.articles) ? data.articles : []);
            await loadDisambiguations();
            setActionSuccess('Article supprimé avec succès.');
        } catch (err) {
            setActionError(err.message || 'Impossible de supprimer l\'article');
        } finally {
            setDeletingId(null);
        }
    };

    const filteredArticles = useMemo(() => {
        const query = normalizeForSearch(search);
        if (!query) {
            return articles;
        }

        return articles.filter((item) => {
            const searchableText = normalizeForSearch([
                item.name,
                item.link,
                item.theme
            ].join(' '));

            return searchableText.includes(query);
        });
    }, [articles, search]);

    return (
        <div className="min-h-[calc(100vh-4rem)] bg-slate-950 px-4 py-8 text-white">
            <div className="mx-auto flex max-w-6xl flex-col gap-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Admin</p>
                        <h1 className="mt-2 text-3xl font-semibold">Liste des articles</h1>
                        <p className="mt-2 text-sm text-slate-300">
                            Tous les articles du dataset avec le lien utilisé par le jeu.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => navigate('/admin')}
                        className="rounded-full border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                        Retour Admin
                    </button>
                </div>

                <div className="order-1 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                    <label htmlFor="article-search" className="mb-2 block text-xs uppercase tracking-[0.25em] text-slate-400">
                        Rechercher un article
                    </label>
                    <input
                        id="article-search"
                        type="text"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Ex: France, ChatGPT, Montagne..."
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400"
                    />
                </div>

                <form onSubmit={handleAddArticle} className="order-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                    <p className="mb-3 text-xs uppercase tracking-[0.25em] text-cyan-300">Ajouter un article</p>
                    <div className="grid gap-3 md:grid-cols-2">
                        <input
                            type="text"
                            value={newName}
                            onChange={(event) => setNewName(event.target.value)}
                            placeholder="Nom de l'article"
                            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400"
                        />
                        <input
                            type="text"
                            value={newLink}
                            onChange={(event) => setNewLink(event.target.value)}
                            placeholder="Titre Wikipedia ou URL Wikipedia"
                            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400"
                        />
                    </div>
                    <div className="mt-3 flex justify-end">
                        <button
                            type="submit"
                            disabled={adding}
                            className="rounded-full bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
                        >
                            {adding ? 'Ajout...' : 'Ajouter'}
                        </button>
                    </div>
                </form>

                <div className="order-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                    <p className="mb-3 text-xs uppercase tracking-[0.25em] text-amber-300">Testeur global des liens</p>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
                        <label className="inline-flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={autoFix}
                                onChange={(event) => setAutoFix(event.target.checked)}
                            />
                            Auto-corriger les noms (redirections / fallback)
                        </label>
                        <label className="inline-flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={removeInvalid}
                                onChange={(event) => setRemoveInvalid(event.target.checked)}
                            />
                            Supprimer les articles invalides (inaccessibles en jeu)
                        </label>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                        Les erreurs reseau temporaires ne sont pas supprimees.
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                        Avec cette option, les doublons de noms sont aussi supprimes automatiquement.
                    </p>
                    <div className="mt-3 flex justify-end">
                        <button
                            type="button"
                            disabled={validating}
                            onClick={handleValidateAll}
                            className="rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:opacity-60"
                        >
                            {validating ? 'Validation...' : 'Tester tout le dataset'}
                        </button>
                    </div>

                    {liveProgress && (
                        <p className="mt-3 text-xs text-slate-300">
                            Progression en direct: {liveProgress.index} / {liveProgress.total}
                        </p>
                    )}

                    {liveEvents.length > 0 && (
                        <div className="mt-3 max-h-48 overflow-auto rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                            <ul className="space-y-1 text-xs text-slate-300">
                                {liveEvents.map((entry, index) => (
                                    <li key={`${entry.id}-${index}`}>
                                        <button
                                            type="button"
                                            onClick={() => goToGamePreview(entry.resolvedTitle || entry.name)}
                                            className="font-semibold text-cyan-300 underline underline-offset-2"
                                        >
                                            {entry.name}
                                        </button>
                                        {' - '}
                                        <span className="uppercase">{entry.status}</span>
                                        {entry.resolvedTitle ? ` -> ${entry.resolvedTitle}` : ''}
                                        {entry.reason ? ` (${entry.reason})` : ''}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                <div className="order-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                    <p className="mb-3 text-xs uppercase tracking-[0.25em] text-fuchsia-300">Paronymies / homonymies a resoudre</p>
                    {pendingDisambiguations.length === 0 ? (
                        <p className="text-sm text-slate-400">Aucune page de paronymie/homonymie en attente.</p>
                    ) : (
                        <div className="space-y-1">
                            {pendingDisambiguations.map((item) => (
                                <div key={item.id} className="grid min-h-14 grid-cols-12 items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-1">
                                    <p className="col-span-12 truncate text-xs text-white lg:col-span-3">
                                        <a
                                            href={toWikipediaUrl(item.name)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="font-semibold text-cyan-300 underline underline-offset-2"
                                            title="Ouvrir l'article sur Wikipedia"
                                        >
                                            {item.name}
                                        </a>
                                        {' - '}
                                        <span className="text-slate-400">{item.theme}</span>
                                    </p>
                                    <div className="col-span-12 grid grid-cols-12 items-center gap-1 lg:col-span-9">
                                        <select
                                            value={disambiguationSelection[item.id] || ''}
                                            onChange={(event) => {
                                                const value = event.target.value;
                                                setDisambiguationSelection((previous) => ({
                                                    ...previous,
                                                    [item.id]: value
                                                }));
                                            }}
                                            className="col-span-12 h-8 min-w-0 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-white lg:col-span-4"
                                        >
                                            {(Array.isArray(item.choices) ? item.choices : []).map((choice) => (
                                                <option key={`${item.id}-${choice}`} value={choice}>{choice}</option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            disabled={resolvingDisambiguationId === item.id}
                                            onClick={() => handleResolveDisambiguation(item)}
                                            className="col-span-4 h-7 rounded-md border border-fuchsia-500/50 bg-fuchsia-500/10 px-1.5 text-[10px] font-semibold text-fuchsia-300 transition hover:bg-fuchsia-500/20 disabled:opacity-60 lg:col-span-2"
                                        >
                                            {resolvingDisambiguationId === item.id ? '...' : 'Choix'}
                                        </button>
                                        <input
                                            type="text"
                                            value={manualPendingLink[item.id] || ''}
                                            onChange={(event) => {
                                                const value = event.target.value;
                                                setManualPendingLink((previous) => ({
                                                    ...previous,
                                                    [item.id]: value
                                                }));
                                            }}
                                            className="col-span-12 h-7 min-w-0 rounded-md border border-slate-700 bg-slate-900 px-2 text-[10px] text-white outline-none focus:border-cyan-400 lg:col-span-4"
                                            placeholder="Titre cible Wikipedia"
                                        />
                                        <button
                                            type="button"
                                            disabled={applyingPendingLinkId === item.id}
                                            onClick={() => handleApplyPendingLink(item)}
                                            className="col-span-4 h-7 rounded-md border border-cyan-500/50 bg-cyan-500/10 px-1.5 text-[10px] font-semibold text-cyan-300 transition hover:bg-cyan-500/20 disabled:opacity-60 lg:col-span-1"
                                        >
                                            {applyingPendingLinkId === item.id ? '...' : 'Lien'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => goToGamePreview(disambiguationSelection[item.id] || item.name)}
                                            className="col-span-4 h-7 rounded-md border border-cyan-500/50 bg-cyan-500/10 px-1.5 text-[10px] font-semibold text-cyan-300 transition hover:bg-cyan-500/20 lg:col-span-1"
                                        >
                                            Jeu
                                        </button>
                                        <button
                                            type="button"
                                            disabled={rejectingDisambiguationId === item.id}
                                            onClick={() => handleRejectDisambiguation(item)}
                                            className="col-span-4 h-7 rounded-md border border-rose-500/50 bg-rose-500/10 px-1.5 text-[10px] font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-60 lg:col-span-1"
                                        >
                                            {rejectingDisambiguationId === item.id ? '...' : 'Refus'}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={deletingId === item.id}
                                            onClick={() => handleDeletePendingDisambiguationArticle(item)}
                                            className="col-span-4 h-7 rounded-md border border-rose-500/50 bg-rose-500/10 px-1.5 text-[10px] font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-60 lg:col-span-1"
                                        >
                                            {deletingId === item.id ? '...' : 'Suppr'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {actionError && <p className="order-6 text-red-300">{actionError}</p>}
                {actionSuccess && <p className="order-6 text-emerald-300">{actionSuccess}</p>}

                {validationResult?.summary && (
                    <div className="order-7 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm">
                        <p className="mb-3 text-xs uppercase tracking-[0.24em] text-slate-400">Résultat validation</p>
                        <div className="grid gap-2 text-slate-200 md:grid-cols-7">
                            <p>Total: <strong>{validationResult.summary.total}</strong></p>
                            <p>OK: <strong className="text-emerald-300">{validationResult.summary.ok}</strong></p>
                            <p>Redirigés: <strong className="text-cyan-300">{validationResult.summary.redirected}</strong></p>
                            <p>Corrigeables: <strong className="text-amber-300">{validationResult.summary.correctable}</strong></p>
                            <p>Paronymies/Homonymies: <strong className="text-fuchsia-300">{validationResult.summary.disambiguation || 0}</strong></p>
                            <p>Invalides: <strong className="text-rose-300">{validationResult.summary.invalid}</strong></p>
                            <p>Erreurs réseau: <strong className="text-orange-300">{validationResult.summary.error || 0}</strong></p>
                        </div>
                        <div className="mt-3 max-h-56 overflow-auto rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                            <ul className="space-y-1 text-xs text-slate-300">
                                {validationResult.report
                                    .filter((entry) => entry.status !== 'ok')
                                    .slice(0, 120)
                                    .map((entry) => (
                                        <li key={`${entry.id}-${entry.status}`}>
                                            <button
                                                type="button"
                                                onClick={() => goToGamePreview(entry.resolvedTitle || entry.name)}
                                                className="font-semibold text-cyan-300 underline underline-offset-2"
                                            >
                                                {entry.name}
                                            </button>
                                            {' - '}
                                            <span className="uppercase">{entry.status}</span>
                                            {entry.resolvedTitle ? ` -> ${entry.resolvedTitle}` : ''}
                                            {entry.reason ? ` (${entry.reason})` : ''}
                                        </li>
                                    ))}
                            </ul>
                        </div>
                    </div>
                )}

                {loading && <p className="order-8 text-slate-300">Chargement des articles...</p>}
                {error && <p className="order-8 text-red-300">{error}</p>}

                {!loading && !error && (
                    <div className="order-2 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">
                        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 text-xs uppercase tracking-[0.24em] text-slate-400">
                            <span>{filteredArticles.length} articles affichés</span>
                            <span>{articles.length} articles au total</span>
                        </div>

                        <div className="max-h-[65vh] overflow-auto">
                            <table className="w-full border-collapse text-sm">
                                <thead className="sticky top-0 bg-slate-950/95 backdrop-blur">
                                    <tr className="text-left text-slate-300">
                                        <th className="px-4 py-3 font-semibold">Nom</th>
                                        <th className="px-4 py-3 font-semibold">Lien utilisé</th>
                                        <th className="w-36 px-4 py-3 font-semibold">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredArticles.map((item) => (
                                        <tr key={item.id} className="border-t border-slate-800/80 text-slate-200">
                                            <td className="px-4 py-3 font-medium">
                                                {editingId === item.id ? (
                                                    <input
                                                        type="text"
                                                        value={editingName}
                                                        onChange={(event) => setEditingName(event.target.value)}
                                                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                                                    />
                                                ) : (
                                                    <>
                                                        <a
                                                            href={toWikipediaUrl(item.name)}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="text-cyan-300 underline underline-offset-2"
                                                            title="Ouvrir l'article sur Wikipedia"
                                                        >
                                                            {item.name}
                                                        </a>
                                                        {item.hasPendingDisambiguation && (
                                                            <span className="ml-1 rounded-full border border-fuchsia-500/50 bg-fuchsia-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-fuchsia-300">
                                                                Paronymie/Homonymie
                                                            </span>
                                                        )}
                                                        {item.hasRefusedDisambiguation && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleUnrejectDisambiguation(item)}
                                                                disabled={unrejectingDisambiguationId === item.id}
                                                                className="ml-1 rounded-full border border-rose-500/50 bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-60"
                                                                title="Cliquer pour retirer le refus de paronymie/homonymie"
                                                            >
                                                                {unrejectingDisambiguationId === item.id ? '...' : 'Paronymie/Homonymie refusée'}
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {editingId === item.id ? (
                                                    <input
                                                        type="text"
                                                        value={editingLink}
                                                        onChange={(event) => setEditingLink(event.target.value)}
                                                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                                                        placeholder="Titre Wikipedia ou lien"
                                                    />
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => goToGamePreview(item.name)}
                                                        className="block max-w-xl break-all text-left text-xs text-cyan-300 underline underline-offset-2"
                                                        title="Tester cet article dans la vue jeu"
                                                    >
                                                        {item.link}
                                                    </button>
                                                )}
                                            </td>
                                            <td className="w-36 px-4 py-3">
                                                {editingId === item.id ? (
                                                    <div className="flex w-28 justify-end gap-1">
                                                        <button
                                                            type="button"
                                                            disabled={saving}
                                                            onClick={() => handleSaveEdit(item.id)}
                                                            className="h-6 w-12 rounded-md bg-emerald-500 px-0 py-0 text-[10px] font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
                                                        >
                                                            {saving ? '...' : 'OK'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={cancelEdit}
                                                            className="h-6 w-12 rounded-md border border-slate-700 bg-slate-900 px-0 py-0 text-[10px] font-semibold text-white transition hover:bg-slate-800"
                                                        >
                                                            X
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => startEdit(item)}
                                                        className="h-6 w-12 rounded-md border border-cyan-500/50 bg-cyan-500/10 px-0 py-0 text-[10px] font-semibold text-cyan-300 transition hover:bg-cyan-500/20"
                                                    >
                                                        Edit
                                                    </button>
                                                )}
                                                {editingId !== item.id && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteArticle(item)}
                                                        disabled={deletingId === item.id}
                                                        className="ml-1 h-6 w-12 rounded-md border border-rose-500/50 bg-rose-500/10 px-0 py-0 text-[10px] font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-60"
                                                    >
                                                        {deletingId === item.id ? '...' : 'Suppr'}
                                                    </button>
                                                )
                                                }
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default AdminArticles;
