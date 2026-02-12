# Task Manager

## 1) What it is
A full-stack task management app where users sign up, log in, and manage personal lists and tasks. The frontend is Angular, and the backend is an Express + MongoDB API with token-based auth.

## 2) Demo
**Working on deploying**

For now, run it locally:
- API: `http://localhost:3000`
- Frontend: `http://localhost:4200`

## 3) Features
- Email/password signup and login (`/users`, `/users/login`)
- JWT access token auth with refresh-token sessions stored in MongoDB
- CSRF protection for token refresh/logout via `XSRF-TOKEN` cookie + `X-XSRF-TOKEN` header
- Per-user list isolation (`_userId` on lists) so users only access their own lists
- List CRUD: create, read, update, delete
- Task CRUD inside lists: create, read, update, delete
- Task completion toggle (`completed: true/false`) from the task view
- Deleting a list also deletes its tasks (`deleteMany` cascade helper)
- Logout endpoint revokes refresh token session (`/users/logout`)
- Security middleware: Helmet, CORS allowlist, rate limiting on auth/refresh endpoints, and request validation on auth inputs.

## 4) Why I built this
I built this project to practice building an end-to-end CRUD app across frontend + backend, not just isolated features.  
I wanted hands-on experience with real auth/session flows (JWT access tokens, refresh tokens, and CSRF protection) and user-scoped data in MongoDB.

## 5) What I learned
- How to combine short-lived access tokens with refresh-token sessions for smoother auth UX
- How to implement a CSRF double-submit pattern for cookie-based refresh/logout endpoints
- How to enforce ownership checks in API routes (user can only access their own lists/tasks)
- How to use an Angular `HttpInterceptor` to attach auth headers and retry after token refresh
- How to structure a two-app repo (`frontend` + `api`) with environment-based API configuration

## 6) Tech stack
- **Angular 17 + TypeScript**: SPA UI, routing, and HTTP client integration
- **Node.js + Express**: REST API and middleware pipeline
- **MongoDB + Mongoose**: document models for users, lists, tasks, and session storage
- **JWT + bcryptjs + cookies**: authentication, password hashing, and refresh-token handling
- **Bulma + SCSS**: fast, clean UI styling
- **Karma/Jasmine + Playwright**: basic frontend/unit scaffold tests and a simple login-page e2e check

## 7) How to run locally
```bash
# 1) Start MongoDB locally (default URI used by this project)
# mongodb://localhost:27017/TaskManager

# 2) API setup
cd Task-Manager/api
cp .env.example .env
npm install
node app.js
```

Open a second terminal:

```bash
# 3) Frontend setup
cd Task-Manager/frontend
npm install
npm run start
```

Then open `http://localhost:4200`.

## 8) Project structure
```text
Task-Manager/
├── api/
│   ├── app.js                    # Express server, routes, auth/session middleware
│   ├── .env.example              # JWT, Mongo URI, CORS origins
│   └── db/
│       ├── mongoose.js           # Mongo connection setup
│       └── models/
│           ├── user.model.js     # user schema, bcrypt, JWT/session helpers
│           ├── list.model.js     # list schema with _userId ownership
│           └── task.model.js     # task schema with completed flag
├── frontend/
│   ├── src/app/
│   │   ├── pages/                # login/signup + list/task create/edit/views
│   │   ├── auth.service.ts       # login/signup/logout/token refresh hooks
│   │   ├── task.service.ts       # list/task API calls
│   │   └── web-req.interceptor.ts# auth + csrf header handling, 401 refresh flow
│   ├── src/environments/         # local/prod/stage API URLs
│   └── e2e/login.spec.ts         # Playwright smoke test
└── README.md
```

Current gaps: there is no live deployment yet, no API automated test suite, and frontend tests are mostly scaffold-level. Next steps are deploying both apps, adding API/integration tests, and wiring CI.
