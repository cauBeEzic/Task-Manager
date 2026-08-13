const assert = require('node:assert/strict');
const test = require('node:test');
const { PENDING_RECEIPT_LEASE_MS, decideReceipt } = require('../idempotency');

const now = Date.parse('2026-01-01T00:01:00.000Z');

test('claims an operation with no existing receipt', () => {
    assert.deepEqual(decideReceipt(null, 'POST', '/tasks', now), { type: 'claim' });
});

test('rejects reuse of a key for a different action', () => {
    const receipt = { method: 'POST', path: '/tasks', state: 'pending', updatedAt: new Date(now) };
    assert.deepEqual(decideReceipt(receipt, 'PATCH', '/tasks/1', now), { type: 'conflict' });
});

test('replays the canonical confirmed response', () => {
    const receipt = {
        method: 'POST', path: '/tasks', state: 'confirmed', statusCode: 200,
        responseBody: { _id: 'task-1' }, updatedAt: new Date(now)
    };
    assert.deepEqual(decideReceipt(receipt, 'POST', '/tasks', now), {
        type: 'replay', statusCode: 200, responseBody: { _id: 'task-1' }
    });
});

test('asks concurrent callers to retry while the original lease is active', () => {
    const receipt = {
        method: 'POST', path: '/tasks', state: 'pending',
        updatedAt: new Date(now - PENDING_RECEIPT_LEASE_MS + 1)
    };
    assert.deepEqual(decideReceipt(receipt, 'POST', '/tasks', now), { type: 'pending' });
});

test('reclaims a receipt after a worker crash leaves its pending lease stale', () => {
    const receipt = {
        method: 'POST', path: '/tasks', state: 'pending',
        createdAt: new Date(now - PENDING_RECEIPT_LEASE_MS)
    };
    assert.deepEqual(decideReceipt(receipt, 'POST', '/tasks', now), { type: 'reclaim' });
});

test('reclaims legacy pending receipts that have no timestamps', () => {
    const receipt = { method: 'POST', path: '/tasks', state: 'pending' };
    assert.deepEqual(decideReceipt(receipt, 'POST', '/tasks', now), { type: 'reclaim' });
});
