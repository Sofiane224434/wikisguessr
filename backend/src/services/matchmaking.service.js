/**
 * Matchmaking Service
 * Manages player queues, matching, and timeout logic
 */

class MatchmakingService {
    constructor() {
        // Queue structure: { mode: { [userId]: {userId, username, socketId, joinedAt} } }
        this.queues = {
            normal: {},
            chrono: {},
            knowledge: {}
        };

        // Timeouts to track pending searches
        this.searchTimeouts = new Map(); // userId -> timeoutId

        // Matches found (temporary storage before game room creation)
        this.pendingMatches = new Map(); // userId -> matchData
    }

    /**
     * Add player to queue
     */
    joinQueue(userId, username, socketId, mode) {
        if (!this.queues[mode]) {
            throw new Error(`Mode invalide: ${mode}`);
        }

        // Remove from other queues if exists
        this.leaveAllQueues(userId);

        this.queues[mode][userId] = {
            userId,
            username,
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

    /**
     * Get queue size for a mode
     */
    getQueueSize(mode) {
        return Object.keys(this.queues[mode] || {}).length;
    }

    /**
     * Process a queue after timeout
     * Returns: { realPlayers, bots }
     */
    processQueue(mode, maxBots = 4) {
        const queue = this.queues[mode] || {};
        const players = Object.values(queue);

        if (players.length === 0) {
            // No one in queue, return null for solo fallback
            return null;
        }

        if (players.length === 1) {
            // Only 1 player, fill with bots
            return {
                realPlayers: players,
                botCount: Math.min(3, maxBots - 1) // Max 4 total
            };
        }

        if (players.length >= 2 && players.length <= maxBots) {
            // 2-4 players, fill remaining with bots
            return {
                realPlayers: players,
                botCount: Math.max(0, maxBots - players.length)
            };
        }

        // Should not happen, but handle it
        return {
            realPlayers: players.slice(0, maxBots),
            botCount: 0
        };
    }

    /**
     * Start matchmaking timeout for a queue
     * After timeout, either creates match or sends to solo
     */
    startMatchmakingTimeout(mode, timeoutMs = 30000, onComplete) {
        // Clear any existing timeouts for this mode
        Object.keys(this.searchTimeouts).forEach(userId => {
            const stored = this.searchTimeouts.get(userId);
            if (stored && stored.mode === mode) {
                clearTimeout(stored.timeoutId);
                this.searchTimeouts.delete(userId);
            }
        });

        const timeoutId = setTimeout(() => {
            const match = this.processQueue(mode);

            // Get all players currently in queue
            const queuePlayers = Object.values(this.queues[mode] || {});

            // Clear queue after processing
            this.queues[mode] = {};

            // Notify callback with results
            if (onComplete) {
                onComplete({
                    mode,
                    match, // null = no one, or { realPlayers, botCount }
                    queuePlayers
                });
            }

            // Clean up timeout entries
            queuePlayers.forEach(p => {
                if (this.searchTimeouts.has(p.userId)) {
                    this.searchTimeouts.delete(p.userId);
                }
            });
        }, timeoutMs);

        // Store timeout for all players in queue
        Object.keys(this.queues[mode] || {}).forEach(userId => {
            this.searchTimeouts.set(userId, { timeoutId, mode });
        });

        return timeoutId;
    }

    /**
     * Cancel active search for a player
     */
    cancelSearch(userId) {
        if (this.searchTimeouts.has(userId)) {
            const stored = this.searchTimeouts.get(userId);
            clearTimeout(stored.timeoutId);
            this.searchTimeouts.delete(userId);

            // Leave queue
            this.leaveAllQueues(userId);
            return true;
        }
        return false;
    }

    /**
     * Get all players in queue for a mode
     */
    getQueuePlayers(mode) {
        return Object.values(this.queues[mode] || {});
    }
}

export default new MatchmakingService();
