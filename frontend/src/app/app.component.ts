import { Component } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'Field Tasks';

  constructor(updates: SwUpdate) {
    if (updates.isEnabled) {
      updates.versionUpdates.pipe(
        filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY')
      ).subscribe(() => {
        if (window.confirm('A new version of Field Tasks is ready. Reload now?')) {
          updates.activateUpdate().then(() => document.location.reload());
        }
      });
    }
  }
}
