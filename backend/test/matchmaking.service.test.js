import assert from 'node:assert/strict';
import test from 'node:test';
import matchmakingService from '../src/services/matchmaking.service.js';

const resetQueues = () => {
    for (const mode of ['normal', 'chrono', 'knowledge']) {
        for (const player of matchmakingService.getQueuePlayers(mode)) {
            matchmakingService.cancelSearch(player.userId);
        }
    }
};

test.beforeEach(resetQueues);
test.afterEach(resetQueues);

test('prend immédiatement deux joueurs du même mode', () => {
    matchmakingService.joinQueue(1, 'Alice', 'socket-1', 'normal');
    matchmakingService.joinQueue(2, 'Bob', 'socket-2', 'normal');

    const players = matchmakingService.takePlayers('normal', 2);

    assert.deepEqual(players.map(({ userId }) => userId), [1, 2]);
    assert.equal(matchmakingService.getQueueSize('normal'), 0);
});

test('déclenche uniquement le repli solo du joueur encore en file', async () => {
    matchmakingService.joinQueue(3, 'Chloé', 'socket-3', 'chrono');

    const player = await new Promise((resolve) => {
        matchmakingService.scheduleSolo(3, 'chrono', 5, resolve);
    });

    assert.equal(player.userId, 3);
    assert.equal(matchmakingService.getQueueSize('chrono'), 0);
});

test('annule le repli solo lorsqu’un joueur est apparié', async () => {
    matchmakingService.joinQueue(4, 'Dina', 'socket-4', 'knowledge');
    let timedOut = false;
    matchmakingService.scheduleSolo(4, 'knowledge', 5, () => {
        timedOut = true;
    });

    matchmakingService.takePlayers('knowledge', 1);
    await new Promise((resolve) => setTimeout(resolve, 15));

    assert.equal(timedOut, false);
});