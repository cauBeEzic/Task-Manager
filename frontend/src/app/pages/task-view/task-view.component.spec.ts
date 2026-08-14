import { of, Subject } from 'rxjs';
import { TaskViewComponent } from './task-view.component';

describe('TaskViewComponent', () => {
  it('loads cached data and delegates task actions', () => {
    const changes$ = new Subject<any>();
    const tasks = {
      changes$,
      getLists: jasmine.createSpy('getLists').and.returnValue(of([{ _id: 'list-1', title: 'List' }])),
      getTasks: jasmine.createSpy('getTasks').and.returnValue(of([{ _id: 'task-1', _listId: 'list-1', title: 'Task', completed: false }])),
      getCachedTasks: jasmine.createSpy('getCachedTasks').and.returnValue(of([])),
      complete: jasmine.createSpy('complete').and.returnValue(of({})),
      deleteTask: jasmine.createSpy('deleteTask').and.returnValue(of(undefined)),
      deleteList: jasmine.createSpy('deleteList').and.returnValue(of({}))
    };
    const route = { params: of({ listId: 'list-1' }) };
    const router = { navigate: jasmine.createSpy('navigate') };
    const auth = { logoutRequest: jasmine.createSpy('logoutRequest').and.returnValue(of({})) };
    const component = new TaskViewComponent(tasks as any, route as any, router as any, auth as any);

    component.ngOnInit();
    component.onTaskClick(component.tasks![0]);
    component.onDeleteTaskClick('task-1');
    component.onDeleteListClick();
    component.onLogoutClick();
    changes$.next({ type: 'tasks', listId: 'list-1' });

    expect(tasks.complete).toHaveBeenCalled();
    expect(tasks.deleteTask).toHaveBeenCalledOnceWith('list-1', 'task-1');
    expect(router.navigate).toHaveBeenCalledWith(['/lists']);
    expect(auth.logoutRequest).toHaveBeenCalled();
    expect(tasks.getCachedTasks).toHaveBeenCalledWith('list-1');
    component.ngOnDestroy();
  });
});
