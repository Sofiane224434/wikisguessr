#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:5000/api';
const IDENTIFIER = process.env.SMOKE_KNOWLEDGE_IDENTIFIER || process.env.SMOKE_ADMIN_IDENTIFIER || 'autotestquiz';
const PASSWORD = process.env.SMOKE_KNOWLEDGE_PASSWORD || process.env.SMOKE_ADMIN_PASSWORD || 'Test1234!';
const MAX_STEPS = Number(process.env.SMOKE_KNOWLEDGE_MAX_STEPS || 10);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = process.env.SMOKE_KNOWLEDGE_OUTPUT_FILE
    ? resolve(process.cwd(), process.env.SMOKE_KNOWLEDGE_OUTPUT_FILE)
    : resolve(SCRIPT_DIR, 'smoke-knowledge-last.txt');

const log = (message) => console.log(`KNOWLEDGE SIM: ${message}`);
const fail = (message) => {
    console.error(`KNOWLEDGE SIM KO: ${message}`);
    process.exit(1);
};

const api = async (path, { method = 'GET', token, body } = {}) => {
    const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(`${method} ${path} -> ${data?.error || response.status}`);
    }
    return data;
};

const extractFirstLinks = (html, maxLinks) => {
    const source = String(html || '');
    const links = [];
    const seen = new Set();
    const addLink = (raw) => {
        const rawTitle = decodeURIComponent(String(raw || '')).replace(/_/g, ' ').trim();
        const key = rawTitle.toLowerCase();

        if (!rawTitle || rawTitle.includes(':') || /^Q\d+$/i.test(rawTitle) || seen.has(key)) {
            return;
        }

        seen.add(key);
        links.push(rawTitle);
    };

    const wikiRegex = /href=["']\/wiki\/([^"'#?]+)["']/gi;
    let match;
    while ((match = wikiRegex.exec(source)) !== null && links.length < maxLinks) {
        addLink(match[1]);
    }

    const mobileRegex = /href=["']\/api\/wiki\/mobile-html\?title=([^"'#&]+)["']/gi;
    while ((match = mobileRegex.exec(source)) !== null && links.length < maxLinks) {
        addLink(match[1]);
    }

    return links;
};

const toSnippet = (html) => String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 260);

const run = async () => {
    log(`Base URL ${BASE_URL}`);
    log(`Login avec ${IDENTIFIER}`);

    const login = await api('/auth/login', {
        method: 'POST',
        body: {
            identifier: IDENTIFIER,
            password: PASSWORD
        }
    });

    const token = login?.token;
    if (!token) {
        fail('Login sans token');
    }

    let game = null;
    let firstLinks = [];

    for (let attempt = 1; attempt <= 5; attempt += 1) {
        const created = await api('/games', {
            method: 'POST',
            token,
            body: {
                mode: 'knowledge',
                title: 'Simulation CLI Knowledge'
            }
        });

        const gameCode = created?.game?.code;
        if (!gameCode) {
            fail('Creation de partie knowledge sans code');
        }

        const gameData = await api(`/games/by-code/${encodeURIComponent(gameCode)}`, { token });
        const candidateGame = gameData?.game;
        if (!candidateGame) {
            fail('Partie introuvable juste apres creation');
        }

        const startArticle = await api(`/wiki/mobile-html?title=${encodeURIComponent(candidateGame.start_article)}`);
        const candidateLinks = extractFirstLinks(startArticle?.html || '', MAX_STEPS);

        if (candidateLinks.length > 0) {
            game = candidateGame;
            firstLinks = candidateLinks;
            break;
        }

        log(`Tentative ${attempt}: depart sans liens jouables (${candidateGame.start_article}), nouvelle partie...`);
    }

    if (!game || firstLinks.length === 0) {
        fail('Impossible de trouver une partie knowledge avec des liens jouables apres 5 tentatives');
    }

    log(`Partie ${game.code} | Depart=${game.start_article} | Cible=${game.target_article}`);

    const pathTitles = [game.start_article];
    const visitedArticles = [];

    for (let index = 0; index < firstLinks.length; index += 1) {
        const linkTitle = firstLinks[index];
        const linkedArticle = await api(`/wiki/mobile-html?title=${encodeURIComponent(linkTitle)}`);
        const resolvedTitle = String(linkedArticle?.title || linkTitle).trim();
        const snippet = toSnippet(linkedArticle?.html || '');

        visitedArticles.push({
            title: resolvedTitle,
            snippet
        });

        pathTitles.push(resolvedTitle);
        log(`Lien ${index + 1}: ${resolvedTitle}`);
    }

    pathTitles.push(game.target_article);

    log('Parcours simule:');
    console.log(pathTitles.join(' -> '));

    const quizData = await api(`/games/${encodeURIComponent(game.code)}/knowledge-quiz`, {
        method: 'POST',
        token,
        body: {
            visitedArticles
        }
    });

    const questions = Array.isArray(quizData?.quiz?.questions) ? quizData.quiz.questions : [];
    if (!questions.length) {
        fail('Aucune question retournee');
    }

    console.log('\n=== QUESTIONS IA (KNOWLEDGE) ===');
    questions.forEach((question, questionIndex) => {
        console.log(`\nQ${questionIndex + 1}. ${question.question}`);
        (question.choices || []).forEach((choice, choiceIndex) => {
            console.log(`  ${choiceIndex + 1}) ${choice}`);
        });
        if (question.sourceQuote) {
            console.log(`  sourceQuote: "${question.sourceQuote}"`);
        }
        if (Number.isInteger(question.answerIndex) && question.choices?.[question.answerIndex]) {
            console.log(`  reponse attendue: ${question.choices[question.answerIndex]}`);
        }
    });

    const reportLines = [
        `Knowledge quiz smoke report`,
        `generatedAt=${new Date().toISOString()}`,
        `baseUrl=${BASE_URL}`,
        `identifier=${IDENTIFIER}`,
        `gameCode=${game.code}`,
        `start=${game.start_article}`,
        `target=${game.target_article}`,
        '',
        'pathTitles:',
        ...pathTitles.map((title, index) => `${index + 1}. ${title}`),
        '',
        'questions:'
    ];

    questions.forEach((question, questionIndex) => {
        reportLines.push('');
        reportLines.push(`Q${questionIndex + 1}. ${question.question || ''}`);
        (question.choices || []).forEach((choice, choiceIndex) => {
            reportLines.push(`  ${choiceIndex + 1}) ${choice}`);
        });
        if (question.sourceQuote) {
            reportLines.push(`  sourceQuote: "${question.sourceQuote}"`);
        }
        if (Number.isInteger(question.answerIndex) && question.choices?.[question.answerIndex]) {
            reportLines.push(`  expected: ${question.choices[question.answerIndex]}`);
        }
    });

    await writeFile(OUTPUT_FILE, `${reportLines.join('\n')}\n`, 'utf8');
    log(`Quiz enregistre dans ${OUTPUT_FILE}`);

    console.log('\nKNOWLEDGE SIM SUCCESS');
};

run().catch((error) => {
    fail(error.message || String(error));
});
