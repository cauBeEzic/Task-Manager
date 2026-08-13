import { List } from '../models/list.model';
import { PendingAction } from '../models/pending-action.model';
import { Task } from '../models/task.model';
import { OfflineDbService } from './offline-db.service';

describe('OfflineDbService user isolation', () => {
  let db: OfflineDbService;

  beforeEach(async () => {
    db = new OfflineDbService();
    await db.clearAll();
  });

  afterEach(async () => {
    await db.clearAll();
  });

  it('preserves cached data for the same user', async () => {
    await db.activateUser('user-a');
    await db.replaceLists([{ _id: 'list-a', title: 'Private list' } as List]);

    await db.activateUser('user-a');

    expect(db.getActiveUserId()).toBe('user-a');
    expect(await db.getLists()).toEqual([{ _id: 'list-a', title: 'Private list' } as List]);
  });

  it('clears an unscoped legacy cache before activating its first known user', async () => {
    await db.replaceLists([{ _id: 'legacy-list', title: 'Unknown owner' } as List]);

    await db.activateUser('user-a');

    expect(await db.getLists()).toEqual([]);
  });

  it('clears lists, tasks, and actions before activating a different user', async () => {
    const cachedTask: Task = {
      _id: 'task-a', _listId: 'list-a', title: 'Secret task', completed: false
    };
    const pendingAction: PendingAction = {
      operationId: 'operation-a', kind: 'UPDATE_TASK', listId: 'list-a', entityId: 'task-a',
      payload: { completed: true }, state: 'queued', attemptCount: 0, createdAt: new Date().toISOString()
    };
    await db.activateUser('user-a');
    await db.replaceLists([{ _id: 'list-a', title: 'Private list' } as List]);
    await db.putTask(cachedTask);
    await db.putAction(pendingAction);

    await db.activateUser('user-b');

    expect(db.getActiveUserId()).toBe('user-b');
    expect(await db.getLists()).toEqual([]);
    expect(await db.getAllTasks()).toEqual([]);
    expect(await db.getActions()).toEqual([]);
  });

  it('shows a failed optimistic deletion again during server reconciliation', async () => {
    const deletedTask: Task = {
      _id: 'task-a', _listId: 'list-a', title: 'Restore me', completed: false
    };
    await db.putAction({
      operationId: 'delete-a', kind: 'DELETE_TASK', listId: 'list-a', entityId: 'task-a', payload: {},
      state: 'failed', attemptCount: 1, createdAt: new Date().toISOString(), lastError: 'Rejected', snapshot: deletedTask
    });

    const merged = await db.mergeServerTasks('list-a', [deletedTask]);

    expect(merged).toEqual([jasmine.objectContaining({
      _id: 'task-a', _syncState: 'failed', _syncError: 'Rejected'
    })]);
  });

  it('reconciles pending deletes and pending updates from server and local records', async () => {
    const localOnly: Task = {
      _id: 'local-only', _listId: 'list-a', title: 'Local', completed: false
    };
    await db.putTask(localOnly);
    const actions: PendingAction[] = [
      {
        operationId: 'delete-pending', kind: 'DELETE_TASK', listId: 'list-a', entityId: 'delete-me',
        payload: {}, state: 'pending', attemptCount: 1, createdAt: '2026-01-01T00:00:00.000Z'
      },
      {
        operationId: 'update-server', kind: 'UPDATE_TASK', listId: 'list-a', entityId: 'server-task',
        payload: { completed: true }, state: 'retrying', attemptCount: 1, createdAt: '2026-01-01T00:00:01.000Z'
      },
      {
        operationId: 'update-local', kind: 'UPDATE_TASK', listId: 'list-a', entityId: 'local-only',
        payload: { title: 'Edited offline' }, state: 'queued', attemptCount: 0, createdAt: '2026-01-01T00:00:02.000Z'
      },
      {
        operationId: 'update-missing', kind: 'UPDATE_TASK', listId: 'list-a', entityId: 'missing',
        payload: { title: 'Ignored' }, state: 'queued', attemptCount: 0, createdAt: '2026-01-01T00:00:03.000Z'
      }
    ];
    for (const queuedAction of actions) {
      await db.putAction(queuedAction);
    }

    const merged = await db.mergeServerTasks('list-a', [
      { _id: 'delete-me', _listId: 'list-a', title: 'Delete', completed: false },
      { _id: 'server-task', _listId: 'list-a', title: 'Server', completed: false }
    ]);

    expect(merged.find(item => item._id === 'delete-me')).toBeUndefined();
    expect(merged.find(item => item._id === 'server-task')).toEqual(jasmine.objectContaining({
      completed: true, _syncState: 'retrying'
    }));
    expect(merged.find(item => item._id === 'local-only')).toEqual(jasmine.objectContaining({
      title: 'Edited offline', _syncState: 'queued'
    }));
    expect(merged.find(item => item._id === 'missing')).toBeUndefined();
  });

  it('uses a failed delete snapshot when the server no longer returns the task', async () => {
    const snapshot: Task = {
      _id: 'deleted', _listId: 'list-a', title: 'Snapshot', completed: false
    };
    await db.putAction({
      operationId: 'failed-delete', kind: 'DELETE_TASK', listId: 'list-a', entityId: 'deleted',
      payload: {}, state: 'failed', attemptCount: 1, createdAt: '2026-01-01T00:00:00.000Z', snapshot
    });

    const merged = await db.mergeServerTasks('list-a', []);

    expect(merged).toEqual([jasmine.objectContaining({ _id: 'deleted', _syncState: 'failed' })]);
  });

  it('reads and deletes individual tasks and actions and emits changes', async () => {
    const changes: unknown[] = [];
    db.changes$.subscribe(change => changes.push(change));
    const storedTask: Task = {
      _id: 'task-a', _listId: 'list-a', title: 'Stored', completed: false
    };
    await db.putTask(storedTask);
    await db.putAction({
      operationId: 'action-a', kind: 'UPDATE_TASK', listId: 'list-a', entityId: 'task-a',
      payload: {}, state: 'queued', attemptCount: 0, createdAt: '2026-01-01T00:00:00.000Z'
    });

    expect(await db.getTask('task-a')).toEqual(storedTask);
    await db.deleteTask('task-a', 'list-a');
    await db.deleteAction('action-a');

    expect(await db.getTask('task-a')).toBeUndefined();
    expect(changes).toContain(jasmine.objectContaining({ type: 'tasks', listId: 'list-a' }));
    expect(changes).toContain(jasmine.objectContaining({ type: 'actions' }));
  });
});

describe('OfflineDbService error propagation', () => {
  const failingRequest = (error: Error): IDBRequest => {
    const request: any = { error };
    Object.defineProperty(request, 'onsuccess', { set: () => undefined });
    Object.defineProperty(request, 'onerror', { set: (handler: () => void) => handler() });
    return request as IDBRequest;
  };

  const failingTransaction = (error: Error, stores: Record<string, any> = {}): IDBTransaction => {
    const transaction: any = {
      error,
      objectStore: (name: string) => stores[name] || { clear: () => undefined, put: () => undefined, delete: () => undefined }
    };
    Object.defineProperty(transaction, 'oncomplete', { set: () => undefined });
    Object.defineProperty(transaction, 'onerror', { set: (handler: () => void) => handler() });
    return transaction as IDBTransaction;
  };

  it('rejects when opening IndexedDB fails', async () => {
    const error = new Error('open failed');
    const request: any = { error };
    Object.defineProperty(request, 'onerror', { set: (handler: () => void) => handler() });
    Object.defineProperty(request, 'onsuccess', { set: () => undefined });
    Object.defineProperty(request, 'onupgradeneeded', { set: () => undefined });
    spyOn(indexedDB, 'open').and.returnValue(request);

    const failedDb = new OfflineDbService();

    await expectAsync((failedDb as any).dbPromise).toBeRejectedWith(error);
  });

  it('rejects an individual IndexedDB request error', async () => {
    const db = new OfflineDbService();
    await (db as any).dbPromise;
    const error = new Error('request failed');
    (db as any).dbPromise = Promise.resolve({
      transaction: () => ({ objectStore: () => ({ getAll: () => failingRequest(error) }) })
    });

    await expectAsync(db.getLists()).toBeRejectedWith(error);
  });

  it('rejects list replacement transaction errors', async () => {
    const db = new OfflineDbService();
    await (db as any).dbPromise;
    const error = new Error('replace failed');
    (db as any).dbPromise = Promise.resolve({ transaction: () => failingTransaction(error) });

    await expectAsync(db.replaceLists([])).toBeRejectedWith(error);
  });

  it('rejects merge transaction errors', async () => {
    const db = new OfflineDbService();
    await (db as any).dbPromise;
    const error = new Error('merge failed');
    let calls = 0;
    const successRequest = (result: unknown): IDBRequest => {
      const request: any = { result };
      Object.defineProperty(request, 'onsuccess', { set: (handler: () => void) => handler() });
      Object.defineProperty(request, 'onerror', { set: () => undefined });
      return request as IDBRequest;
    };
    (db as any).dbPromise = Promise.resolve({
      transaction: () => {
        calls += 1;
        if (calls <= 2) {
          return { objectStore: () => ({ getAll: () => successRequest([]), index: () => ({ getAll: () => successRequest([]) }) }) };
        }
        return failingTransaction(error);
      }
    });

    await expectAsync(db.mergeServerTasks('list-a', [])).toBeRejectedWith(error);
  });

  it('rejects clear transaction errors', async () => {
    const db = new OfflineDbService();
    await (db as any).dbPromise;
    const error = new Error('clear failed');
    (db as any).dbPromise = Promise.resolve({ transaction: () => failingTransaction(error) });

    await expectAsync(db.clearAll()).toBeRejectedWith(error);
  });
});
