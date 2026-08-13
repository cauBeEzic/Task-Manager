import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AuthService } from 'src/app/auth.service';
import { List } from 'src/app/models/list.model';
import { Task } from 'src/app/models/task.model';
import { TaskService } from 'src/app/task.service';

@Component({
  selector: 'app-task-view',
  templateUrl: './task-view.component.html',
  styleUrls: ['./task-view.component.scss']
})
export class TaskViewComponent implements OnInit, OnDestroy {
  lists: List[];
  tasks: Task[];
  selectedListId: string;
  private readonly subscriptions = new Subscription();

  constructor(
    private taskService: TaskService,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(this.route.params.subscribe((params: Params) => {
      if (params.listId) {
        this.selectedListId = params.listId;
        this.subscriptions.add(this.taskService.getTasks(params.listId).subscribe((tasks: Task[]) => this.tasks = tasks));
      } else {
        this.tasks = undefined;
      }
    }));

    this.subscriptions.add(this.taskService.getLists().subscribe((lists: List[]) => this.lists = lists));
    this.subscriptions.add(this.taskService.changes$.pipe(
      filter(change => change.type === 'tasks' && !!this.selectedListId && (!change.listId || change.listId === this.selectedListId))
    ).subscribe(() => {
      this.taskService.getCachedTasks(this.selectedListId).subscribe(tasks => this.tasks = tasks);
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
