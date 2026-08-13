import { of } from 'rxjs';
import { NewTaskComponent } from './new-task.component';

describe('NewTaskComponent', () => {
  it('loads the list id and queues a task before navigating back', () => {
    const tasks = { createTask: jasmine.createSpy('createTask').and.returnValue(of({ _id: 'task' })) };
    const route = { params: of({ listId: 'list-1' }) };
    const router = { navigate: jasmine.createSpy('navigate') };
    const component = new NewTaskComponent(tasks as any, route as any, router as any);

    component.ngOnInit();
    component.createTask('Title');

    expect(tasks.createTask).toHaveBeenCalledOnceWith('Title', 'list-1');
    expect(router.navigate).toHaveBeenCalledWith(['../'], { relativeTo: route });
  });
});
