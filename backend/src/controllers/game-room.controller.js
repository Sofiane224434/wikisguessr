import GameRoom from '../models/game-room.model.js';

export const getMyRoom = async (req, res) => {
    try {
        const room = await GameRoom.getOrCreate(req.user.id);
        const members = await GameRoom.getMembers(room.id);

        return res.json({
            room: {
                id: room.id,
                code: room.code,
                owner_id: room.owner_id,
                created_at: room.created_at
            },
            members: members || []
        });
    } catch (error) {
        console.error('getMyRoom error:', error);
        return res.status(500).json({ error: 'Impossible de récupérer votre salon' });
    }
};

export const joinRoom = async (req, res) => {
    try {
        const { code } = req.body;

        if (!code || !code.trim()) {
            return res.status(400).json({ error: 'Code requis' });
        }

        const room = await GameRoom.joinByCode(req.user.id, code.toUpperCase().trim());
        const members = await GameRoom.getMembers(room.id);

        return res.json({
            room: {
                id: room.id,
                code: room.code,
                owner_id: room.owner_id,
                created_at: room.created_at
            },
            members: members || []
        });
    } catch (error) {
        console.error('joinRoom error:', error);
        if (error.status === 404) {
            return res.status(404).json({ error: 'Salon non trouvé' });
        }
        if (error.status === 400) {
            return res.status(400).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Impossible de rejoindre le salon' });
    }
};

export const leaveRoom = async (req, res) => {
    try {
        const { roomId } = req.body;

        if (!roomId) {
            return res.status(400).json({ error: 'ID du salon requis' });
        }

        await GameRoom.leave(req.user.id, roomId);

        return res.json({ ok: true });
    } catch (error) {
        console.error('leaveRoom error:', error);
        if (error.status === 400) {
            return res.status(400).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Impossible de quitter le salon' });
    }
};

export const getRoomInfo = async (req, res) => {
    try {
        const { code } = req.query;

        if (!code || !code.trim()) {
            return res.status(400).json({ error: 'Code requis' });
        }

        const room = await GameRoom.getByCode(code.toUpperCase().trim());

        if (!room) {
            return res.status(404).json({ error: 'Salon non trouvé' });
        }

        const members = await GameRoom.getMembers(room.id);

        return res.json({
            room: {
                id: room.id,
                code: room.code,
                owner_id: room.owner_id,
                owner_username: room.owner_username,
                created_at: room.created_at
            },
            members: members || []
        });
    } catch (error) {
        console.error('getRoomInfo error:', error);
        return res.status(500).json({ error: 'Impossible de récupérer les informations du salon' });
    }
};
