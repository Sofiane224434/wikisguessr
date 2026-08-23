import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';

const migrationName = process.argv[2];
if (!migrationName || !/^[a-zA-Z0-9_.-]+$/.test(migrationName)) {
    throw new Error('Nom de migration requis');
}

const sql = await fs.readFile(path.resolve('migrations', migrationName), 'utf8');
const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'wikisguessr',
    multipleStatements: true
});

try {
    await connection.query(sql);
    console.log(`Migration appliquee: ${migrationName}`);
} finally {
    await connection.end();
}