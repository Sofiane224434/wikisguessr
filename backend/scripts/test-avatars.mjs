import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import pool, { query } from '../src/config/db.js';

const marker = Date.now();
const result = await query(`
INSERT INTO users (username, email, email_verified, role, password)
VALUES (?, ?, 1, 'user', 'integration-test-only')
`, [`avatar_${marker}`, `avatar_${marker}@test.local`]);
const token = jwt.sign({ id: result.insertId }, process.env.JWT_SECRET, { expiresIn: '5m' });
let avatarUrl = null;

try {
    const png = await sharp({
        create: { width: 32, height: 32, channels: 3, background: '#2d6870' }
    }).png().toBuffer();
    const body = new FormData();
    body.append('avatar', new Blob([png], { type: 'image/png' }), 'avatar.png');

    const uploadResponse = await fetch('http://localhost:5000/api/auth/profile/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body
    });
    const uploadData = await uploadResponse.json();
    if (!uploadResponse.ok || !uploadData.user?.avatar_url) {
        throw new Error(uploadData.error || 'Upload avatar invalide');
    }
    avatarUrl = uploadData.user.avatar_url;

    const imageResponse = await fetch(`http://localhost:5000${avatarUrl}`);
    if (!imageResponse.ok || imageResponse.headers.get('content-type') !== 'image/webp') {
        throw new Error('Avatar WebP inaccessible');
    }

    const deleteResponse = await fetch('http://localhost:5000/api/auth/profile/avatar', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
    });
    const deleteData = await deleteResponse.json();
    if (!deleteResponse.ok || deleteData.user?.avatar_url !== null) {
        throw new Error(deleteData.error || 'Suppression avatar invalide');
    }
    avatarUrl = null;
    console.log('Upload, conversion WebP et suppression avatar: OK');
} finally {
    if (avatarUrl) {
        await fs.unlink(path.resolve('uploads', 'avatars', path.basename(avatarUrl))).catch(() => {});
    }
    await query('DELETE FROM users WHERE id = ?', [result.insertId]);
}

await pool.end();