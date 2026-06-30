import Game from '../models/game.model.js';

const parseText = (value) => String(value || '').trim();

const DEFAULT_MATCHUPS = [
    { start: 'Paris', target: 'Tour Eiffel' },
    { start: 'Lion', target: 'Savane' },
    { start: 'Minecraft', target: 'Mojang Studios' },
    { start: 'Marseille', target: 'Mediterranee' },
    { start: 'Jupiter', target: 'Galilee' }
];

const pickRandomMatchup = () => {
    const index = Math.floor(Math.random() * DEFAULT_MATCHUPS.length);
    return DEFAULT_MATCHUPS[index];
};

export const createGame = async (req, res) => {
    try {
        const mode = parseText(req.body.mode).toLowerCase() || 'normal';
        const fallbackMatchup = pickRandomMatchup();
        const startArticle = parseText(req.body.startArticle) || fallbackMatchup.start;
        const targetArticle = parseText(req.body.targetArticle) || fallbackMatchup.target;
        const title = parseText(req.body.title) || `Partie ${mode} de ${req.user.username}`;

        if (startArticle.toLowerCase() === targetArticle.toLowerCase()) {
            return res.status(400).json({ error: 'Les articles de depart et cible doivent etre differents' });
        }

        const game = await Game.create({
            title,
            startArticle,
            targetArticle,
            mode,
            createdBy: req.user.id
        });

        return res.status(201).json({ game });
    } catch (error) {
        console.error('createGame error:', error);
        return res.status(500).json({ error: 'Impossible de creer la partie' });
    }
};

export const getMyGames = async (req, res) => {
    try {
        const games = await Game.listByCreator(req.user.id);
        return res.json({ games });
    } catch (error) {
        console.error('getMyGames error:', error);
        return res.status(500).json({ error: 'Impossible de recuperer les parties' });
    }
};

export const getGameByCode = async (req, res) => {
    try {
        const code = parseText(req.params.code).toUpperCase();

        if (!code) {
            return res.status(400).json({ error: 'Code de partie requis' });
        }

        const game = await Game.findByCode(code);

        if (!game) {
            return res.status(404).json({ error: 'Partie introuvable' });
        }

        return res.json({ game });
    } catch (error) {
        console.error('getGameByCode error:', error);
        return res.status(500).json({ error: 'Impossible de recuperer la partie' });
    }
};
