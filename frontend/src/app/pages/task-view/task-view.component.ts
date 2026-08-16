import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../auth.service';
import { List } from '../../models/list.model';
import { Task } from '../../models/task.model';
import { TaskService } from '../../task.service';

@Component({
  standalone: false,
  selector: 'app-task-view',
  templateUrl: './task-view.component.html',
  styleUrls: ['./task-view.component.scss']
})
export class TaskViewComponent implements OnInit, OnDestroy {
  lists: List[] = [];
  tasks?: Task[];
  selectedListId = '';
  private readonly subscriptions = new Subscription();

  get completedTaskCount(): number {
    return this.tasks?.filter(task => task.completed).length || 0;
  }

  get taskCompletionPercent(): number {
    return this.tasks?.length ? Math.round((this.completedTaskCount / this.tasks.length) * 100) : 0;
  }

  constructor(
    private taskService: TaskService,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private changeDetector: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(this.route.params.subscribe((params: Params) => {
      if (params.listId) {
        this.selectedListId = params.listId;
        this.subscriptions.add(this.taskService.getTasks(params.listId).subscribe((tasks: Task[]) => {
          this.tasks = tasks;
          this.changeDetector.markForCheck();
        }));
      } else {
        this.tasks = undefined;
      }
      this.changeDetector.markForCheck();
    }));

    this.subscriptions.add(this.taskService.getLists().subscribe((lists: List[]) => {
      this.lists = lists;
      this.changeDetector.markForCheck();
    }));
    this.subscriptions.add(this.taskService.changes$.pipe(
      filter(change => change.type === 'tasks' && !!this.selectedListId && (!change.listId || change.listId === this.selectedListId))
    ).subscribe(() => {
      this.subscriptions.add(this.taskService.getCachedTasks(this.selectedListId).subscribe(tasks => {
        this.tasks = tasks;
        this.changeDetector.markForCheck();
      }));
    }));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  onTaskClick(task: Task): void {
    this.taskService.complete(task).subscribe();
  }

  onDeleteListClick(): void {
    this.taskService.deleteList(this.selectedListId).subscribe(() => this.router.navigate(['/lists']));
  }

  onDeleteTaskClick(id: string): void {
    this.taskService.deleteTask(this.selectedListId, id).subscribe();
  }

  onLogoutClick(): void {
    this.authService.logoutRequest().subscribe();
  }
}
