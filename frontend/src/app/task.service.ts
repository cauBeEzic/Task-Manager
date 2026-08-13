import { Injectable } from '@angular/core';
import { BehaviorSubject, concat, defer, EMPTY, from, Observable, of, Subject } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { List } from './models/list.model';
import { PendingAction, SyncSummary } from './models/pending-action.model';
import { Task } from './models/task.model';
import { OfflineDbService } from './offline/offline-db.service';
import { SyncService } from './offline/sync.service';
import { WebRequestService } from './web-request.service';

@Injectable({ providedIn: 'root' })
export class TaskService {
  readonly changes$: Subject<{ type: 'lists' | 'tasks' | 'actions'; listId?: string }>;
  readonly syncSummary$: BehaviorSubject<SyncSummary>;

  constructor(
    private webReqService: WebRequestService,
    private db: OfflineDbService,
    private sync: SyncService
  ) {
    this.changes$ = this.db.changes$;
    this.syncSummary$ = this.sync.summary$;
  }

  getLists(): Observable<List[]> {
    const cached$ = defer(() => from(this.db.getLists())).pipe(catchError(() => of([])));
    const remote$ = this.webReqService.get('lists').pipe(
      switchMap((lists: List[]) => from(this.db.replaceLists(lists)).pipe(map(() => lists))),
      catchError(() => EMPTY)
    );
    return concat(cached$, remote$);
  }

  createList(title: string) {
    return this.webReqService.post('lists', { title }).pipe(tap(() => this.refreshLists()));
  }

  updateList(id: string, title: string) {
    return this.webReqService.patch(`lists/${id}`, { title }).pipe(tap(() => this.refreshLists()));
  }

  deleteList(id: string) {
    return this.webReqService.delete(`lists/${id}`).pipe(tap(() => this.refreshLists()));
  }

  getTasks(listId: string): Observable<Task[]> {
    const cached$ = defer(() => from(this.db.getTasks(listId))).pipe(catchError(() => of([])));
    const remote$ = this.webReqService.get(`lists/${listId}/tasks`).pipe(
      switchMap((tasks: Task[]) => from(this.db.mergeServerTasks(listId, tasks))),
      catchError(() => EMPTY)
    );
    return concat(cached$, remote$);
  }

  getCachedTasks(listId: string): Observable<Task[]> {
    return defer(() => from(this.db.getTasks(listId)));
  }

  createTask(title: string, listId: string, fields: Partial<Task> = {}): Observable<Task> {
    return defer(() => from(this.queueCreate(title, listId, fields)));
  }

  updateTask(listId: string, taskId: string, title: string): Observable<Task> {
    return this.updateTaskFields(listId, taskId, { title });
  }

  updateTaskFields(listId: string, taskId: string, updates: Partial<Task>): Observable<Task> {
    return defer(() => from(this.queueUpdate(listId, taskId, updates)));
  }

  complete(task: Task): Observable<Task> {
    return this.updateTaskFields(task._listId, task._id, { completed: !task.completed });
  }

  deleteTask(listId: string, taskId: string): Observable<void> {
    return defer(() => from(this.queueDelete(listId, taskId)));
  }

  syncNow(): void {
    this.sync.syncNow();
  }

  retryFailed(): void {
    this.sync.retryFailed();
  }

  private async queueCreate(title: string, listId: string, fields: Partial<Task>): Promise<Task> {
    if (!title || !title.trim()) {
      throw new Error('Task title is required');
    }
    const operationId = this.operationId();
    const task: Task = {
      _id: `local-${operationId}`,
      _listId: listId,
      title: title.trim(),
      completed: false,
      ...fields,
      _syncState: 'queued'
    };
    const payload = this.apiPayload(task);
    await this.db.putTask(task);
    await this.sync.enqueue(this.action(operationId, 'CREATE_TASK', listId, task._id, payload));
    return task;
  }

  private async queueUpdate(listId: string, taskId: string, updates: Partial<Task>): Promise<Task> {
    const existing = await this.db.getTask(taskId);
    if (!existing) {
      throw new Error('Task is not available locally');
    }
    if (updates.title !== undefined && !updates.title.trim()) {
      throw new Error('Task title is required');
    }
    const operationId = this.operationId();
    const task = { ...existing, ...updates, _syncState: 'queued' as const, _syncError: undefined };
    const payload = this.apiPayload(updates);
    await this.db.putTask(task);
    await this.sync.enqueue(this.action(operationId, 'UPDATE_TASK', listId, taskId, payload));
    return task;
  }

  private async queueDelete(listId: string, taskId: string): Promise<void> {
    const operationId = this.operationId();
    const snapshot = await this.db.getTask(taskId);
    if (!snapshot) {
      throw new Error('Task is not available locally');
    }
    await this.db.deleteTask(taskId, listId);
    await this.sync.enqueue({
      ...this.action(operationId, 'DELETE_TASK', listId, taskId, {}),
      snapshot
    });
  }

  private action(operationId: string, kind: PendingAction['kind'], listId: string, entityId: string, payload: Record<string, any>): PendingAction {
    return {
      operationId,
      kind,
      listId,
      entityId,
      payload,
      state: 'queued',
      attemptCount: 0,
      createdAt: new Date().toISOString()
    };
  }

  private apiPayload(task: Partial<Task>): Record<string, any> {
    const allowed = ['title', 'completed', 'location', 'address', 'geofenceRadiusMeters'];
    return allowed.reduce((payload, key) => {
      const value = (task as any)[key];
      if (value !== undefined) {
        payload[key] = value;
      }
      return payload;
    }, {} as Record<string, any>);
  }

  private operationId(): string {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }

  private refreshLists(): void {
    this.webReqService.get('lists').subscribe((lists: List[]) => this.db.replaceLists(lists));
  }
}
