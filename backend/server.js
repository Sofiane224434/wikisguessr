// server.js
import 'dotenv/config';
import { createServer } from 'http';
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

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: ['http://localhost:5173', 'http://localhost:3009'],
        credentials: true
    }
});
setupSocket(io);
const PORT = process.env.PORT || 5000;
// Connexion BDD
testConnection();
// Middlewares
app.use(cors({ 
    origin: ['http://localhost:5173', 'http://localhost:3009'], 
    credentials: true 
}));
app.use(express.json());
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
// 404
app.use((req, res) => res.status(404).json({ error: 'Route non trouvée' }));
// Démarrage
httpServer.listen(PORT, () => {
    console.log(`Serveur sur http://localhost:${PORT}`);
});