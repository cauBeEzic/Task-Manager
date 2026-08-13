import { Subject } from 'rxjs';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  it('creates without subscribing when service workers are disabled', () => {
    const updates = { isEnabled: false, versionUpdates: new Subject<any>() };
    const component = new AppComponent(updates as any);

    expect(component.title).toBe('Field Tasks');
    expect(updates.versionUpdates.observed).toBeFalse();
  });

  it('ignores non-ready service-worker events and declined reloads', () => {
    const updates = {
      isEnabled: true,
      versionUpdates: new Subject<any>(),
      activateUpdate: jasmine.createSpy('activateUpdate')
    };
    spyOn(window, 'confirm').and.returnValue(false);
    new AppComponent(updates as any);

    updates.versionUpdates.next({ type: 'NO_NEW_VERSION_DETECTED' });
    updates.versionUpdates.next({ type: 'VERSION_READY' });

    expect(updates.activateUpdate).not.toHaveBeenCalled();
  });
});
