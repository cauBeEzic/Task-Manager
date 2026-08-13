import { of } from 'rxjs';
import { EditListComponent } from './edit-list.component';

describe('EditListComponent', () => {
  it('loads the list id and updates the list', () => {
    const route = { params: of({ listId: 'list-1' }) };
    const tasks = { updateList: jasmine.createSpy('updateList').and.returnValue(of({})) };
    const router = { navigate: jasmine.createSpy('navigate') };
    const component = new EditListComponent(route as any, tasks as any, router as any);

    component.ngOnInit();
    component.updateList('Updated');

    expect(tasks.updateList).toHaveBeenCalledOnceWith('list-1', 'Updated');
    expect(router.navigate).toHaveBeenCalledOnceWith(['/lists', 'list-1']);
  });
});
