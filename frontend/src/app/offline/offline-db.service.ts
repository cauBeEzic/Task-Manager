import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { List } from '../models/list.model';
import { PendingAction } from '../models/pending-action.model';
import { Task } from '../models/task.model';

@Injectable({ providedIn: 'root' })
export class OfflineDbService {
  readonly changes$ = new Subject<{ type: 'lists' | 'tasks' | 'actions'; listId?: string }>();
  private readonly activeUserKey = 'field-task-manager.active-user';
  private readonly dbPromise = this.open();

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('field-task-manager', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('lists', { keyPath: '_id' });
        const tasks = db.createObjectStore('tasks', { keyPath: '_id' });
        tasks.createIndex('listId', '_listId', { unique: false });
        const actions = db.createObjectStore('actions', { keyPath: 'operationId' });
        actions.createIndex('listId', 'listId', { unique: false });
      };
    });
  }

  private async request<T>(storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.dbPromise;
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = run(transaction.objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  getLists(): Promise<List[]> {
    return this.request<List[]>('lists', 'readonly', store => store.getAll());
  }

  async activateUser(userId: string): Promise<void> {
    const activeUserId = localStorage.getItem(this.activeUserKey);
    if (activeUserId !== userId) {
      await this.clearStores();
    }
    localStorage.setItem(this.activeUserKey, userId);
  }

  getActiveUserId(): string | null {
    return localStorage.getItem(this.activeUserKey);
  }

  async replaceLists(lists: List[]): Promise<void> {
    const db = await this.dbPromise;
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('lists', 'readwrite');
      const store = transaction.objectStore('lists');
      store.clear();
      lists.forEach(list => store.put(list));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    this.changes$.next({ type: 'lists' });
  }

  getTasks(listId: string): Promise<Task[]> {
    return this.request<Task[]>('tasks', 'readonly', store => store.index('listId').getAll(listId));
  }

  getAllTasks(): Promise<Task[]> {
    return this.request<Task[]>('tasks', 'readonly', store => store.getAll());
  }

  getTask(taskId: string): Promise<Task | undefined> {
    return this.request<Task | undefined>('tasks', 'readonly', store => store.get(taskId));
  }

  async putTask(task: Task): Promise<void> {
    await this.request<IDBValidKey>('tasks', 'readwrite', store => store.put(task));
    this.changes$.next({ type: 'tasks', listId: task._listId });
  }

  async deleteTask(taskId: string, listId?: string): Promise<void> {
    await this.request<undefined>('tasks', 'readwrite', store => store.delete(taskId));
    this.changes$.next({ type: 'tasks', listId });
  }

  async mergeServerTasks(listId: string, serverTasks: Task[]): Promise<Task[]> {
    const [localTasks, actions] = await Promise.all([this.getTasks(listId), this.getActions()]);
    const merged = new Map<string, Task>(serverTasks.map(task => [task._id, { ...task, _syncState: 'confirmed' as const }]));
    const localById = new Map(localTasks.map(task => [task._id, task]));

    actions.filter(action => action.listId === listId).forEach(action => {
      if (action.kind === 'DELETE_TASK') {
        if (action.state === 'failed') {
          const deletedTask = merged.get(action.entityId) || action.snapshot;
          if (deletedTask) {
            merged.set(action.entityId, {
              ...deletedTask,
              _syncState: 'failed',
              _syncError: action.lastError
            });
          }
        } else {
          merged.delete(action.entityId);
        }
        return;
      }
      const base = merged.get(action.entityId) || localById.get(action.entityId);
      if (base) {
        merged.set(action.entityId, {
          ...base,
          ...action.payload,
          _syncState: action.state,
          _syncError: action.lastError
        });
      }
    });

    const result = Array.from(merged.values());
    const db = await this.dbPromise;
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('tasks', 'readwrite');
      const store = transaction.objectStore('tasks');
      localTasks.forEach(task => store.delete(task._id));
      result.forEach(task => store.put(task));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    this.changes$.next({ type: 'tasks', listId });
    return result;
  }

  getActions(): Promise<PendingAction[]> {
    return this.request<PendingAction[]>('actions', 'readonly', store => store.getAll());
  }

  async putAction(action: PendingAction): Promise<void> {
    await this.request<IDBValidKey>('actions', 'readwrite', store => store.put(action));
    this.changes$.next({ type: 'actions', listId: action.listId });
  }

  async deleteAction(operationId: string): Promise<void> {
    await this.request<undefined>('actions', 'readwrite', store => store.delete(operationId));
    this.changes$.next({ type: 'actions' });
  }

  async clearAll(): Promise<void> {
    await this.clearStores();
    localStorage.removeItem(this.activeUserKey);
  }

  private async clearStores(): Promise<void> {
    const db = await this.dbPromise;
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['lists', 'tasks', 'actions'], 'readwrite');
      transaction.objectStore('lists').clear();
      transaction.objectStore('tasks').clear();
      transaction.objectStore('actions').clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    this.changes$.next({ type: 'lists' });
    this.changes$.next({ type: 'tasks' });
    this.changes$.next({ type: 'actions' });
  }
}
