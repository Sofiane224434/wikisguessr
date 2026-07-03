const WIKI_ORIGIN = 'https://fr.wikipedia.org';
const WIKI_MOBILE_HTML_ORIGIN = 'https://fr.wikipedia.org/api/rest_v1/page/mobile-html';

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

const toMobileHtmlProxyUrl = (articleTitle) => `/api/wiki/mobile-html?title=${encodeURIComponent(articleTitle)}`;

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
        if (url.hostname === 'fr.wikipedia.org' && url.pathname.startsWith('/wiki/')) {
            return decodeURIComponent(url.pathname.slice('/wiki/'.length)).replace(/_/g, ' ').trim();
        }

        if (url.hostname === 'fr.wikipedia.org' && url.pathname.startsWith('/api/rest_v1/page/mobile-html/')) {
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

const rewriteMobileHtmlLinks = (html) => {
    let output = html;

    output = output.replace(/href="(\.\.\/|\.\/)([^"#?]+)([^"#]*)?"/g, (_match, prefix, slug, queryPart = '') => {
        const articleTitle = toArticleTitleFromRelativeHref(`${prefix}${slug}${queryPart}`);
        if (!articleTitle) {
            return _match;
        }

        return `href="${toMobileHtmlProxyUrl(articleTitle)}"`;
    });

    output = output.replace(
        /href="(https?:\/\/fr\.wikipedia\.org)?(\/wiki\/[^"#?]*)([^"#]*)?"/g,
        (_match, _host, pathPart, queryPart = '') => {
            const articleTitle = extractArticleTitleFromUrl(`${pathPart}${queryPart}`);
            if (!articleTitle) {
                return _match;
            }

            return `href="${toMobileHtmlProxyUrl(articleTitle)}"`;
        }
    );

    output = output.replace(/href="\/wiki\/([^"#?]*)([^"#]*)?"/g, (_match, slug, queryPart = '') => {
        const articleTitle = extractArticleTitleFromUrl(`/wiki/${slug}${queryPart}`);
        if (!articleTitle) {
            return _match;
        }

        return `href="${toMobileHtmlProxyUrl(articleTitle)}"`;
    });

    output = output.replace(/(href|src)="\/wiki\/([^"#?]*)([^"#]*)?"/g, (_match, attr, slug, queryPart = '') => {
        const articleTitle = extractArticleTitleFromUrl(`/wiki/${slug}${queryPart}`);
        if (!articleTitle) {
            return _match;
        }

        return `${attr}="${toMobileHtmlProxyUrl(articleTitle)}"`;
    });

    output = output.replace(/(href)="\/w\/index\.php\?title=([^"&]+)([^"]*)"/g, (_match, attr, titlePart, queryPart = '') => {
        const articleTitle = decodeURIComponent(titlePart).replace(/_/g, ' ').trim();
        if (!articleTitle) {
            return _match;
        }

        return `${attr}="${toMobileHtmlProxyUrl(articleTitle)}"`;
    });

    output = output.replace(/(href|src)="\/(?!\/)(?!api\/wiki\/mobile-html(?:[/?#&]|$))([^\"]+)"/g, (_match, attr, pathPart) => {
        return `${attr}="${WIKI_ORIGIN}/${pathPart}"`;
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

        if (!title) {
            return res.status(400).json({ error: 'Parametre title requis' });
        }

        const targetUrl = `${WIKI_MOBILE_HTML_ORIGIN}/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
        const response = await fetch(targetUrl, {
            redirect: 'follow',
            headers: {
                'User-Agent': 'WikisGuessrBot/1.0 (+https://wikisguessr.azim404.com)'
            }
        });

        if (!response.ok) {
            return res.status(502).json({ error: 'Impossible de recuperer la page Wikipedia' });
        }

        const html = await response.text();
        const resolvedTitle = extractArticleTitleFromUrl(response.url) || title;

        return res.status(200).json({
            title: resolvedTitle,
            html: rewriteMobileHtmlLinks(html),
            sourceUrl: response.url
        });
    } catch (error) {
        console.error('fetchWikiMobileHtml error:', error);
        return res.status(500).json({ error: 'Erreur mobile-html Wikipedia' });
    }
};
