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
    const changeDetector = { markForCheck: jasmine.createSpy('markForCheck') };
    const component = new TaskMapComponent(
      { snapshot: { paramMap: { get: () => 'list' } } } as any,
      {} as any,
      changeDetector as any
    );
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
    expect(component.isRadiusValid).toBeTrue();
    expect(setData).toHaveBeenCalledWith({ type: 'FeatureCollection', features: [] });
    expect(changeDetector.markForCheck).toHaveBeenCalled();
  });

  it('rejects invalid proximity radii before queueing a location update', () => {
    const updateTaskFields = jasmine.createSpy('updateTaskFields');
    const component = new TaskMapComponent(
      { snapshot: { paramMap: { get: () => 'list' } } } as any,
      { updateTaskFields } as any,
      { markForCheck: jasmine.createSpy('markForCheck') } as any
    );
    component.tasks = [located];
    component.selectedTaskId = located._id;
    component.draftCoordinates = [-123.2, 49.3];
    component.radiusMeters = 5001;

    expect(component.isRadiusValid).toBeFalse();
    component.saveLocation();

    expect(updateTaskFields).not.toHaveBeenCalled();
  });
});
