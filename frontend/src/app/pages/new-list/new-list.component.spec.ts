import { of } from 'rxjs';
import { NewListComponent } from './new-list.component';

describe('NewListComponent', () => {
  it('creates a list and navigates to it', () => {
    const tasks = { createList: jasmine.createSpy('createList').and.returnValue(of({ _id: 'list-1' })) };
    const router = { navigate: jasmine.createSpy('navigate') };
    const component = new NewListComponent(tasks as any, router as any);

    component.createList('List');

    expect(tasks.createList).toHaveBeenCalledOnceWith('List');
    expect(router.navigate).toHaveBeenCalledOnceWith(['/lists', 'list-1']);
  });
});
