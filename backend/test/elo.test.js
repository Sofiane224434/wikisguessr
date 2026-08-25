import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateEloDeltas } from '../src/models/game.model.js';

test('répartit les variations Elo selon le classement sans créer de points', () => {
    const deltas = calculateEloDeltas([
        { user_id: 1, elo: 1500, won: 1, performance: 900 },
        { user_id: 2, elo: 1500, won: 1, performance: 700 },
        { user_id: 3, elo: 1500, won: 0, performance: 0 },
        { user_id: 4, elo: 1500, won: 0, performance: 0 }
    ]);

    assert.equal(deltas.reduce((sum, { delta }) => sum + delta, 0), 0);
    assert.ok(deltas[0].delta > deltas[1].delta);
    assert.ok(deltas[2].delta < 0);
});

test('récompense davantage une victoire contre un joueur mieux classé', () => {
    const upset = calculateEloDeltas([
        { user_id: 1, elo: 1300, won: 1, performance: 800 },
        { user_id: 2, elo: 1700, won: 0, performance: 200 }
    ]);

    assert.ok(upset[0].delta > 16);
    assert.equal(upset[0].delta + upset[1].delta, 0);
});