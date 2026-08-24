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
    is_ranked TINYINT(1) NOT NULL DEFAULT 1,
    player_count INT NOT NULL DEFAULT 1,
    room_id INT DEFAULT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_games_code (code),
  KEY idx_games_created_by (created_by),
  CONSTRAINT fk_games_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
)
`;

const CREATE_GAME_PLAYERS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS game_players (
    game_id INT NOT NULL,
    user_id INT NOT NULL,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (game_id, user_id),
    KEY idx_game_players_user (user_id),
    CONSTRAINT fk_game_players_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    CONSTRAINT fk_game_players_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
`;

const ENSURE_GAMES_MODE_ENUM_SQL = `
ALTER TABLE games
MODIFY COLUMN mode ENUM('normal','knowledge','chrono') NOT NULL DEFAULT 'normal'
`;

let gameSchemaReady = false;

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
        if (!gameSchemaReady) {
            const columns = await query('SHOW COLUMNS FROM games');
            const existing = new Set(columns.map(({ Field }) => Field));
            if (!existing.has('is_ranked')) {
                await query('ALTER TABLE games ADD COLUMN is_ranked TINYINT(1) NOT NULL DEFAULT 1 AFTER status');
            }
            if (!existing.has('player_count')) {
                await query('ALTER TABLE games ADD COLUMN player_count INT NOT NULL DEFAULT 1 AFTER is_ranked');
            }
            if (!existing.has('room_id')) {
                await query('ALTER TABLE games ADD COLUMN room_id INT DEFAULT NULL AFTER player_count');
            }
            await query(ENSURE_GAMES_MODE_ENUM_SQL);
            gameSchemaReady = true;
        }
        await query(CREATE_GAME_PLAYERS_TABLE_SQL);
    },

    async create({ title, startArticle, targetArticle, mode = 'normal', createdBy, playerIds = [], ranked = true, roomId = null }) {
        await this.ensureTable();

        const safeMode = normalizeMode(mode);

        for (let attempt = 0; attempt < 6; attempt += 1) {
            const code = generateCode();

            try {
                const sql = `
INSERT INTO games (code, title, start_article, target_article, mode, is_ranked, player_count, room_id, created_by)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;
                const uniquePlayerIds = [...new Set([createdBy, ...playerIds].map(Number).filter(Number.isInteger))];
                const result = await query(sql, [
                    code,
                    title,
                    startArticle,
                    targetArticle,
                    safeMode,
                    ranked ? 1 : 0,
                    uniquePlayerIds.length,
                    roomId,
                    createdBy
                ]);

                if (uniquePlayerIds.length > 0) {
                    const placeholders = uniquePlayerIds.map(() => '(?, ?)').join(', ');
                    await query(
                        `INSERT IGNORE INTO game_players (game_id, user_id) VALUES ${placeholders}`,
                        uniquePlayerIds.flatMap((playerId) => [result.insertId, playerId])
                    );
                }

                return {
                    id: result.insertId,
                    code,
                    title,
                    start_article: startArticle,
                    target_article: targetArticle,
                    mode: safeMode,
                    is_ranked: ranked ? 1 : 0,
                    player_count: uniquePlayerIds.length,
                    room_id: roomId,
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
SELECT id, code, title, start_article, target_article, mode, status, is_ranked, player_count, room_id, created_by, created_at
FROM games
WHERE code = ?
LIMIT 1
`;

        const results = await query(sql, [String(code || '').trim().toUpperCase()]);
        return results[0] || null;
    },

    async isParticipant(gameId, userId) {
        await this.ensureTable();
        const rows = await query(
            'SELECT 1 FROM game_players WHERE game_id = ? AND user_id = ? LIMIT 1',
            [gameId, userId]
        );
        return rows.length > 0;
    },

    async getParticipants(gameId) {
        await this.ensureTable();
        await GameResult.ensureTable();
        return query(`
SELECT u.id AS user_id, u.username, u.avatar_url,
       CASE WHEN gr.id IS NULL THEN 'playing' ELSE 'finished' END AS progress_status,
       gr.won, gr.clicks, gr.time_seconds, gr.score, gr.knowledge_score
FROM game_players gp
JOIN users u ON u.id = gp.user_id
LEFT JOIN game_results gr ON gr.game_id = gp.game_id AND gr.user_id = gp.user_id
WHERE gp.game_id = ?
ORDER BY gp.joined_at ASC
`, [gameId]);
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
JOIN games g ON g.id = gr.game_id
WHERE gr.won = 1 AND gr.mode = 'chrono'
    AND g.is_ranked = 1
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
JOIN games g ON g.id = gr.game_id
WHERE gr.won = 1 AND gr.mode = 'knowledge'
    AND g.is_ranked = 1
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
JOIN games g ON g.id = gr.game_id
WHERE gr.won = 1 AND gr.mode = 'normal'
    AND g.is_ranked = 1
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
