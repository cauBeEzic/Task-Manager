# Field Task Manager

An installable, offline-first task manager for field work. Users can manage private lists and tasks, place tasks on a map, group nearby pins, use their current location for proximity checks, and continue editing when the network is unavailable.

## Features

- Email/password authentication with short-lived JWT access tokens, refresh sessions, and CSRF protection
- User-scoped list and task CRUD
- Installable Angular PWA with a versioned, cache-first application shell
- IndexedDB cache for the last synchronized lists and tasks
- Durable offline outbox for task create, update, complete, location, and delete actions
- Visible `queued`, `pending`, `retrying`, `confirmed`, and `failed` action states
- Bounded exponential retry with jitter and manual retry controls
- Idempotency keys and server-side action receipts to make mutation retries safe
- MapLibre map backed by OpenFreeMap/OpenStreetMap data
- GeoJSON task pins, popups, and client-side clustering
- Task location assignment, configurable proximity radii, current-device location, and foreground proximity checks
- Straight-line guidance visualization (not turn-by-turn routing)
- Responsive mobile UI and service-worker update prompts

## Offline and caching strategy

The generated Angular service worker precaches the versioned application shell: `index.html`, JavaScript, CSS, the manifest, icons, and local assets. It lazily caches other static assets.

User data is kept separately in IndexedDB:

1. Reads emit cached lists/tasks immediately.
2. When online, the app requests current server data and reconciles it with local pending actions.
3. Task mutations update IndexedDB optimistically and enter the durable outbox.
4. The sync worker sends actions in creation order using a unique `X-Idempotency-Key`.
5. Network, timeout, rate-limit, and `5xx` errors retry with bounded exponential backoff and jitter.
6. Validation and authorization errors become terminal failures and remain available for manual retry.
7. Successful responses replace optimistic data with the server's canonical task.

Authentication endpoints and tokens are not cached. The access token remains memory-only. Logout clears all offline user data.

See [Offline architecture](docs/OFFLINE_ARCHITECTURE.md) for the detailed state transitions and tradeoffs.

## Map behavior and limitations

MapLibre GL JS renders the map. Tasks are converted to a GeoJSON source, and MapLibre clusters nearby points at lower zoom levels. OpenFreeMap supplies the public vector-tile style without requiring an API key.

The proximity feature uses browser geolocation while the map is open. It is deliberately described as **foreground proximity detection**, not OS-level background geofencing. The “Guide me” action draws a straight line and reports distance; a routing provider would be required for road-aware, turn-by-turn directions.

The basemap requires a connection unless the browser happens to retain recently requested tiles. Offline mode guarantees the app shell and cached task workspace, not an entire offline map region.

## Tech stack

- Angular 17, TypeScript, RxJS, Angular service worker, IndexedDB
- MapLibre GL JS with OpenFreeMap/OpenStreetMap
- Node.js, Express, MongoDB, Mongoose
- JWT, bcryptjs, cookies, Helmet, CORS, rate limiting
- Karma/Jasmine and Playwright
- Vercel for frontend/API and MongoDB Atlas for persistence

## Local development

Start MongoDB, then run the API:

```bash
cd api
cp .env.example .env
npm install
npm start
```

In a second terminal:

```bash
cd frontend
npm install
npm start
```

Open `http://localhost:4200`.

Service workers are enabled only in production builds. Test the PWA locally with:

```bash
cd frontend
npm run build -- --configuration production
npx http-server -p 8080 -c-1 dist/frontend
```

## Free deployment

Use two Vercel projects from this repository.

### API project

1. Set the Vercel root directory to `api`.
2. Create a MongoDB Atlas Free cluster.
3. Set these Vercel environment variables:

```text
JWT_SECRET=<a long random secret>
MONGO_URI=<Atlas connection string>
ALLOWED_ORIGINS=https://<frontend-project>.vercel.app
NODE_ENV=production
COOKIE_SAMESITE=lax
```

4. Deploy and copy the API's production URL.

### Frontend project

1. Replace `YOUR-API-PROJECT` in `frontend/vercel.json` with the API project name.
2. Set the Vercel root directory to `frontend`.
3. Use `npm run build` as the build command and `dist/frontend` as the output directory.
4. Deploy.

The frontend proxies `/api/*` through its own origin. That keeps authentication cookies first-party and avoids coupling the compiled Angular bundle to an API hostname.

## Verification

```bash
# Compile production PWA and generate ngsw.json
cd frontend
npm run build -- --configuration production

# Type-check application tests
npx tsc -p src/tsconfig.spec.json --noEmit

# Run 56 frontend tests and enforce 100% coverage on the offline DB/sync engine
npm run test:coverage

# Validate backend location/idempotency models
cd ../api
npm test

# Enforce 100% coverage on the idempotency helper and affected models
npm run test:coverage

# Full API/browser suite (requires MongoDB and Chromium)
cd ../frontend
npm run e2e
```

The coverage gates are intentionally scoped to the new reliability-critical modules. The complete legacy frontend currently reports 74.7% line coverage; it is not represented as having 100% repository-wide coverage.

Manual offline acceptance test:

1. Log in and open a task list.
2. In browser developer tools, switch the network to Offline.
3. Reload and verify the cached workspace opens.
4. Complete, create, edit, locate, and delete tasks; verify queued state appears.
5. Restore the network and verify pending/retrying transitions resolve to confirmed.
6. Reload and verify the canonical server result remains.

## Interview summary

**PWA:** The application shell is versioned and cache-first. User data uses IndexedDB with network refresh rather than putting authenticated responses in a shared HTTP cache. Writes use a durable outbox and reconnect synchronization.

**Maps:** MapLibre renders GeoJSON pins, popups, clustering, device location, proximity status, and a guidance line. Browser geolocation and Haversine distance calculations implement foreground proximity; MapLibre is not presented as a routing engine.

**Action states:** Mutations move through queued, pending, retrying, confirmed, or failed. Absolute desired state is sent instead of a toggle command. Retryable failures use bounded backoff, permanent failures are surfaced, and idempotency receipts prevent duplicate application.
