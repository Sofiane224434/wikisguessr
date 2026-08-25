const SUPPORTED_WIKI_LANGUAGES = new Set(['ar', 'de', 'en', 'es', 'fr', 'hi', 'ja', 'pt', 'ru', 'zh']);
const WIKI_USER_AGENT = 'WikisGuessrBot/1.0 (+https://wikisguessr.azim404.com)';

export const normalizeWikiLanguage = (value) => {
    const language = String(value || '').trim().toLowerCase().split('-')[0];
    return SUPPORTED_WIKI_LANGUAGES.has(language) ? language : 'fr';
};

export const localizeWikiTitle = async (title, language) => {
    const sourceTitle = String(title || '').trim();
    const targetLanguage = normalizeWikiLanguage(language);
    if (!sourceTitle || targetLanguage === 'fr') {
        return sourceTitle;
    }

    try {
        const url = new URL('https://fr.wikipedia.org/w/api.php');
        url.search = new URLSearchParams({
            action: 'query',
            format: 'json',
            formatversion: '2',
            redirects: '1',
            prop: 'langlinks',
            lllang: targetLanguage,
            lllimit: '1',
            titles: sourceTitle
        }).toString();
        const response = await fetch(url, { headers: { 'User-Agent': WIKI_USER_AGENT } });
        if (!response.ok) {
            return '';
        }
        const payload = await response.json();
        return String(payload?.query?.pages?.[0]?.langlinks?.[0]?.title || '').trim();
    } catch {
        return '';
    }
};

export const localizeWikiMatchup = async (matchup, language) => {
    const targetLanguage = normalizeWikiLanguage(language);
    if (targetLanguage === 'fr') {
        return { ...matchup, wikiLanguage: 'fr' };
    }
    const [startArticle, targetArticle] = await Promise.all([
        localizeWikiTitle(matchup.startArticle, targetLanguage),
        localizeWikiTitle(matchup.targetArticle, targetLanguage)
    ]);
    if (!startArticle || !targetArticle || startArticle.toLowerCase() === targetArticle.toLowerCase()) {
        return { ...matchup, wikiLanguage: 'fr' };
    }
    return { ...matchup, startArticle, targetArticle, wikiLanguage: targetLanguage };
};