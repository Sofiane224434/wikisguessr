import Friend from '../models/friend.model.js';

export const addFriend = async (req, res) => {
    try {
        const { identifier } = req.body;

        if (!identifier || !identifier.trim()) {
            return res.status(400).json({ error: 'Identifiant requis (username ou email)' });
        }

        const request = await Friend.sendRequest(req.user.id, identifier.trim());
        req.app.locals.io?.to(`user:${request.recipient_id}`).emit('friend:request', { requestId: request.id });

        return res.json({
            ok: true,
            request
        });
    } catch (error) {
        console.error('addFriend error:', error);
        if (error.status === 404) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }
        if ([400, 404, 409].includes(error.status)) {
            return res.status(error.status).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Impossible d\'envoyer la demande' });
    }
};

export const getFriendRequests = async (req, res) => {
    try {
        const requests = await Friend.getIncomingRequests(req.user.id);
        return res.json({ requests });
    } catch (error) {
        console.error('getFriendRequests error:', error);
        return res.status(500).json({ error: 'Impossible de récupérer les demandes' });
    }
};

export const respondToFriendRequest = async (req, res) => {
    try {
        const requestId = Number(req.params.requestId);
        const accept = req.body?.accept === true;
        if (!Number.isInteger(requestId) || requestId <= 0) {
            return res.status(400).json({ error: 'Demande invalide' });
        }

        const result = await Friend.respondToRequest(req.user.id, requestId, accept);
        if (result.accepted) {
            req.app.locals.io?.to(`user:${result.friendId}`).emit('friend:updated');
            req.app.locals.io?.to(`user:${req.user.id}`).emit('friend:updated');
        }
        return res.json({ ok: true, ...result });
    } catch (error) {
        console.error('respondToFriendRequest error:', error);
        return res.status(error.status || 500).json({ error: error.message || 'Impossible de traiter la demande' });
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

export const getFriendsWithStatus = async (req, res) => {
    try {
        const friends = await Friend.getFriendsWithStatus(req.user.id);
        return res.json({ friends: friends || [] });
    } catch (error) {
        console.error('getFriendsWithStatus error:', error);
        return res.status(500).json({ error: 'Impossible de récupérer les amis' });
    }
};

export const updatePresence = async (req, res) => {
    try {
        await Friend.updateLastSeen(req.user.id);
        return res.json({ ok: true });
    } catch (error) {
        console.error('updatePresence error:', error);
        return res.status(500).json({ error: 'Impossible de mettre à jour la présence' });
    }
};
