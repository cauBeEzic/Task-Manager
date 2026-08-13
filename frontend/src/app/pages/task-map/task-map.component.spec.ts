import { Task } from '../../models/task.model';
import { TaskMapComponent } from './task-map.component';

describe('TaskMapComponent location drafts', () => {
  const located: Task = {
    _id: 'located', _listId: 'list', title: 'Located', completed: false,
    location: { type: 'Point', coordinates: [-123.1, 49.2] }, geofenceRadiusMeters: 250
  };
  const unlocated: Task = {
    _id: 'unlocated', _listId: 'list', title: 'Unlocated', completed: false
  };

  it('clears coordinates and the draft marker when selecting an unlocated task', () => {
    const component = new TaskMapComponent({ snapshot: { paramMap: { get: () => 'list' } } } as any, {} as any);
    const setData = jasmine.createSpy('setData');
    (component as any).mapLoaded = true;
    (component as any).map = {
      getSource: () => ({ setData }),
      flyTo: jasmine.createSpy('flyTo')
    };
    component.tasks = [located, unlocated];
    component.selectedTaskId = located._id;
    component.onTaskSelected();
    expect(component.draftCoordinates).toEqual(located.location!.coordinates);
    expect(component.radiusMeters).toBe(250);

    component.selectedTaskId = unlocated._id;
    component.onTaskSelected();

    expect(component.draftCoordinates).toBeUndefined();
    expect(component.radiusMeters).toBe(100);
    expect(setData).toHaveBeenCalledWith({ type: 'FeatureCollection', features: [] });
  });
});
