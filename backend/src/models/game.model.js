import crypto from 'crypto';
import { query } from '../config/db.js';

const GAME_MODES = new Set(['normal', 'knowledge', 'chrono']);

const CREATE_GAMES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS games (
  id INT NOT NULL AUTO_INCREMENT,
  code VARCHAR(12) NOT NULL,
  title VARCHAR(255) NOT NULL,
  start_article VARCHAR(255) NOT NULL,
  target_article VARCHAR(255) NOT NULL,
    mode ENUM('normal','knowledge','chrono') NOT NULL DEFAULT 'normal',
  status ENUM('waiting','running','finished') NOT NULL DEFAULT 'waiting',
  created_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_games_code (code),
  KEY idx_games_created_by (created_by),
  CONSTRAINT fk_games_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
)
`;

const ENSURE_GAMES_MODE_ENUM_SQL = `
ALTER TABLE games
MODIFY COLUMN mode ENUM('normal','knowledge','chrono') NOT NULL DEFAULT 'normal'
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
        await query(ENSURE_GAMES_MODE_ENUM_SQL);
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
    },

    async findByCode(code) {
        await this.ensureTable();
        const sql = `
SELECT id, code, title, start_article, target_article, mode, status, created_by, created_at
FROM games
WHERE code = ?
LIMIT 1
`;

        const results = await query(sql, [String(code || '').trim().toUpperCase()]);
        return results[0] || null;
    }
};

// ─── GameResult model ─────────────────────────────────────────────────────────

const CREATE_GAME_RESULTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS \`game_results\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`game_id\` INT NOT NULL,
  \`user_id\` INT NOT NULL,
  \`mode\` ENUM('normal','knowledge','chrono') NOT NULL DEFAULT 'normal',
  \`clicks\` INT NOT NULL DEFAULT 0,
  \`time_seconds\` INT NOT NULL DEFAULT 0,
  \`score\` INT NOT NULL DEFAULT 0,
  \`knowledge_score\` INT DEFAULT NULL,
  \`won\` TINYINT(1) NOT NULL DEFAULT 0,
  \`played_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uniq_result_game_user\` (\`game_id\`, \`user_id\`),
  KEY \`idx_result_user\` (\`user_id\`),
  KEY \`idx_result_mode\` (\`mode\`),
  CONSTRAINT \`fk_result_game\` FOREIGN KEY (\`game_id\`) REFERENCES \`games\`(\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`fk_result_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export const GameResult = {
    async ensureTable() {
        try {
            console.log('[GameResult] Ensuring table exists...');
            await query(CREATE_GAME_RESULTS_TABLE_SQL);
            console.log('[GameResult] Table ensured successfully');
        } catch (error) {
            console.error('[GameResult] ensureTable error:', error.message);
            throw error;
        }
    },

    async submit({ gameId, userId, mode, clicks, timeSeconds, score, won }) {
        await this.ensureTable();
        const sql = `
INSERT INTO game_results (game_id, user_id, mode, clicks, time_seconds, score, won)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  clicks = VALUES(clicks),
  time_seconds = VALUES(time_seconds),
  score = VALUES(score),
  won = VALUES(won)
`;
        return query(sql, [gameId, userId, mode, clicks, timeSeconds, score, won ? 1 : 0]);
    },

    async updateKnowledgeScore({ gameId, userId, knowledgeScore }) {
        await this.ensureTable();
        const sql = `
UPDATE game_results
SET knowledge_score = ?
WHERE game_id = ? AND user_id = ?
`;
        return query(sql, [knowledgeScore, gameId, userId]);
    },

    async getByUser(userId, limit = 30) {
        await this.ensureTable();
        const limitNum = Math.max(1, Math.min(parseInt(limit) || 30, 1000)); // Clamp between 1 and 1000
        const sql = `
SELECT gr.id, gr.mode, gr.clicks, gr.time_seconds, gr.score, gr.knowledge_score, gr.won, gr.played_at,
       g.code, g.start_article, g.target_article
FROM game_results gr
JOIN games g ON g.id = gr.game_id
WHERE gr.user_id = ?
ORDER BY gr.played_at DESC
LIMIT ${limitNum}
`;
        try {
            console.log('[GameResult] Querying history for user:', userId);
            const results = await query(sql, [userId]);
            console.log('[GameResult] Got', results.length, 'results');
            return results;
        } catch (error) {
            console.error('[GameResult] getByUser error for user', userId, ':', error.message);
            console.error('[GameResult] SQL:', sql);
            console.error('[GameResult] Params:', [userId]);
            throw error;
        }
    },

    async getLeaderboard(mode = 'all', limit = 20) {
        await this.ensureTable();
        const limitNum = Math.max(1, Math.min(parseInt(limit) || 20, 1000));

        if (mode === 'chrono') {
            const sql = `
SELECT u.username,
       ROUND(AVG(gr.score), 2) AS avg_score,
       1600 AS elo
FROM game_results gr
JOIN users u ON u.id = gr.user_id
WHERE gr.won = 1 AND gr.mode = 'chrono'
GROUP BY gr.user_id, u.username
ORDER BY avg_score DESC
LIMIT ${limitNum}
`;
            return query(sql, []);
        }

        if (mode === 'knowledge') {
            const sql = `
SELECT u.username,
       ROUND(AVG(gr.knowledge_score * 100 + 500 - (gr.clicks * 50) - (gr.time_seconds / 4)), 2) AS avg_score,
       1600 AS elo
FROM game_results gr
JOIN users u ON u.id = gr.user_id
WHERE gr.won = 1 AND gr.mode = 'knowledge'
GROUP BY gr.user_id, u.username
ORDER BY avg_score DESC
LIMIT ${limitNum}
`;
            return query(sql, []);
        }

        if (mode === 'normal') {
            const sql = `
SELECT u.username,
       ROUND(AVG(1000 - (gr.clicks * 100) - (gr.time_seconds / 2)), 2) AS avg_score,
       1600 AS elo
FROM game_results gr
JOIN users u ON u.id = gr.user_id
WHERE gr.won = 1 AND gr.mode = 'normal'
GROUP BY gr.user_id, u.username
ORDER BY avg_score DESC
LIMIT ${limitNum}
`;
            return query(sql, []);
        }

        // Fallback for unknown modes
        return [];
    }
};

export default Game;
