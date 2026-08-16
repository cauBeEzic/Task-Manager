import { AfterViewInit, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import * as maplibregl from 'maplibre-gl';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { Task } from '../../models/task.model';
import { TaskService } from '../../task.service';

@Component({
  standalone: false,
  selector: 'app-task-map',
  templateUrl: './task-map.component.html',
  styleUrls: ['./task-map.component.scss']
})
export class TaskMapComponent implements OnInit, AfterViewInit, OnDestroy {
  listId = '';
  tasks: Task[] = [];
  selectedTaskId = '';
  draftCoordinates?: [number, number];
  radiusMeters = 100;
  userPosition?: [number, number];
  mapMessage = 'Select a task, then click the map to assign its location.';

  private map?: maplibregl.Map;
  private mapLoaded = false;
  private readonly subscriptions = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private taskService: TaskService,
    private changeDetector: ChangeDetectorRef
  ) {}

  get isRadiusValid(): boolean {
    const radius = Number(this.radiusMeters);
    return Number.isFinite(radius) && radius >= 25 && radius <= 5000;
  }

  ngOnInit(): void {
    this.listId = this.route.snapshot.paramMap.get('listId') || '';
    this.loadTasks();
    this.subscriptions.add(this.taskService.changes$.pipe(
      filter(change => change.type === 'tasks' && (!change.listId || change.listId === this.listId))
    ).subscribe(() => {
      this.taskService.getCachedTasks(this.listId).subscribe(tasks => {
        this.tasks = tasks;
        this.updateTaskSource();
        this.changeDetector.markForCheck();
      });
    }));
  }

  ngAfterViewInit(): void {
    this.map = new maplibregl.Map({
      container: 'task-map',
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [-123.1207, 49.2827],
      zoom: 10
    });
    this.map.addControl(new maplibregl.NavigationControl(), 'top-right');
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showAccuracyCircle: true
    });
    this.map.addControl(geolocate, 'top-right');
    geolocate.on('geolocate', (event: any) => {
      this.userPosition = [event.coords.longitude, event.coords.latitude];
      this.changeDetector.markForCheck();
    });

    this.map.on('load', () => {
      this.mapLoaded = true;
      this.addMapLayers();
      this.updateTaskSource();
    });
    this.map.on('click', event => {
      const interactiveFeatures = this.map?.queryRenderedFeatures(event.point, { layers: ['clusters', 'task-pins'] }) || [];
      if (interactiveFeatures.length > 0) {
        return;
      }
      if (!this.selectedTaskId) {
        this.mapMessage = 'Choose a task before placing a location.';
        this.changeDetector.markForCheck();
        return;
      }
      this.draftCoordinates = [event.lngLat.lng, event.lngLat.lat];
      this.updateDraftSource();
      this.mapMessage = 'Location selected. Save it to queue the change.';
      this.changeDetector.markForCheck();
    });
    this.map.on('error', () => {
      this.mapMessage = navigator.onLine
        ? 'The basemap is temporarily unavailable. Your cached tasks and location drafts are still safe.'
        : 'The basemap needs a connection; cached tasks remain available in the list.';
      this.changeDetector.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.map?.remove();
  }

  onTaskSelected(): void {
    const task = this.selectedTask;
    this.radiusMeters = task?.geofenceRadiusMeters || 100;
    this.draftCoordinates = undefined;
    this.clearDraftSource();
    if (task?.location) {
      this.draftCoordinates = [...task.location.coordinates];
      this.map?.flyTo({ center: task.location.coordinates, zoom: 15 });
      this.updateDraftSource();
    }
    this.changeDetector.markForCheck();
  }

  saveLocation(): void {
    if (!this.selectedTask || !this.draftCoordinates || !this.isRadiusValid) {
      return;
    }
    this.taskService.updateTaskFields(this.listId, this.selectedTask._id, {
      location: { type: 'Point', coordinates: this.draftCoordinates },
      geofenceRadiusMeters: Number(this.radiusMeters)
    }).subscribe(() => {
      this.mapMessage = navigator.onLine ? 'Location queued and being confirmed.' : 'Location saved offline and queued.';
      this.changeDetector.markForCheck();
    });
  }

  guideToSelected(): void {
    const task = this.selectedTask;
    if (!task?.location) {
      this.mapMessage = 'Assign a location to this task first.';
      this.changeDetector.markForCheck();
      return;
    }
    const draw = (position: [number, number]) => {
      this.userPosition = position;
      const source = this.map?.getSource('guidance') as maplibregl.GeoJSONSource;
      source?.setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: [position, task.location!.coordinates] }
      } as any);
      const bounds = new maplibregl.LngLatBounds(position, position).extend(task.location!.coordinates);
      this.map?.fitBounds(bounds, { padding: 80, maxZoom: 15 });
      this.mapMessage = `Straight-line distance: ${this.distanceTo(task)}. This is guidance, not turn-by-turn routing.`;
      this.changeDetector.markForCheck();
    };
    if (this.userPosition) {
      draw(this.userPosition);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => draw([position.coords.longitude, position.coords.latitude]),
      () => {
        this.mapMessage = 'Location permission is required for guidance.';
        this.changeDetector.markForCheck();
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  distanceTo(task: Task): string {
    if (!this.userPosition || !task.location) {
      return 'Location unavailable';
    }
    const meters = this.haversineMeters(this.userPosition, task.location.coordinates);
    return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
  }

  isInsideRadius(task: Task): boolean {
    return !!this.userPosition && !!task.location &&
      this.haversineMeters(this.userPosition, task.location.coordinates) <= (task.geofenceRadiusMeters || 100);
  }

  get selectedTask(): Task | undefined {
    return this.tasks.find(task => task._id === this.selectedTaskId);
  }

  private loadTasks(): void {
    this.subscriptions.add(this.taskService.getTasks(this.listId).subscribe(tasks => {
      this.tasks = tasks;
      this.updateTaskSource();
      this.changeDetector.markForCheck();
    }));
  }

  private addMapLayers(): void {
    if (!this.map) { return; }
    this.map.addSource('tasks', {
      type: 'geojson',
      data: this.taskGeoJson(),
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 50
    });
    this.map.addSource('draft', { type: 'geojson', data: this.emptyCollection() });
    this.map.addSource('guidance', { type: 'geojson', data: this.emptyCollection() });
    this.map.addLayer({
      id: 'clusters', type: 'circle', source: 'tasks', filter: ['has', 'point_count'],
      paint: { 'circle-color': '#2563eb', 'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 30, 30] }
    });
    this.map.addLayer({
      id: 'cluster-count', type: 'symbol', source: 'tasks', filter: ['has', 'point_count'],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
      paint: { 'text-color': '#ffffff' }
    });
    this.map.addLayer({
      id: 'task-pins', type: 'circle', source: 'tasks', filter: ['!', ['has', 'point_count']],
      paint: { 'circle-color': ['case', ['get', 'completed'], '#64748b', '#0f766e'], 'circle-radius': 9, 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' }
    });
    this.map.addLayer({ id: 'guidance-line', type: 'line', source: 'guidance', paint: { 'line-color': '#f97316', 'line-width': 4, 'line-dasharray': [2, 2] } });
    this.map.addLayer({ id: 'draft-pin', type: 'circle', source: 'draft', paint: { 'circle-color': '#f97316', 'circle-radius': 10, 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' } });

    this.map.on('click', 'clusters', async event => {
      const feature = this.map!.queryRenderedFeatures(event.point, { layers: ['clusters'] })[0];
      const source = this.map!.getSource('tasks') as maplibregl.GeoJSONSource;
      const zoom = await source.getClusterExpansionZoom(Number(feature.properties?.['cluster_id']));
      this.map!.easeTo({ center: (feature.geometry as any).coordinates, zoom });
    });
    this.map.on('click', 'task-pins', event => {
      const feature = event.features?.[0];
      if (!feature) { return; }
      const coordinates = (feature.geometry as any).coordinates as [number, number];
      new maplibregl.Popup().setLngLat(coordinates).setText(String(feature.properties?.['title'] || 'Task')).addTo(this.map!);
    });
  }

  private updateTaskSource(): void {
    if (!this.mapLoaded) { return; }
    (this.map?.getSource('tasks') as maplibregl.GeoJSONSource)?.setData(this.taskGeoJson() as any);
  }

  private updateDraftSource(): void {
    if (!this.mapLoaded || !this.draftCoordinates) { return; }
    (this.map?.getSource('draft') as maplibregl.GeoJSONSource)?.setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: this.draftCoordinates } }]
    } as any);
  }

  private clearDraftSource(): void {
    if (!this.mapLoaded) { return; }
    (this.map?.getSource('draft') as maplibregl.GeoJSONSource)?.setData(this.emptyCollection());
  }

  private taskGeoJson(): any {
    return {
      type: 'FeatureCollection',
      features: this.tasks.filter(task => task.location).map(task => ({
        type: 'Feature',
        properties: { id: task._id, title: task.title, completed: task.completed },
        geometry: task.location
      }))
    };
  }

  private emptyCollection(): any {
    return { type: 'FeatureCollection', features: [] };
  }

  private haversineMeters(from: [number, number], to: [number, number]): number {
    const radians = (degrees: number) => degrees * Math.PI / 180;
    const dLatitude = radians(to[1] - from[1]);
    const dLongitude = radians(to[0] - from[0]);
    const latitude1 = radians(from[1]);
    const latitude2 = radians(to[1]);
    const a = Math.sin(dLatitude / 2) ** 2 + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(dLongitude / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
