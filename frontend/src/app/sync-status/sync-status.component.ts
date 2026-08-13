import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { SyncSummary } from '../models/pending-action.model';
import { TaskService } from '../task.service';

@Component({
  selector: 'app-sync-status',
  templateUrl: './sync-status.component.html',
  styleUrls: ['./sync-status.component.scss']
})
export class SyncStatusComponent {
  readonly summary$: Observable<SyncSummary>;

  constructor(private tasks: TaskService) {
    this.summary$ = this.tasks.syncSummary$;
  }

  sync(): void {
    this.tasks.syncNow();
  }

  retry(): void {
    this.tasks.retryFailed();
  }
}
