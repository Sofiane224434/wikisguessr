import Friend from '../models/friend.model.js';

export const addFriend = async (req, res) => {
    try {
        const { identifier } = req.body;

        if (!identifier || !identifier.trim()) {
            return res.status(400).json({ error: 'Identifiant requis (username ou email)' });
        }

        const friend = await Friend.addFriend(req.user.id, identifier.trim());

        return res.json({
            ok: true,
            friend
        });
    } catch (error) {
        console.error('addFriend error:', error);
        if (error.status === 404) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }
        if (error.status === 400) {
            return res.status(400).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Impossible d\'ajouter l\'ami' });
    }
};

export const getFriends = async (req, res) => {
    try {
        const friends = await Friend.getFriends(req.user.id);
        return res.json({ friends: friends || [] });
    } catch (error) {
        console.error('getFriends error:', error);
        return res.status(500).json({ error: 'Impossible de récupérer les amis' });
    }
};

export const removeFriend = async (req, res) => {
    try {
        const { friendId } = req.body;

        if (!friendId) {
            return res.status(400).json({ error: 'ID ami requis' });
        }

        await Friend.removeFriend(req.user.id, friendId);

        return res.json({ ok: true });
    } catch (error) {
        console.error('removeFriend error:', error);
        return res.status(500).json({ error: 'Impossible de supprimer l\'ami' });
    }
};
