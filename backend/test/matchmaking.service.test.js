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

test('prend jusqu’à huit joueurs du même mode avec leur avatar', () => {
    matchmakingService.joinQueue(1, 'Alice', '/alice.webp', 'socket-1', 'normal');
    matchmakingService.joinQueue(2, 'Bob', null, 'socket-2', 'normal');

    const players = matchmakingService.takePlayers('normal');

    assert.deepEqual(players.map(({ userId }) => userId), [1, 2]);
    assert.equal(players[0].avatarUrl, '/alice.webp');
    assert.equal(matchmakingService.getQueueSize('normal'), 0);
});

test('déclenche uniquement le repli solo du joueur encore en file', async () => {
    matchmakingService.joinQueue(3, 'Chloé', null, 'socket-3', 'chrono');

    const player = await new Promise((resolve) => {
        matchmakingService.scheduleSolo(3, 'chrono', 5, resolve);
    });

    assert.equal(player.userId, 3);
    assert.equal(matchmakingService.getQueueSize('chrono'), 0);
});

test('annule le repli solo lorsqu’un joueur est apparié', async () => {
    matchmakingService.joinQueue(4, 'Dina', null, 'socket-4', 'knowledge');
    let timedOut = false;
    matchmakingService.scheduleSolo(4, 'knowledge', 5, () => {
        timedOut = true;
    });

    matchmakingService.takePlayers('knowledge', 1);
    await new Promise((resolve) => setTimeout(resolve, 15));

    assert.equal(timedOut, false);
});

test('annule une recherche même sans repli automatique planifié', () => {
    matchmakingService.joinQueue(5, 'Eli', null, 'socket-5', 'normal');

    assert.deepEqual(matchmakingService.cancelSearch(5), { mode: 'normal' });
    assert.equal(matchmakingService.getQueueSize('normal'), 0);
});