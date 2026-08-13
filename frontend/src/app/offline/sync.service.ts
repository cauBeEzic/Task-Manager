import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';
import { PendingAction, SyncSummary } from '../models/pending-action.model';
import { Task } from '../models/task.model';
import { OfflineDbService } from './offline-db.service';

@Injectable({ providedIn: 'root' })
export class SyncService {
  readonly summary$ = new BehaviorSubject<SyncSummary>({
    queued: 0,
    pending: 0,
    retrying: 0,
    failed: 0,
    online: navigator.onLine
  });

  private syncing = false;
  private syncRequested = false;
  private retryTimer?: number;
  private retryDeadline?: number;
  private readonly entityRemaps = new Map<string, string>();

  constructor(private http: HttpClient, private db: OfflineDbService) {
    window.addEventListener('online', () => {
      this.updateSummary();
      this.syncNow();
    });
    window.addEventListener('offline', () => this.updateSummary());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.syncNow();
      }
    });
    this.updateSummary();
    this.syncNow();
  }

  async enqueue(action: PendingAction): Promise<void> {
    await this.db.putAction(action);
    await this.updateSummary();
    if (navigator.onLine) {
      this.syncNow();
    }
  }

  async syncNow(): Promise<void> {
    if (this.syncing || !navigator.onLine) {
      if (this.syncing) {
        this.syncRequested = true;
      }
      await this.updateSummary();
      return;
    }
    this.syncing = true;
    try {
      do {
        this.syncRequested = false;
        const actions = (await this.db.getActions())
          .filter(action => action.state !== 'failed')
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        for (const action of actions) {
          if (action.nextRetryAt && Date.parse(action.nextRetryAt) > Date.now()) {
            this.scheduleRetryAt(Date.parse(action.nextRetryAt));
            break;
          }
          const result = await this.process(action);
          if (result === 'retrying') {
            break;
          }
          if (result === 'failed') {
            await this.failDependentActions(action);
            this.syncRequested = true;
            break;
          }
        }
      } while (this.syncRequested && navigator.onLine);
    } finally {
      this.syncing = false;
      await this.updateSummary();
    }
  }

  async retryFailed(): Promise<void> {
    const actions = await this.db.getActions();
    for (const action of actions.filter(item => item.state === 'failed')) {
      if (action.kind === 'DELETE_TASK' && action.snapshot) {
        await this.db.deleteTask(action.entityId, action.listId);
      }
      await this.db.putAction({
        ...action,
        state: 'queued',
        attemptCount: 0,
        nextRetryAt: undefined,
        lastError: undefined
      });
    }
    await this.syncNow();
  }

  private async process(action: PendingAction): Promise<'confirmed' | 'retrying' | 'failed'> {
    const remappedId = this.entityRemaps.get(action.entityId);
    if (remappedId) {
      action.entityId = remappedId;
      await this.db.putAction(action);
    }
    action.state = 'pending';
    action.attemptCount += 1;
    action.lastError = undefined;
    await this.db.putAction(action);
    await this.markTask(action, 'pending');

    const headers = new HttpHeaders({ 'X-Idempotency-Key': action.operationId });
    try {
      let response: Task | null = null;
      if (action.kind === 'CREATE_TASK') {
        response = await this.http.post<Task>(`${environment.apiUrl}/lists/${action.listId}/tasks`, action.payload, { headers }).toPromise();
      } else if (action.kind === 'UPDATE_TASK') {
        response = await this.http.patch<Task>(`${environment.apiUrl}/lists/${action.listId}/tasks/${action.entityId}`, action.payload, { headers }).toPromise();
      } else {
        await this.http.delete(`${environment.apiUrl}/lists/${action.listId}/tasks/${action.entityId}`, { headers }).toPromise();
      }

      if (action.kind === 'CREATE_TASK' && response) {
        const localId = action.entityId;
        this.entityRemaps.set(localId, response._id);
        const laterActions = await this.db.getActions();
        await Promise.all(laterActions
          .filter(item => item.operationId !== action.operationId && item.entityId === localId)
          .map(item => this.db.putAction({ ...item, entityId: response!._id })));
        await this.db.deleteTask(action.entityId, action.listId);
        await this.db.putTask({ ...response, _syncState: 'confirmed' });
      } else if (action.kind === 'UPDATE_TASK' && response) {
        await this.db.putTask({ ...response, _syncState: 'confirmed' });
      } else if (action.kind === 'DELETE_TASK') {
        await this.db.deleteTask(action.entityId, action.listId);
      }
      await this.db.deleteAction(action.operationId);
      return 'confirmed';
    } catch (error) {
      return this.handleFailure(action, error as HttpErrorResponse);
    }
  }

  private async handleFailure(action: PendingAction, error: HttpErrorResponse): Promise<'retrying' | 'failed'> {
    const retryable = error.status === 0 || error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
    action.lastError = this.describeError(error);
    if (retryable && action.attemptCount < 5) {
      const retryAfter = error.headers?.get('Retry-After');
      const serverDelay = retryAfter ? Number(retryAfter) * 1000 : 0;
      const backoff = Math.min(30000, 1000 * Math.pow(2, action.attemptCount - 1));
      const delay = Math.max(serverDelay, backoff + Math.floor(Math.random() * 500));
      action.state = navigator.onLine ? 'retrying' : 'queued';
      action.nextRetryAt = new Date(Date.now() + delay).toISOString();
      await this.db.putAction(action);
      await this.markTask(action, action.state, action.lastError);
      this.scheduleRetryAt(Date.now() + delay);
      return 'retrying';
    } else {
      action.state = 'failed';
      action.nextRetryAt = undefined;
      await this.db.putAction(action);
      if (action.kind === 'DELETE_TASK' && action.snapshot) {
        await this.db.putTask({ ...action.snapshot, _syncState: 'failed', _syncError: action.lastError });
      } else {
        await this.markTask(action, 'failed', action.lastError);
      }
      return 'failed';
    }
  }

  private async failDependentActions(failedAction: PendingAction): Promise<void> {
    const actions = await this.db.getActions();
    for (const action of actions) {
      if (action.operationId !== failedAction.operationId && action.entityId === failedAction.entityId && action.state !== 'failed') {
        action.state = 'failed';
        action.lastError = `Blocked because ${failedAction.kind.toLowerCase()} failed`;
        action.nextRetryAt = undefined;
        await this.db.putAction(action);
      }
    }
  }

  private async markTask(action: PendingAction, state: Task['_syncState'], error?: string): Promise<void> {
    const task = await this.db.getTask(action.entityId);
    if (task) {
      await this.db.putTask({ ...task, _syncState: state, _syncError: error });
    }
  }

  private scheduleRetryAt(deadline: number): void {
    if (this.retryDeadline !== undefined && this.retryDeadline <= deadline) {
      return;
    }
    if (this.retryTimer !== undefined) {
      window.clearTimeout(this.retryTimer);
    }
    this.retryDeadline = deadline;
    this.retryTimer = window.setTimeout(() => {
      this.retryDeadline = undefined;
      this.retryTimer = undefined;
      this.syncNow();
    }, Math.max(250, deadline - Date.now()));
  }

  private describeError(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'Network unavailable';
    }
    return error.error?.error || error.message || `Request failed (${error.status})`;
  }

  private async updateSummary(): Promise<void> {
    const actions = await this.db.getActions();
    this.summary$.next({
      queued: actions.filter(action => action.state === 'queued').length,
      pending: actions.filter(action => action.state === 'pending').length,
      retrying: actions.filter(action => action.state === 'retrying').length,
      failed: actions.filter(action => action.state === 'failed').length,
      online: navigator.onLine
    });
  }
}
