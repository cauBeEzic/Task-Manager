import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { PendingAction } from '../models/pending-action.model';
import { Task } from '../models/task.model';
import { SyncService } from './sync.service';

class FakeOfflineDb {
  actions: PendingAction[] = [];
  tasks = new Map<string, Task>();

  async getActions(): Promise<PendingAction[]> {
    return this.actions.map(action => ({ ...action }));
  }

  async putAction(action: PendingAction): Promise<void> {
    const index = this.actions.findIndex(item => item.operationId === action.operationId);
    if (index >= 0) {
      this.actions[index] = { ...action };
    } else {
      this.actions.push({ ...action });
    }
  }

  async deleteAction(operationId: string): Promise<void> {
    this.actions = this.actions.filter(action => action.operationId !== operationId);
  }

  async getTask(taskId: string): Promise<Task | undefined> {
    const task = this.tasks.get(taskId);
    return task ? { ...task } : undefined;
  }

  async putTask(task: Task): Promise<void> {
    this.tasks.set(task._id, { ...task });
  }

  async deleteTask(taskId: string): Promise<void> {
    this.tasks.delete(taskId);
  }
}

const task = (id: string, listId = 'list-1'): Task => ({
  _id: id,
  _listId: listId,
  title: id,
  completed: false
});

const action = (
  operationId: string,
  kind: PendingAction['kind'],
  entityId: string,
  createdAt: string,
  extra: Partial<PendingAction> = {}
): PendingAction => ({
  operationId,
  kind,
  entityId,
  listId: 'list-1',
  payload: kind === 'CREATE_TASK' ? { title: entityId } : { completed: true },
  state: 'queued',
  attemptCount: 0,
  createdAt,
  ...extra
});

describe('SyncService regression behavior', () => {
  let db: FakeOfflineDb;
  let http: {
    post: jasmine.Spy;
    patch: jasmine.Spy;
    delete: jasmine.Spy;
  };
  let service: SyncService;
  let onlineSpy: jasmine.Spy;

  beforeEach(async () => {
    onlineSpy = spyOnProperty(window.navigator, 'onLine', 'get').and.returnValue(true);
    db = new FakeOfflineDb();
    http = {
      post: jasmine.createSpy('post'),
      patch: jasmine.createSpy('patch'),
      delete: jasmine.createSpy('delete')
    };
    service = new SyncService(http as any, db as any);
    await Promise.resolve();
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('preserves queue order and does not send dependent actions after a retryable create failure', async () => {
    const localTask = task('local-task');
    db.tasks.set(localTask._id, localTask);
    db.actions = [
      action('operation-create', 'CREATE_TASK', localTask._id, '2026-01-01T00:00:00.000Z'),
      action('operation-update', 'UPDATE_TASK', localTask._id, '2026-01-01T00:00:01.000Z')
    ];
    http.post.and.returnValue(throwError(() => new HttpErrorResponse({ status: 0 })));

    await service.syncNow();

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.patch).not.toHaveBeenCalled();
    expect(db.actions[0].state).toBe('retrying');
    expect(db.actions[1].state).toBe('queued');
  });

  it('drains an action enqueued while another request is in flight', async () => {
    const firstResponse = new Subject<Task>();
    db.actions = [action('operation-first', 'CREATE_TASK', 'local-first', '2026-01-01T00:00:00.000Z')];
    db.tasks.set('local-first', task('local-first'));
    db.tasks.set('local-second', task('local-second'));
    http.post.and.returnValues(firstResponse, of(task('server-second')));

    const activeSync = service.syncNow();
    await Promise.resolve();
    await service.enqueue(action('operation-second', 'CREATE_TASK', 'local-second', '2026-01-01T00:00:01.000Z'));
    firstResponse.next(task('server-first'));
    firstResponse.complete();
    await activeSync;

    expect(http.post).toHaveBeenCalledTimes(2);
    expect(db.actions).toEqual([]);
    expect(db.tasks.has('server-first')).toBeTrue();
    expect(db.tasks.has('server-second')).toBeTrue();
  });

  it('restores a failed optimistic delete and removes it again when manually retried', async () => {
    const snapshot = task('task-to-delete');
    db.actions = [action(
      'operation-delete',
      'DELETE_TASK',
      snapshot._id,
      '2026-01-01T00:00:00.000Z',
      { snapshot }
    )];
    http.delete.and.returnValues(
      throwError(() => new HttpErrorResponse({ status: 400, error: { error: 'Rejected' } })),
      of(snapshot)
    );

    await service.syncNow();

    expect(db.tasks.get(snapshot._id)?._syncState).toBe('failed');
    expect(db.actions[0].state).toBe('failed');

    await service.retryFailed();

    expect(http.delete).toHaveBeenCalledTimes(2);
    expect(db.tasks.has(snapshot._id)).toBeFalse();
    expect(db.actions).toEqual([]);
  });

  it('fails later actions for the same entity after a permanent create failure', async () => {
    db.tasks.set('local-task', task('local-task'));
    db.actions = [
      action('bad-create', 'CREATE_TASK', 'local-task', '2026-01-01T00:00:00.000Z'),
      action('blocked-update', 'UPDATE_TASK', 'local-task', '2026-01-01T00:00:01.000Z')
    ];
    http.post.and.returnValue(throwError(() => new HttpErrorResponse({ status: 400 })));

    await service.syncNow();

    expect(http.patch).not.toHaveBeenCalled();
    expect(db.actions.map(item => item.state)).toEqual(['failed', 'failed']);
    expect(db.actions[1].lastError).toContain('create_task failed');
  });

  it('keeps the earliest retry timer when later actions have longer deadlines', () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-01-01T00:00:00.000Z'));
    const internal = service as any;

    internal.scheduleRetryAt(Date.now() + 1000);
    const firstTimer = internal.retryTimer;
    internal.scheduleRetryAt(Date.now() + 5000);

    expect(internal.retryDeadline).toBe(Date.now() + 1000);
    expect(internal.retryTimer).toBe(firstTimer);
  });

  it('reacts to online, offline, and visible browser events', async () => {
    const syncSpy = spyOn(service, 'syncNow').and.resolveTo();
    const summarySpy = spyOn(service as any, 'updateSummary').and.resolveTo();

    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('offline'));
    spyOnProperty(document, 'hidden', 'get').and.returnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();

    expect(summarySpy).toHaveBeenCalledTimes(2);
    expect(syncSpy).toHaveBeenCalledTimes(2);
  });

  it('does not sync when a visibility event leaves the document hidden', () => {
    const syncSpy = spyOn(service, 'syncNow').and.resolveTo();
    spyOnProperty(document, 'hidden', 'get').and.returnValue(true);

    document.dispatchEvent(new Event('visibilitychange'));

    expect(syncSpy).not.toHaveBeenCalled();
  });

  it('queues while offline and reports the offline summary', async () => {
    onlineSpy.and.returnValue(false);
    const queued = action('offline-create', 'CREATE_TASK', 'offline-task', '2026-01-01T00:00:00.000Z');

    await service.enqueue(queued);
    await service.syncNow();

    expect(http.post).not.toHaveBeenCalled();
    expect(service.summary$.value.online).toBeFalse();
    expect(service.summary$.value.queued).toBe(1);
  });

  it('waits for a future retry deadline instead of sending early', async () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-01-01T00:00:00.000Z'));
    db.actions = [action('delayed', 'UPDATE_TASK', 'task-a', '2026-01-01T00:00:00.000Z', {
      state: 'retrying', nextRetryAt: '2026-01-01T00:00:10.000Z'
    })];

    await service.syncNow();

    expect(http.patch).not.toHaveBeenCalled();
    expect((service as any).retryDeadline).toBe(Date.parse('2026-01-01T00:00:10.000Z'));
  });

  it('remaps an entity, confirms an update, and removes the action', async () => {
    db.actions = [action('update-remapped', 'UPDATE_TASK', 'local-task', '2026-01-01T00:00:00.000Z')];
    db.tasks.set('server-task', task('server-task'));
    (service as any).entityRemaps.set('local-task', 'server-task');
    http.patch.and.returnValue(of({ ...task('server-task'), completed: true }));

    await service.syncNow();

    expect(http.patch).toHaveBeenCalledWith(
      jasmine.stringMatching(/server-task$/),
      jasmine.anything(),
      jasmine.anything()
    );
    expect(db.tasks.get('server-task')).toEqual(jasmine.objectContaining({ completed: true, _syncState: 'confirmed' }));
    expect(db.actions).toEqual([]);
  });

  it('remaps dependent actions after a successful create', async () => {
    db.actions = [
      action('create-local', 'CREATE_TASK', 'local-task', '2026-01-01T00:00:00.000Z'),
      action('update-local', 'UPDATE_TASK', 'local-task', '2026-01-01T00:00:01.000Z')
    ];
    db.tasks.set('local-task', task('local-task'));
    http.post.and.returnValue(of(task('server-task')));
    http.patch.and.returnValue(of({ ...task('server-task'), completed: true }));

    await service.syncNow();

    expect(http.patch).toHaveBeenCalledWith(
      jasmine.stringMatching(/server-task$/),
      jasmine.anything(),
      jasmine.anything()
    );
    expect(db.actions).toEqual([]);
  });

  it('confirms a delete even when its task is already absent', async () => {
    db.actions = [action('delete-success', 'DELETE_TASK', 'task-a', '2026-01-01T00:00:00.000Z')];
    http.delete.and.returnValue(of(null));

    await service.syncNow();

    expect(http.delete).toHaveBeenCalledTimes(1);
    expect(db.actions).toEqual([]);
  });

  [408, 425, 429, 500].forEach(status => {
    it(`retries retryable HTTP ${status} failures`, async () => {
      db.actions = [action(`retry-${status}`, 'UPDATE_TASK', 'task-a', '2026-01-01T00:00:00.000Z')];
      http.patch.and.returnValue(throwError(() => new HttpErrorResponse({ status })));

      await service.syncNow();

      expect(db.actions[0].state).toBe('retrying');
    });
  });

  it('honors Retry-After and returns an offline retry to queued state', async () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-01-01T00:00:00.000Z'));
    onlineSpy.and.returnValues(true, false, false);
    db.actions = [action('rate-limit', 'UPDATE_TASK', 'task-a', '2026-01-01T00:00:00.000Z')];
    http.patch.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 429,
      headers: new HttpHeaders({ 'Retry-After': '10' })
    })));

    await service.syncNow();

    expect(db.actions[0].state).toBe('queued');
    expect(db.actions[0].nextRetryAt).toBe('2026-01-01T00:00:10.000Z');
  });

  it('fails after the retry limit and falls back to the status message', async () => {
    const exhausted = action('exhausted', 'UPDATE_TASK', 'missing-task', '2026-01-01T00:00:00.000Z', {
      attemptCount: 4
    });
    db.actions = [exhausted];
    http.patch.and.returnValue(throwError(() => new HttpErrorResponse({ status: 503, statusText: '' })));

    await service.syncNow();

    expect(db.actions[0].state).toBe('failed');
    expect(db.actions[0].lastError).toContain('503');
    expect((service as any).describeError({ status: 418, error: {}, message: '' })).toBe('Request failed (418)');
  });

  it('fires the scheduled retry and replaces a later timer with an earlier one', () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-01-01T00:00:00.000Z'));
    const syncSpy = spyOn(service, 'syncNow').and.resolveTo();
    const internal = service as any;

    internal.scheduleRetryAt(Date.now() + 5000);
    internal.scheduleRetryAt(Date.now() + 1000);
    jasmine.clock().tick(1000);

    expect(internal.retryDeadline).toBeUndefined();
    expect(internal.retryTimer).toBeUndefined();
    expect(syncSpy).toHaveBeenCalled();
  });
});
