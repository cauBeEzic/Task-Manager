import { Task } from './task.model';

export type ActionState = 'queued' | 'pending' | 'retrying' | 'confirmed' | 'failed';
export type ActionKind = 'CREATE_TASK' | 'UPDATE_TASK' | 'DELETE_TASK';

export interface PendingAction {
  operationId: string;
  kind: ActionKind;
  listId: string;
  entityId: string;
  payload: Record<string, any>;
  state: ActionState;
  attemptCount: number;
  createdAt: string;
  nextRetryAt?: string;
  lastError?: string;
  snapshot?: Task;
}

export interface SyncSummary {
  queued: number;
  pending: number;
  retrying: number;
  failed: number;
  online: boolean;
}
