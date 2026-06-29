import Game from '../models/game.model.js';

const parseText = (value) => String(value || '').trim();

export const createGame = async (req, res) => {
  try {
    const title = parseText(req.body.title) || `Partie de ${req.user.username}`;
    const startArticle = parseText(req.body.startArticle);
    const targetArticle = parseText(req.body.targetArticle);
    const mode = parseText(req.body.mode).toLowerCase() || 'normal';

    if (!startArticle || !targetArticle) {
      return res.status(400).json({ error: 'Articles de depart et cible requis' });
    }

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
