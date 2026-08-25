import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
const DEFAULT_QUESTION_COUNT = 5;
const MAX_USAGE_HISTORY = 25;
const DEFAULT_DAILY_REQUEST_LIMIT = 500;
const GEMINI_REQUEST_TIMEOUT_MS = 15000;
const GEMINI_MAX_ATTEMPTS = 2;
const QUIZ_LANGUAGE_NAMES = {
    ar: 'arabe',
    de: 'allemand',
    en: 'anglais',
    es: 'espagnol',
    fr: 'francais',
    hi: 'hindi',
    ja: 'japonais',
    pt: 'portugais',
    ru: 'russe',
    zh: 'chinois'
};

const QUIZ_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    required: ['questions'],
    properties: {
        questions: {
            type: 'ARRAY',
            minItems: DEFAULT_QUESTION_COUNT,
            maxItems: DEFAULT_QUESTION_COUNT,
            items: {
                type: 'OBJECT',
                required: ['question', 'choices', 'answerIndex', 'sourceTitle', 'sourceQuote'],
                properties: {
                    question: { type: 'STRING' },
                    choices: {
                        type: 'ARRAY',
                        minItems: 4,
                        maxItems: 4,
                        items: { type: 'STRING' }
                    },
                    answerIndex: { type: 'INTEGER', minimum: 0, maximum: 3 },
                    sourceTitle: { type: 'STRING' },
                    sourceQuote: { type: 'STRING' }
                }
            }
        }
    }
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ENV_FILE_PATH = path.resolve(__dirname, '../../.env');
const USAGE_STATE_FILE_PATH = path.resolve(__dirname, '../data/knowledge-quiz-usage-state.json');

class KnowledgeQuizError extends Error {
    constructor(message, { code = 'KNOWLEDGE_QUIZ_ERROR', status = 500 } = {}) {
        super(message);
        this.name = 'KnowledgeQuizError';
        this.code = code;
        this.status = status;
    }
}

const createDefaultUsageState = () => ({
    totalCalls: 0,
    successCalls: 0,
    failedCalls: 0,
    totalPromptTokens: 0,
    totalCandidateTokens: 0,
    totalTokens: 0,
    dayKey: '',
    dailyCalls: 0,
    dailyPromptTokens: 0,
    dailyCandidateTokens: 0,
    dailyTotalTokens: 0,
    lastCallAt: null,
    lastError: '',
    recentCalls: []
});

const toSafeNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const loadPersistedUsageState = () => {
    try {
        if (!fs.existsSync(USAGE_STATE_FILE_PATH)) {
            return createDefaultUsageState();
        }

        const raw = fs.readFileSync(USAGE_STATE_FILE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        const base = createDefaultUsageState();

        return {
            ...base,
            totalCalls: toSafeNumber(parsed?.totalCalls),
            successCalls: toSafeNumber(parsed?.successCalls),
            failedCalls: toSafeNumber(parsed?.failedCalls),
            totalPromptTokens: toSafeNumber(parsed?.totalPromptTokens),
            totalCandidateTokens: toSafeNumber(parsed?.totalCandidateTokens),
            totalTokens: toSafeNumber(parsed?.totalTokens),
            dayKey: toSafeString(parsed?.dayKey),
            dailyCalls: toSafeNumber(parsed?.dailyCalls),
            dailyPromptTokens: toSafeNumber(parsed?.dailyPromptTokens),
            dailyCandidateTokens: toSafeNumber(parsed?.dailyCandidateTokens),
            dailyTotalTokens: toSafeNumber(parsed?.dailyTotalTokens),
            lastCallAt: toSafeString(parsed?.lastCallAt) || null,
            lastError: toSafeString(parsed?.lastError),
            recentCalls: Array.isArray(parsed?.recentCalls)
                ? parsed.recentCalls.slice(0, MAX_USAGE_HISTORY).map((entry) => ({
                    at: toSafeString(entry?.at),
                    ok: Boolean(entry?.ok),
                    model: toSafeString(entry?.model),
                    promptTokens: toSafeNumber(entry?.promptTokens),
                    candidateTokens: toSafeNumber(entry?.candidateTokens),
                    totalTokens: toSafeNumber(entry?.totalTokens),
                    errorCode: toSafeString(entry?.errorCode),
                    errorMessage: toSafeString(entry?.errorMessage)
                }))
                : []
        };
    } catch {
        return createDefaultUsageState();
    }
};

const persistUsageState = () => {
    try {
        const payload = {
            ...knowledgeQuizUsageState,
            recentCalls: knowledgeQuizUsageState.recentCalls.slice(0, MAX_USAGE_HISTORY)
        };
        fs.writeFileSync(USAGE_STATE_FILE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
    } catch {
        // Ignore persistence failures to avoid blocking quiz generation.
    }
};

const knowledgeQuizUsageState = loadPersistedUsageState();

const toSafeString = (value) => String(value || '').trim();

const readEnvValueFromBackendFile = (name) => {
    try {
        if (!fs.existsSync(BACKEND_ENV_FILE_PATH)) {
            return '';
        }

        const raw = fs.readFileSync(BACKEND_ENV_FILE_PATH, 'utf-8');
        const lines = raw.split(/\r?\n/);

        for (const line of lines) {
            if (!line || /^\s*#/.test(line)) {
                continue;
            }

            const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
            if (!match) {
                continue;
            }

            const [, key, value] = match;
            if (key === name) {
                return toSafeString(value);
            }
        }
    } catch {
        return '';
    }

    return '';
};

const resolveGeminiApiKey = () => toSafeString(process.env.GEMINI_API_KEY) || readEnvValueFromBackendFile('GEMINI_API_KEY');

const resolveGeminiModel = () => toSafeString(process.env.GEMINI_MODEL) || readEnvValueFromBackendFile('GEMINI_MODEL') || DEFAULT_MODEL;

const resolveDailyRequestLimit = () => {
    const raw = toSafeString(process.env.GEMINI_DAILY_REQUEST_LIMIT) || readEnvValueFromBackendFile('GEMINI_DAILY_REQUEST_LIMIT');
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
        return DEFAULT_DAILY_REQUEST_LIMIT;
    }

    return Math.floor(value);
};

const resolveDailyTokenLimit = () => {
    const raw = toSafeString(process.env.GEMINI_DAILY_TOKEN_LIMIT) || readEnvValueFromBackendFile('GEMINI_DAILY_TOKEN_LIMIT');
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
        return null;
    }

    return Math.floor(value);
};

const resolveDayKey = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const ensureDailyUsageWindow = () => {
    const today = resolveDayKey();
    if (knowledgeQuizUsageState.dayKey === today) {
        return;
    }

    knowledgeQuizUsageState.dayKey = today;
    knowledgeQuizUsageState.dailyCalls = 0;
    knowledgeQuizUsageState.dailyPromptTokens = 0;
    knowledgeQuizUsageState.dailyCandidateTokens = 0;
    knowledgeQuizUsageState.dailyTotalTokens = 0;
    persistUsageState();
};

const pushUsageHistory = (entry) => {
    knowledgeQuizUsageState.recentCalls.unshift(entry);
    if (knowledgeQuizUsageState.recentCalls.length > MAX_USAGE_HISTORY) {
        knowledgeQuizUsageState.recentCalls = knowledgeQuizUsageState.recentCalls.slice(0, MAX_USAGE_HISTORY);
    }
};

const readUsageMetadata = (payload) => {
    const usage = payload?.usageMetadata && typeof payload.usageMetadata === 'object'
        ? payload.usageMetadata
        : {};

    const promptTokens = Number.isFinite(Number(usage.promptTokenCount)) ? Number(usage.promptTokenCount) : 0;
    const candidateTokens = Number.isFinite(Number(usage.candidatesTokenCount)) ? Number(usage.candidatesTokenCount) : 0;
    const totalTokens = Number.isFinite(Number(usage.totalTokenCount))
        ? Number(usage.totalTokenCount)
        : (promptTokens + candidateTokens);

    return {
        promptTokens,
        candidateTokens,
        totalTokens
    };
};

const recordKnowledgeQuizUsage = ({
    ok,
    model,
    promptTokens = 0,
    candidateTokens = 0,
    totalTokens = 0,
    errorCode = '',
    errorMessage = ''
}) => {
    ensureDailyUsageWindow();

    knowledgeQuizUsageState.totalCalls += 1;
    knowledgeQuizUsageState.lastCallAt = new Date().toISOString();
    knowledgeQuizUsageState.dailyCalls += 1;

    if (ok) {
        knowledgeQuizUsageState.successCalls += 1;
        knowledgeQuizUsageState.totalPromptTokens += promptTokens;
        knowledgeQuizUsageState.totalCandidateTokens += candidateTokens;
        knowledgeQuizUsageState.totalTokens += totalTokens;
        knowledgeQuizUsageState.dailyPromptTokens += promptTokens;
        knowledgeQuizUsageState.dailyCandidateTokens += candidateTokens;
        knowledgeQuizUsageState.dailyTotalTokens += totalTokens;
        knowledgeQuizUsageState.lastError = '';
    } else {
        knowledgeQuizUsageState.failedCalls += 1;
        knowledgeQuizUsageState.lastError = toSafeString(errorMessage || errorCode || 'Erreur inconnue');
    }

    pushUsageHistory({
        at: knowledgeQuizUsageState.lastCallAt,
        ok: Boolean(ok),
        model: toSafeString(model) || DEFAULT_MODEL,
        promptTokens,
        candidateTokens,
        totalTokens,
        errorCode: toSafeString(errorCode),
        errorMessage: toSafeString(errorMessage)
    });

    persistUsageState();
};

export const getKnowledgeQuizUsageSummary = () => {
    ensureDailyUsageWindow();

    const dailyRequestLimit = resolveDailyRequestLimit();
    const dailyTokenLimit = resolveDailyTokenLimit();
    const remainingDailyCalls = Math.max(0, dailyRequestLimit - knowledgeQuizUsageState.dailyCalls);
    const remainingDailyTokens = Number.isInteger(dailyTokenLimit)
        ? Math.max(0, dailyTokenLimit - knowledgeQuizUsageState.dailyTotalTokens)
        : null;

    return {
        totalCalls: knowledgeQuizUsageState.totalCalls,
        successCalls: knowledgeQuizUsageState.successCalls,
        failedCalls: knowledgeQuizUsageState.failedCalls,
        totalPromptTokens: knowledgeQuizUsageState.totalPromptTokens,
        totalCandidateTokens: knowledgeQuizUsageState.totalCandidateTokens,
        totalTokens: knowledgeQuizUsageState.totalTokens,
        dayKey: knowledgeQuizUsageState.dayKey,
        dailyCalls: knowledgeQuizUsageState.dailyCalls,
        dailyPromptTokens: knowledgeQuizUsageState.dailyPromptTokens,
        dailyCandidateTokens: knowledgeQuizUsageState.dailyCandidateTokens,
        dailyTotalTokens: knowledgeQuizUsageState.dailyTotalTokens,
        dailyRequestLimit,
        dailyTokenLimit,
        remainingDailyCalls,
        remainingDailyTokens,
        lastCallAt: knowledgeQuizUsageState.lastCallAt,
        lastError: knowledgeQuizUsageState.lastError,
        recentCalls: knowledgeQuizUsageState.recentCalls.map((entry) => ({ ...entry }))
    };
};

const normalizeTitle = (value) =>
    toSafeString(value)
        .replace(/\s+/g, ' ')
        .toLowerCase();

const dedupeVisitedArticles = (items = []) => {
    const seen = new Set();
    const cleaned = [];

    items.forEach((item) => {
        const title = toSafeString(item?.title);
        const snippet = toSafeString(item?.snippet).slice(0, 500);
        const key = normalizeTitle(title);

        if (!title || !key || seen.has(key)) {
            return;
        }

        seen.add(key);
        cleaned.push({
            title,
            snippet
        });
    });

    return cleaned;
};

const buildPrompt = ({ startArticle, targetArticle, questionCount, visitedArticles, language }) => {
    const outputLanguage = QUIZ_LANGUAGE_NAMES[String(language || '').toLowerCase()] || QUIZ_LANGUAGE_NAMES.fr;
    const context = visitedArticles
        .map((item, index) => {
            const snippetText = item.snippet || 'Aucun extrait disponible.';
            return `${index + 1}. Titre: ${item.title}\nExtrait: ${snippetText}`;
        })
        .join('\n\n');

    return [
        'Tu es un generateur de quiz pour un jeu de navigation Wikipedia.',
        `Tu dois produire exactement des QCM difficiles en ${outputLanguage}, en te basant uniquement sur les extraits fournis.`,
        'Regles strictes:',
        `- Retourne exactement ${questionCount} questions.`,
        '- Format JSON strict, sans markdown, sans commentaire, sans texte hors JSON.',
        '- Chaque question a exactement 4 choix.',
        '- Une seule bonne reponse par question.',
        '- Les fausses reponses doivent etre plausibles, proches lexicalement, et piegeuses.',
        '- Ne pas inventer de fait non present dans les extraits.',
        '- Interdit: questions de culture generale non necessaires a la lecture des extraits.',
        '- Chaque question doit pouvoir etre resolue en se souvenant d une phrase ou d un detail exact lu.',
        '- Cible des details concrets: formulations, roles precis, notions distinguees dans les extraits.',
        '- Ajouter une citation courte exacte dans sourceQuote (5 a 18 mots), issue des extraits fournis.',
        '- Varier les formulations pour eviter les questions repetitives.',
        '',
        'Schema JSON attendu:',
        '{"questions":[{"question":"...","choices":["A","B","C","D"],"answerIndex":0,"sourceTitle":"...","sourceQuote":"..."}]}',
        '',
        `Contexte de partie: depart="${startArticle}", cible="${targetArticle}".`,
        'Articles intermediaires visites:',
        context
    ].join('\n');
};

const parseQuizResponse = (payload, questionCount) => {
    const candidates = [];

    const directText = payload?.candidates?.[0]?.content?.parts
        ?.map((part) => toSafeString(part?.text))
        .filter(Boolean)
        .join('\n') || '';
    if (directText) {
        candidates.push(directText);
    }

    const fencedMatch = directText.match(/```json\s*([\s\S]*?)\s*```/i);
    if (fencedMatch?.[1]) {
        candidates.push(fencedMatch[1]);
    }

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            const questions = Array.isArray(parsed?.questions) ? parsed.questions : [];
            const normalized = questions
                .map((item) => {
                    const question = toSafeString(item?.question);
                    const choices = Array.isArray(item?.choices)
                        ? item.choices.map((choice) => toSafeString(choice)).filter(Boolean)
                        : [];
                    const answerIndex = Number.isInteger(item?.answerIndex) ? item.answerIndex : -1;
                    const sourceTitle = toSafeString(item?.sourceTitle);
                    const sourceQuote = toSafeString(item?.sourceQuote);

                    if (!question || choices.length !== 4 || answerIndex < 0 || answerIndex > 3 || !sourceQuote) {
                        return null;
                    }

                    return {
                        question,
                        choices,
                        answerIndex,
                        sourceTitle,
                        sourceQuote
                    };
                })
                .filter(Boolean)
                .slice(0, questionCount);

            if (normalized.length === questionCount) {
                return normalized;
            }
        } catch {
            // Ignore invalid JSON candidates.
        }
    }

    throw new KnowledgeQuizError('Reponse IA invalide', {
        code: 'GEMINI_INVALID_RESPONSE',
        status: 502
    });
};

const parseGeminiResponsePayload = async (response) => {
    const raw = await response.text();

    if (!raw) {
        return {};
    }

    try {
        return JSON.parse(raw);
    } catch {
        throw new KnowledgeQuizError('Reponse Gemini non JSON', {
            code: 'GEMINI_NON_JSON_RESPONSE',
            status: 502
        });
    }
};

export const generateKnowledgeQuiz = async ({
    startArticle,
    targetArticle,
    visitedArticles,
    language = 'fr',
    questionCount = DEFAULT_QUESTION_COUNT
}) => {
    const apiKey = resolveGeminiApiKey();
    if (!apiKey) {
        throw new KnowledgeQuizError('Configuration Gemini manquante', {
            code: 'GEMINI_CONFIG_MISSING',
            status: 503
        });
    }

    const model = resolveGeminiModel();
    const safeQuestionCount = Number.isInteger(questionCount)
        ? Math.max(1, Math.min(questionCount, DEFAULT_QUESTION_COUNT))
        : DEFAULT_QUESTION_COUNT;
    const cleanedVisitedArticles = dedupeVisitedArticles(visitedArticles).slice(0, 8);

    if (!cleanedVisitedArticles.length) {
        throw new KnowledgeQuizError('Aucun article intermediaire exploitable', {
            code: 'KNOWLEDGE_CONTEXT_EMPTY',
            status: 400
        });
    }

    const prompt = buildPrompt({
        startArticle,
        targetArticle,
        questionCount: safeQuestionCount,
        visitedArticles: cleanedVisitedArticles,
        language
    });

    let lastError = null;
    for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt += 1) {
        try {
            const response = await fetch(
                `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    signal: AbortSignal.timeout(GEMINI_REQUEST_TIMEOUT_MS),
                    body: JSON.stringify({
                        contents: [
                            {
                                role: 'user',
                                parts: [{ text: prompt }]
                            }
                        ],
                        generationConfig: {
                            temperature: 0.35,
                            topP: 0.9,
                            maxOutputTokens: 1800,
                            responseMimeType: 'application/json',
                            responseSchema: QUIZ_RESPONSE_SCHEMA
                        }
                    })
                }
            );
            const payload = await parseGeminiResponsePayload(response);

            if (!response.ok) {
                const apiMessage = toSafeString(payload?.error?.message) || 'Erreur API Gemini';
                lastError = new KnowledgeQuizError(apiMessage, {
                    code: 'GEMINI_API_ERROR',
                    status: Number(response.status) || 502
                });
                if (attempt < GEMINI_MAX_ATTEMPTS && (response.status === 429 || response.status >= 500)) {
                    continue;
                }
                throw lastError;
            }

            const questions = parseQuizResponse(payload, safeQuestionCount);
            const usage = readUsageMetadata(payload);
            recordKnowledgeQuizUsage({
                ok: true,
                model,
                promptTokens: usage.promptTokens,
                candidateTokens: usage.candidateTokens,
                totalTokens: usage.totalTokens
            });
            return { questions, source: 'gemini', usage };
        } catch (error) {
            const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
            lastError = error instanceof KnowledgeQuizError
                ? error
                : new KnowledgeQuizError(
                    timedOut ? 'Gemini ne répond pas dans le délai prévu' : 'Gemini est temporairement inaccessible',
                    {
                        code: timedOut ? 'GEMINI_TIMEOUT' : 'GEMINI_NETWORK_ERROR',
                        status: 503
                    }
                );

            if (attempt < GEMINI_MAX_ATTEMPTS) {
                continue;
            }
        }
    }

    recordKnowledgeQuizUsage({
        ok: false,
        model,
        errorCode: lastError?.code || 'KNOWLEDGE_QUIZ_ERROR',
        errorMessage: lastError?.message || 'Impossible de generer le quiz'
    });
    throw lastError;
};

export { KnowledgeQuizError };
