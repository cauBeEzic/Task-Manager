# Task Manager — multi-user task lists with JWT auth (Angular + Express)

Task Manager is a full-stack web app where users can sign up, log in, and manage their own lists and tasks. Data is isolated per user.

## Features
- Auth: register / login / logout
- Lists: create / edit / delete
- Tasks: create / edit / delete / complete
- API validation + rate limiting on auth routes

## Tech Stack
- Frontend: Angular 17, TypeScript, Bulma
- Backend: Node.js, Express
- Database: MongoDB (Mongoose)
- Testing: Karma/Jasmine (unit), Playwright (e2e)

## Project Structure
```
/frontend   Angular client
/api        Express API server
```

## Setup

### Prereqs
- Node.js 18+
- MongoDB (local or Atlas)

### Install
```
cd api
npm install
cd ../frontend
npm install
```

### Environment
```
cp api/.env.example api/.env
```
Update `api/.env`:
```
JWT_SECRET=your-secret
MONGO_URI=mongodb://localhost:27017/TaskManager
ALLOWED_ORIGINS=http://localhost:4200
# For cross-site deployments:
# COOKIE_SAMESITE=none
# NODE_ENV=production
```

### Run (two terminals)
Terminal 1 — API:
```
cd api
node app.js
```

Terminal 2 — Frontend:
```
cd frontend
npm run start
```

Open http://localhost:4200

## Usage (Happy Path)
1. Sign up / log in
2. Create a list
3. Add tasks and mark complete
4. Click **Logout**

## Testing
```
cd frontend
npm test
npm run e2e
```
