# Offline and action-state architecture

## Data flow

```text
Angular component
      |
      v
TaskService / repository
      |--- optimistic record ---> IndexedDB tasks
      |--- durable command -----> IndexedDB outbox
                                      |
                                      v
                                 SyncService
                                      |
                                      v
                              Express + MongoDB
                                      |
                         canonical task / confirmation
                                      |
                                      v
                                IndexedDB tasks
```

Components never need to wait for a network round trip before reflecting a task mutation. The sync status remains visible so an optimistic result is not mistaken for server confirmation.

## State machine

```text
idle -- user action --> queued
queued -- send --> pending
pending -- 2xx --> confirmed
pending -- network/408/429/5xx --> retrying
retrying -- timer or reconnect --> pending
pending -- permanent error or retry limit --> failed
failed -- manual retry --> queued
```

The outbox persists across reloads. Actions are processed in creation order, which is important when a task is created offline and then edited before the create is confirmed. Once the server assigns the real MongoDB ID, later queued actions are remapped from the temporary client ID.

## Retry and confirmation rules

- Every mutation receives a random operation ID.
- The operation ID is sent as `X-Idempotency-Key`.
- The API stores successful responses in a seven-day action-receipt collection.
- A pending receipt is claimed before the mutation, so concurrent duplicates receive retryable `425 Too Early` instead of applying twice.
- Replaying the same key for the same route returns the original response.
- Reusing a key for a different route returns `409 Conflict`.
- Client actions express absolute desired state, such as `{ "completed": true }`, rather than “toggle.”
- Retryable failures use exponential delay plus jitter, capped at 30 seconds and five attempts.
- The server response is canonical and replaces the optimistic local representation.

## Security boundary

The PWA caches application assets and user-scoped data, but not authentication responses or access tokens. Access tokens stay in memory; refresh sessions remain in secure cookies. Explicit logout clears the IndexedDB stores. Cached task content should therefore still be treated as data at rest on the device, which matters on shared devices.

## Map boundary

MapLibre is the renderer. OpenFreeMap supplies online vector tiles. Device position comes from the browser geolocation API, and proximity uses a local Haversine calculation. This is foreground behavior only. Reliable background geofence events or turn-by-turn navigation would require native/OS capabilities and a directions provider respectively.
