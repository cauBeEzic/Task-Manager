const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const { ActionReceipt } = require('../db/models/action-receipt.model');
const { Task } = require('../db/models/task.model');

const listId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();

test('accepts a valid GeoJSON task location', () => {
    const task = new Task({
        title: 'Visit customer',
        _listId: listId,
        location: { type: 'Point', coordinates: [-123.1207, 49.2827] },
        geofenceRadiusMeters: 150,
        operationId: 'unique-create-operation'
    });

    assert.equal(task.validateSync(), undefined);
    assert.equal(task.syncVersion, 1);
    assert.equal(task.operationId, 'unique-create-operation');
});

test('rejects invalid coordinates and proximity radii', () => {
    const task = new Task({
        title: 'Invalid location',
        _listId: listId,
        location: { type: 'Point', coordinates: [250, 95] },
        geofenceRadiusMeters: 10
    });
    const error = task.validateSync();

    assert.ok(error);
    assert.ok(error.errors['location.coordinates']);
    assert.ok(error.errors.geofenceRadiusMeters);
});

test('creates a pending idempotency receipt with a seven-day expiry', () => {
    const before = Date.now() + (7 * 24 * 60 * 60 * 1000) - 1000;
    const receipt = new ActionReceipt({
        _userId: userId,
        operationId: 'operation-12345',
        method: 'PATCH',
        path: `/lists/${listId}/tasks/task-id`
    });
    const after = Date.now() + (7 * 24 * 60 * 60 * 1000) + 1000;

    assert.equal(receipt.validateSync(), undefined);
    assert.equal(receipt.state, 'pending');
    assert.ok(receipt.expiresAt.getTime() >= before);
    assert.ok(receipt.expiresAt.getTime() <= after);
});
