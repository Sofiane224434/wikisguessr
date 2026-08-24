import GameRoom from '../models/game-room.model.js';
import Friend from '../models/friend.model.js';
import { createSharedGame } from './game.controller.js';

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
        room.leftRoomIds.forEach((leftRoomId) => {
            req.app.locals.io?.to(`room:${leftRoomId}`).emit('room:updated', { roomId: leftRoomId });
        });
        req.app.locals.io?.to(`room:${room.id}`).emit('room:updated', { roomId: room.id });

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

        const result = await GameRoom.leave(req.user.id, roomId);
        req.app.locals.io?.to(`room:${roomId}`).emit(result.closed ? 'room:closed' : 'room:updated', { roomId });

        return res.json({ ok: true, ...result });
    } catch (error) {
        console.error('leaveRoom error:', error);
        if (error.status === 400) {
            return res.status(400).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Impossible de quitter le salon' });
    }
};

export const inviteFriendToRoom = async (req, res) => {
    try {
        const roomId = Number(req.body?.roomId);
        const friendId = Number(req.body?.friendId);
        if (!Number.isInteger(roomId) || !Number.isInteger(friendId)) {
            return res.status(400).json({ error: 'Salon ou ami invalide' });
        }
        if (!(await Friend.areFriends(req.user.id, friendId))) {
            return res.status(403).json({ error: 'Vous pouvez inviter uniquement vos amis' });
        }
        const invitationId = await GameRoom.createInvitation(roomId, req.user.id, friendId);
        req.app.locals.io?.to(`user:${friendId}`).emit('room:invited', { invitationId, roomId });
        return res.status(201).json({ ok: true, invitationId });
    } catch (error) {
        console.error('inviteFriendToRoom error:', error);
        return res.status(error.status || 500).json({ error: error.message || 'Impossible d\'inviter cet ami' });
    }
};

export const getRoomInvitations = async (req, res) => {
    try {
        const invitations = await GameRoom.getInvitations(req.user.id);
        return res.json({ invitations });
    } catch (error) {
        console.error('getRoomInvitations error:', error);
        return res.status(500).json({ error: 'Impossible de récupérer les invitations' });
    }
};

export const respondToRoomInvitation = async (req, res) => {
    try {
        const invitationId = Number(req.params.invitationId);
        const result = await GameRoom.respondToInvitation(req.user.id, invitationId, req.body?.accept === true);
        if (result.accepted) {
            result.leftRoomIds.forEach((leftRoomId) => {
                req.app.locals.io?.to(`room:${leftRoomId}`).emit('room:updated', { roomId: leftRoomId });
            });
            req.app.locals.io?.to(`room:${result.roomId}`).emit('room:updated', { roomId: result.roomId });
        }
        return res.json({ ok: true, ...result });
    } catch (error) {
        console.error('respondToRoomInvitation error:', error);
        return res.status(error.status || 500).json({ error: error.message || 'Impossible de traiter l\'invitation' });
    }
};

export const startRoomGame = async (req, res) => {
    try {
        const roomId = Number(req.params.roomId);
        const room = await GameRoom.getById(roomId);
        if (!room) {
            return res.status(404).json({ error: 'Salon introuvable' });
        }
        if (room.owner_id !== req.user.id) {
            return res.status(403).json({ error: 'Seul l\'hôte peut lancer la partie' });
        }
        const members = await GameRoom.getMembers(roomId);
        const playerIds = members.map(({ id }) => id);
        const game = await createSharedGame({
            mode: req.body?.mode,
            creatorId: req.user.id,
            creatorUsername: req.user.username,
            playerIds,
            roomId
        });
        req.app.locals.io?.to(`room:${roomId}`).emit('room:game-started', { game });
        return res.status(201).json({ game });
    } catch (error) {
        console.error('startRoomGame error:', error);
        return res.status(error.status || 500).json({
            error: error.message || 'Impossible de lancer la partie',
            code: error.code,
            subscription: error.subscription
        });
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
