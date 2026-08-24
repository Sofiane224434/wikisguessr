// server.js
import 'dotenv/config';
import { createServer } from 'http';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { testConnection } from './src/config/db.js';
import { setupSocket } from './src/socket.js';
import authRoutes from './src/routes/auth.routes.js';
import emailRoutes from './src/routes/email.routes.js';
import gameRoutes from './src/routes/game.routes.js';
import gameRoomRoutes from './src/routes/game-room.routes.js';
import friendRoutes from './src/routes/friend.routes.js';
import roomMessageRoutes from './src/routes/room-message.routes.js';
import wikiRoutes from './src/routes/wiki.routes.js';
import siteStateRoutes from './src/routes/site-state.routes.js';
import reportRoutes from './src/routes/report.routes.js';
import matchmakingRoutes from './src/routes/matchmaking.routes.js';
import subscriptionRoutes from './src/routes/subscription.routes.js';
import { stripeWebhook } from './src/controllers/subscription.controller.js';

const app = express();
const httpServer = createServer(app);
const configuredOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
const allowedOrigins = [...new Set([
    ...configuredOrigins,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3009',
    'http://127.0.0.1:3009'
])];
const io = new Server(httpServer, {
    cors: {
        origin: allowedOrigins,
        credentials: true
    }
});
setupSocket(io);
// Store io instance for routes
app.locals.io = io;
const PORT = process.env.PORT || 5000;
// Connexion BDD
testConnection();
// Middlewares
app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));
app.post('/api/subscriptions/webhook', express.raw({ type: 'application/json' }), stripeWebhook);
app.use(express.json());
app.use('/uploads', express.static(path.resolve('uploads'), { maxAge: '7d', immutable: true }));
// Logger (dev)
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} | ${req.method} ${req.url}`);
        next();
    });
}
// Routes
app.get('/', (req, res) => {
    res.json({ message: 'WikisGuessr API (ES Modules)', status: 'online' });
});
app.use('/api/site-state', siteStateRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/game-rooms', gameRoomRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/room-messages', roomMessageRoutes);
app.use('/api/wiki', wikiRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/matchmaking', matchmakingRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
// 404
app.use((req, res) => res.status(404).json({ error: 'Route non trouvée' }));
// Démarrage
httpServer.listen(PORT, () => {
    console.log(`Serveur sur http://localhost:${PORT}`);
});