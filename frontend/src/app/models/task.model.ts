export class Task {
    _id: string;
    _listId: string;
    title: string;
    completed: boolean;
    location?: {
      type: 'Point';
      coordinates: [number, number];
    };
    address?: string;
    geofenceRadiusMeters?: number;
    syncVersion?: number;
    _syncState?: 'queued' | 'pending' | 'retrying' | 'confirmed' | 'failed';
    _syncError?: string;
}
