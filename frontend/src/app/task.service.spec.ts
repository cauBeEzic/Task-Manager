import { BehaviorSubject, firstValueFrom, of, Subject } from 'rxjs';
import { List } from './models/list.model';
import { Task } from './models/task.model';
import { TaskService } from './task.service';

describe('TaskService offline mutations', () => {
  let web: any;
  let db: any;
  let sync: any;
  let service: TaskService;
  const existing: Task = { _id: 'task-1', _listId: 'list-1', title: 'Task', completed: false };

  beforeEach(() => {
    web = {};
    db = {
      changes$: new Subject(),
      getLists: jasmine.createSpy('getLists').and.returnValue(Promise.resolve([])),
      replaceLists: jasmine.createSpy('replaceLists').and.returnValue(Promise.resolve()),
      getTask: jasmine.createSpy('getTask').and.returnValue(Promise.resolve(existing)),
      putTask: jasmine.createSpy('putTask').and.returnValue(Promise.resolve()),
      deleteTask: jasmine.createSpy('deleteTask').and.returnValue(Promise.resolve())
    };
    sync = {
      summary$: new BehaviorSubject({ queued: 0, pending: 0, retrying: 0, failed: 0, online: true }),
      enqueue: jasmine.createSpy('enqueue').and.returnValue(Promise.resolve()),
      syncNow: jasmine.createSpy('syncNow'),
      retryFailed: jasmine.createSpy('retryFailed')
    };
    service = new TaskService(web, db, sync);
  });

  it('caches a created list before emitting it to the navigation flow', async () => {
    const created: List = { _id: 'list-2', title: 'Field work' };
    const existingList: List = { _id: 'list-1', title: 'Existing' };
    web.post = jasmine.createSpy('post').and.returnValue(of(created));
    db.getLists.and.returnValue(Promise.resolve([existingList]));

    const result = await firstValueFrom(service.createList(created.title));

    expect(db.replaceLists).toHaveBeenCalledOnceWith([existingList, created]);
    expect(result).toEqual(created);
  });

  it('stores a delete snapshot so permanent failure can restore the task', async () => {
    await firstValueFrom(service.deleteTask('list-1', 'task-1'));

    expect(db.deleteTask).toHaveBeenCalledOnceWith('task-1', 'list-1');
    expect(sync.enqueue).toHaveBeenCalledWith(jasmine.objectContaining({
      kind: 'DELETE_TASK', entityId: 'task-1', snapshot: existing
    }));
  });

  it('rejects deletion when the task is not in the active user cache', async () => {
    db.getTask.and.returnValue(Promise.resolve(undefined));

    await expectAsync(firstValueFrom(service.deleteTask('list-1', 'missing'))).toBeRejectedWithError(
      'Task is not available locally'
    );
    expect(sync.enqueue).not.toHaveBeenCalled();
  });

  it('rejects blank offline creates and edits before they enter the queue', async () => {
    await expectAsync(firstValueFrom(service.createTask('   ', 'list-1'))).toBeRejectedWithError('Task title is required');
    await expectAsync(firstValueFrom(service.updateTask('list-1', 'task-1', ''))).toBeRejectedWithError('Task title is required');
    expect(sync.enqueue).not.toHaveBeenCalled();
  });

  it('delegates manual synchronization controls', () => {
    service.syncNow();
    service.retryFailed();

    expect(sync.syncNow).toHaveBeenCalled();
    expect(sync.retryFailed).toHaveBeenCalled();
  });
});
