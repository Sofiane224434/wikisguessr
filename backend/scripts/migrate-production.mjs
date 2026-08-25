import 'dotenv/config';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';

const database = process.env.DB_NAME || 'wikisguessr';
const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database,
    multipleStatements: true
});

const requiredUserColumns = new Map([
    ['username_changed_at', 'TIMESTAMP NULL DEFAULT NULL'],
    ['email_verified', 'TINYINT(1) NOT NULL DEFAULT 1'],
    ['email_verification_token', 'VARCHAR(255) DEFAULT NULL'],
    ['email_verification_expires_at', 'DATETIME DEFAULT NULL'],
    ['password_reset_token', 'VARCHAR(255) DEFAULT NULL'],
    ['password_reset_expires_at', 'DATETIME DEFAULT NULL'],
    ['subscription_tier', "ENUM('free','silver','gold') NOT NULL DEFAULT 'free'"],
    ['subscription_expires_at', 'DATETIME DEFAULT NULL'],
    ['stripe_customer_id', 'VARCHAR(255) DEFAULT NULL'],
    ['stripe_subscription_id', 'VARCHAR(255) DEFAULT NULL'],
    ['stripe_subscription_status', 'VARCHAR(50) DEFAULT NULL'],
    ['avatar_url', 'VARCHAR(500) DEFAULT NULL'],
    ['last_seen', 'TIMESTAMP NULL DEFAULT NULL'],
    ['banned_at', 'TIMESTAMP NULL DEFAULT NULL'],
    ['elo', 'INT NOT NULL DEFAULT 1500']
]);

const requiredIndexes = new Map([
    ['uniq_users_stripe_customer', 'stripe_customer_id'],
    ['uniq_users_stripe_subscription', 'stripe_subscription_id']
]);

const requiredGameColumns = new Map([
    ['is_ranked', 'TINYINT(1) NOT NULL DEFAULT 1'],
    ['player_count', 'INT NOT NULL DEFAULT 1'],
    ['room_id', 'INT DEFAULT NULL'],
    ['wiki_lang', "VARCHAR(5) NOT NULL DEFAULT 'fr'"],
    ['elo_processed', 'TINYINT(1) NOT NULL DEFAULT 0']
]);

try {
    const schema = await fs.readFile(new URL('../schema.sql', import.meta.url), 'utf8');
    const tableStatements = schema.replace(
        /^CREATE DATABASE[^;]+;\s*USE[^;]+;\s*/i,
        ''
    );
    await connection.query(tableStatements);

    const [columnRows] = await connection.execute(
        'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        [database, 'users']
    );
    const existingColumns = new Set(columnRows.map(({ COLUMN_NAME }) => COLUMN_NAME));

    for (const [column, definition] of requiredUserColumns) {
        if (!existingColumns.has(column)) {
            await connection.query(`ALTER TABLE \`users\` ADD COLUMN \`${column}\` ${definition}`);
            console.log(`Colonne ajoutee: users.${column}`);
        }
    }

    await connection.query(
        "ALTER TABLE `users` MODIFY COLUMN `role` ENUM('user','moderator','admin') NOT NULL DEFAULT 'user'"
    );
    await connection.query(
        'ALTER TABLE `users` ALTER COLUMN `email_verified` SET DEFAULT 0'
    );

    const [indexRows] = await connection.execute(
        'SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        [database, 'users']
    );
    const existingIndexes = new Set(indexRows.map(({ INDEX_NAME }) => INDEX_NAME));

    for (const [index, column] of requiredIndexes) {
        if (!existingIndexes.has(index)) {
            await connection.query(`CREATE UNIQUE INDEX \`${index}\` ON \`users\` (\`${column}\`)`);
            console.log(`Index ajoute: users.${index}`);
        }
    }

    const [gameColumnRows] = await connection.execute(
        'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        [database, 'games']
    );
    const existingGameColumns = new Set(gameColumnRows.map(({ COLUMN_NAME }) => COLUMN_NAME));
    for (const [column, definition] of requiredGameColumns) {
        if (!existingGameColumns.has(column)) {
            await connection.query(`ALTER TABLE \`games\` ADD COLUMN \`${column}\` ${definition}`);
            console.log(`Colonne ajoutee: games.${column}`);
        }
    }

    console.log('Migration de production appliquee');
} finally {
    await connection.end();
}
