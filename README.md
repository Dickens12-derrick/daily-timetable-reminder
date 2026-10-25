# Daily Timetable & Reminder

A mobile-first calendar/reminder app built with React + Vite + Tailwind CSS.

## Features

- Mobile-first dark dashboard
- Add, view, and remove timetable items
- Local storage persistence with `localStorage`
- Visual toast reminders and subtle browser audio cues at the exact start time
- Responsive desktop split layout
- PWA manifest and service worker setup for installability

## Run locally

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

## PWA notes

- `public/manifest.json` defines app metadata for install on iPhone/Android.
- `public/sw.js` provides a minimal offline cache for installable app experience.
- Replace the placeholder SVG icon with a PNG version for a production-ready app icon.
