import { of } from 'rxjs';
import { EditTaskComponent } from './edit-task.component';

describe('EditTaskComponent', () => {
  it('loads route ids and queues an edit', () => {
    const route = { params: of({ listId: 'list-1', taskId: 'task-1' }) };
    const tasks = { updateTask: jasmine.createSpy('updateTask').and.returnValue(of({})) };
    const router = { navigate: jasmine.createSpy('navigate') };
    const component = new EditTaskComponent(route as any, tasks as any, router as any);

    component.ngOnInit();
    component.updateTask('Updated');

    expect(tasks.updateTask).toHaveBeenCalledOnceWith('list-1', 'task-1', 'Updated');
    expect(router.navigate).toHaveBeenCalledOnceWith(['/lists', 'list-1']);
  });
});
