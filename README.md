# Daily Timetable & Reminder

A mobile-friendly daily planner that works offline. Activities are saved in the browser's local storage; the planner does not require an account or send activity data to the server.

## Features

- Add, view, remove, and browse activities by date
- Offline-first activity storage on this device
- In-app activity reminders, loud alarm tone, and optional browser notifications
- Installable PWA with cached app shell for offline use
- Activity history and weekly insights

## Run locally

```bash
npm install
npm run dev:frontend
```

Open `http://localhost:5175`. No Supabase credentials, database setup, or API server are needed for the planner. For offline use after first load, open the app once while online so its service worker can cache the app files. Browser storage is device- and browser-specific; clearing site data removes locally saved activities.

For the API server's database health endpoint and standalone legacy routes, run `npm run dev:api` separately. The planner UI does not call those routes. The legacy activity and push API still uses Supabase authentication and is not part of the device-only app flow.

## Alarms and notifications

Choose **Enable loud alarm** once during each browser session to authorize audio playback. The sound plays a loud sequence when a scheduled activity starts, as long as the app is open. Browser notifications are optional and also require the app to be open. Browsers and mobile operating systems may suspend background web apps, so this local-only mode cannot guarantee alarms while the app is closed.

## Build

```bash
npm run build
npm run preview
```

## API health

`GET /healthz` returns `{"status":"ok"}` when the API can reach its configured database, or HTTP `503` with `{"status":"unavailable"}` when it cannot. API failures return JSON error responses.
