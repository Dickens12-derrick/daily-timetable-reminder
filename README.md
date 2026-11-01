# Daily Timetable & Reminder

A mobile-first calendar/reminder app built with React + Vite + Tailwind CSS.

## Features

- Responsive daily planner dashboard
- Add, view, and remove timetable items
- Browse schedules by date with previous/next-day navigation and a calendar picker
- Persistent activity storage with Prisma and local SQLite
- Express REST API with date filtering and activity updates
- Visual toast, browser notification, and subtle audio reminders at the exact start time
- Responsive desktop split layout
- PWA manifest and service worker setup for installability

## Authentication and push setup

Create a Supabase project and enable Email authentication. Copy the project URL and anon/public key into both `SUPABASE_URL` / `SUPABASE_ANON_KEY` and `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `.env`. Never use the Supabase service-role key in the frontend.

Generate Web Push keys with `npx web-push generate-vapid-keys`. Put the public/private pair and a contact email in `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`. Keep the private key only on the API server.

## Run locally

Copy `.env.example` to `.env`, configure the values above, then install dependencies and apply database migrations:

```bash
npm install
npm run db:migrate
```

Start the API and frontend in separate terminals:

```bash
npm run server
```

```bash
npm run dev
```

The frontend is available at `http://localhost:5175`; the API listens on `http://localhost:5000`. Keep both processes running while using the app. To test from a phone on the same Wi-Fi, open the Network URL printed by Vite. Local `/api` requests are proxied to the API, so the browser does not need a `VITE_API_URL` pointing to its own `localhost`. Create an account or sign in with Supabase. Each activity is stored under the verified account. Enable reminders in the app and allow browser notifications to associate that device's push subscription with the signed-in user.

The API process must stay running to dispatch scheduled push notifications. For deployment, use an always-on Node service for this API, configure the same environment variables there, and set `CLIENT_ORIGIN` to the exact HTTPS frontend origin. Set `VITE_API_URL` to the HTTPS API URL when building the frontend. HTTPS is required for installable PWA and push notifications on real devices.

## API

- `GET /api/activities?date=YYYY-MM-DD` returns activities for that day. Omitting `date` returns all activities for the signed-in user.
- `POST /api/activities` creates an activity with `title`, `startTime`, `endTime`, and optional `date`.
- `PATCH /api/activities/:id` updates any provided activity fields.
- `DELETE /api/activities/:id` removes an activity.
- All activity and push-subscription routes require a Supabase access token; the API restricts records to its verified user.
- `GET /api/notifications/vapid-public-key` returns the public key for browser push subscriptions.
- `POST` and `DELETE /api/notifications/subscriptions` register or remove a signed-in user's device.

Set `VITE_API_URL` to use a different API origin and `CLIENT_ORIGIN` to configure allowed frontend origins.

## Production build

```bash
npm run build
npm run preview
```

## PWA notes

- `public/manifest.json` defines app metadata for install on iPhone/Android.
- `public/sw.js` caches the app shell and displays push notifications.
- Push reminders are sent by the continuously running API at the scheduled local time for each registered device.
