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
    joinQueue(userId, username, avatarUrl, socketId, mode, language = 'fr') {
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
            language,
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

    takePlayers(mode, count = 8, language = 'fr') {
        const players = Object.values(this.queues[mode] || {})
            .filter((player) => player.language === language)
            .slice(0, count);
        players.forEach(({ userId }) => {
            this.leaveQueue(userId, mode);
            this.clearTimeout(userId);
        });
        return players;
    }

    /**
     * Get queue size for a mode
     */
    getQueueSize(mode, language = 'fr') {
        return Object.values(this.queues[mode] || {}).filter((player) => player.language === language).length;
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
                const player = this.leaveQueue(userId, mode);
                return { mode, language: player.language };
            }
        }
        return null;
    }

    /**
     * Get all players in queue for a mode
     */
    getQueuePlayers(mode, language = 'fr') {
        return Object.values(this.queues[mode] || {}).filter((player) => player.language === language);
    }
}

export default new MatchmakingService();
