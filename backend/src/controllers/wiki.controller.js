const WIKI_ORIGIN = 'https://fr.wikipedia.org';

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
