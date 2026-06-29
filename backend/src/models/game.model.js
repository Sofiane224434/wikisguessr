import crypto from 'crypto';
import { query } from '../config/db.js';

const GAME_MODES = new Set(['normal', 'knowledge']);

const CREATE_GAMES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS games (
  id INT NOT NULL AUTO_INCREMENT,
  code VARCHAR(12) NOT NULL,
  title VARCHAR(255) NOT NULL,
  start_article VARCHAR(255) NOT NULL,
  target_article VARCHAR(255) NOT NULL,
  mode ENUM('normal','knowledge') NOT NULL DEFAULT 'normal',
  status ENUM('waiting','running','finished') NOT NULL DEFAULT 'waiting',
  created_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_games_code (code),
  KEY idx_games_created_by (created_by),
  CONSTRAINT fk_games_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
)
`;

const normalizeMode = (mode) => (GAME_MODES.has(mode) ? mode : 'normal');

const generateCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  let code = '';

  for (let i = 0; i < bytes.length; i += 1) {
    code += alphabet[bytes[i] % alphabet.length];
  }

  return code;
};

const Game = {
  async ensureTable() {
    await query(CREATE_GAMES_TABLE_SQL);
  },

  async create({ title, startArticle, targetArticle, mode = 'normal', createdBy }) {
    await this.ensureTable();

    const safeMode = normalizeMode(mode);

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const code = generateCode();

      try {
        const sql = `
INSERT INTO games (code, title, start_article, target_article, mode, created_by)
VALUES (?, ?, ?, ?, ?, ?)
`;
        const result = await query(sql, [
          code,
          title,
          startArticle,
          targetArticle,
          safeMode,
          createdBy
        ]);

        return {
          id: result.insertId,
          code,
          title,
          start_article: startArticle,
          target_article: targetArticle,
          mode: safeMode,
          status: 'waiting',
          created_by: createdBy
        };
      } catch (error) {
        if (error && error.code === 'ER_DUP_ENTRY') {
          continue;
        }

        throw error;
      }
    }

    throw new Error('Impossible de generer un code de partie unique');
  },

  async listByCreator(createdBy) {
    await this.ensureTable();
    const sql = `
SELECT id, code, title, start_article, target_article, mode, status, created_at
FROM games
WHERE created_by = ?
ORDER BY created_at DESC
LIMIT 20
`;

    return query(sql, [createdBy]);
  }
};

export default Game;
