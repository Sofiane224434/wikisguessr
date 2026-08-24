/**
 * Matchmaking Service
 * Manages player queues, matching, and timeout logic
 */

class MatchmakingService {
    constructor() {
        // Queue structure: { mode: { [userId]: {userId, username, avatarUrl, socketId, joinedAt} } }
        this.queues = {
            normal: {},
            chrono: {},
            knowledge: {}
        };
        
        // Timeouts to track pending searches
        this.searchTimeouts = new Map(); // userId -> timeoutId
        
    }

    /**
     * Add player to queue
     */
    joinQueue(userId, username, avatarUrl, socketId, mode) {
        if (!this.queues[mode]) {
            throw new Error(`Mode invalide: ${mode}`);
        }

        // Remove from other queues if exists
        this.leaveAllQueues(userId);

        this.queues[mode][userId] = {
            userId,
            username,
            avatarUrl,
            socketId,
            joinedAt: Date.now()
        };

        console.log(`[Matchmaking] ${username} joined ${mode} queue. Queue size: ${Object.keys(this.queues[mode]).length}`);
    }

    /**
     * Remove player from queue
     */
    leaveQueue(userId, mode) {
        if (this.queues[mode] && this.queues[mode][userId]) {
            const player = this.queues[mode][userId];
            delete this.queues[mode][userId];
            console.log(`[Matchmaking] ${player.username} left ${mode} queue. Queue size: ${Object.keys(this.queues[mode]).length}`);
            return player;
        }
        return null;
    }

    /**
     * Remove player from all queues
     */
    leaveAllQueues(userId) {
        for (const mode of Object.keys(this.queues)) {
            this.leaveQueue(userId, mode);
        }
    }

    takePlayers(mode, count = 8) {
        const players = Object.values(this.queues[mode] || {}).slice(0, count);
        players.forEach(({ userId }) => {
            this.leaveQueue(userId, mode);
            this.clearTimeout(userId);
        });
        return players;
    }

    /**
     * Get queue size for a mode
     */
    getQueueSize(mode) {
        return Object.keys(this.queues[mode] || {}).length;
    }

    scheduleSolo(userId, mode, timeoutMs, onTimeout) {
        this.clearTimeout(userId);
        const timeoutId = setTimeout(() => {
            const player = this.leaveQueue(userId, mode);
            this.searchTimeouts.delete(userId);
            if (player) onTimeout(player);
        }, timeoutMs);
        this.searchTimeouts.set(userId, { timeoutId, mode });
    }

    clearTimeout(userId) {
        const stored = this.searchTimeouts.get(userId);
        if (stored) {
            globalThis.clearTimeout(stored.timeoutId);
            this.searchTimeouts.delete(userId);
        }
    }

    /**
     * Cancel active search for a player
     */
    cancelSearch(userId) {
        for (const mode of Object.keys(this.queues)) {
            if (this.queues[mode][userId]) {
                this.clearTimeout(userId);
                this.leaveQueue(userId, mode);
                return { mode };
            }
        }
        return null;
    }

    /**
     * Get all players in queue for a mode
     */
    getQueuePlayers(mode) {
        return Object.values(this.queues[mode] || {});
    }
}

export default new MatchmakingService();
