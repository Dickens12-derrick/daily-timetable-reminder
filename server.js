import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';

const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT) || 5000;
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : null;
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5175')
  .split(',')
  .map((origin) => origin.trim());
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const pushConfigured = Boolean(vapidPublicKey && vapidPrivateKey);

if (pushConfigured) {
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    vapidPublicKey,
    vapidPrivateKey,
  );
}

app.use(cors({
  origin(origin, callback) {
    const isLocalDevelopmentOrigin = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || '');
    callback(null, !origin || allowedOrigins.includes(origin) || isLocalDevelopmentOrigin);
  },
}));
app.use(express.json());

function isValidDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function requireAuth(req, res, next) {
  if (!supabase) {
    return res.status(503).json({ error: 'Authentication is not configured on the API.' });
  }

  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Sign in is required.' });

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: 'Your session is invalid or expired.' });
    req.user = data.user;
    return next();
  } catch (error) {
    console.error('Authentication verification failed:', error);
    return res.status(401).json({ error: 'Unable to verify your session.' });
  }
}

function getLocalDateTime(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

let dispatchingNotifications = false;

async function dispatchDueNotifications() {
  if (!pushConfigured || dispatchingNotifications) return;
  dispatchingNotifications = true;

  try {
    const subscriptions = await prisma.pushSubscription.findMany();
    const subscriptionsByZone = new Map();
    for (const subscription of subscriptions) {
      const current = subscriptionsByZone.get(subscription.timeZone) || [];
      current.push(subscription);
      subscriptionsByZone.set(subscription.timeZone, current);
    }

    for (const [timeZone, zoneSubscriptions] of subscriptionsByZone) {
      const { date, time } = getLocalDateTime(timeZone);
      const userIds = [...new Set(zoneSubscriptions.map((subscription) => subscription.userId))];
      const activities = await prisma.activity.findMany({
        where: { userId: { in: userIds }, date, startTime: time },
      });

      for (const activity of activities) {
        const targets = zoneSubscriptions.filter((subscription) => subscription.userId === activity.userId);
        for (const subscription of targets) {
          const delivery = await prisma.pushDelivery.upsert({
            where: { activityId_subscriptionId: { activityId: activity.id, subscriptionId: subscription.id } },
            create: { activityId: activity.id, subscriptionId: subscription.id },
            update: {},
          });
          if (delivery.deliveredAt) continue;

          await prisma.pushDelivery.update({
            where: { id: delivery.id },
            data: { attempts: { increment: 1 } },
          });

          try {
            await webPush.sendNotification({
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            }, JSON.stringify({
              title: activity.title,
              body: `${activity.startTime} - ${activity.endTime}`,
              url: '/',
              tag: `activity-${activity.id}`,
            }));
            await prisma.pushDelivery.update({ where: { id: delivery.id }, data: { deliveredAt: new Date() } });
          } catch (error) {
            if (error.statusCode === 404 || error.statusCode === 410) {
              await prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
            } else {
              console.error(`Push delivery failed for activity ${activity.id}:`, error.message);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Reminder dispatch failed:', error);
  } finally {
    dispatchingNotifications = false;
  }
}

app.get('/api/notifications/vapid-public-key', (_req, res) => {
  if (!pushConfigured) return res.status(503).json({ error: 'Push notifications are not configured on the API.' });
  return res.json({ publicKey: vapidPublicKey });
});

app.use('/api', requireAuth);

app.get('/api/activities', async (req, res) => {
  const date = req.query.date;
  if (date !== undefined && !isValidDate(date)) {
    return res.status(400).json({ error: 'date must use YYYY-MM-DD format.' });
  }

  try {
    const activities = await prisma.activity.findMany({
      where: { userId: req.user.id, ...(date ? { date } : {}) },
      orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
    });
    return res.json(activities);
  } catch (error) {
    console.error('Failed to fetch activities:', error);
    return res.status(500).json({ error: 'Unable to fetch activities.' });
  }
});

app.post('/api/activities', async (req, res) => {
  const { title, startTime, endTime } = req.body ?? {};
  const date = req.body?.date || new Date().toISOString().slice(0, 10);

  if (![title, startTime, endTime].every((value) => typeof value === 'string' && value.trim())) {
    return res.status(400).json({ error: 'title, startTime, and endTime are required.' });
  }
  if (!isValidDate(date)) {
    return res.status(400).json({ error: 'date must use YYYY-MM-DD format.' });
  }

  try {
    const activity = await prisma.activity.create({
      data: { userId: req.user.id, title: title.trim(), startTime: startTime.trim(), endTime: endTime.trim(), date },
    });
    return res.status(201).json(activity);
  } catch (error) {
    console.error('Failed to create activity:', error);
    return res.status(500).json({ error: 'Unable to create activity.' });
  }
});

app.patch('/api/activities/:id', async (req, res) => {
  const allowedFields = ['title', 'startTime', 'endTime', 'date'];
  const updates = Object.fromEntries(
    allowedFields.filter((field) => Object.hasOwn(req.body ?? {}, field)).map((field) => [field, req.body[field]]),
  );

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Provide at least one activity field to update.' });
  }
  if (['title', 'startTime', 'endTime'].some((field) => field in updates && (typeof updates[field] !== 'string' || !updates[field].trim()))) {
    return res.status(400).json({ error: 'title, startTime, and endTime must be non-empty strings.' });
  }
  if ('date' in updates && !isValidDate(updates.date)) {
    return res.status(400).json({ error: 'date must use YYYY-MM-DD format.' });
  }

  for (const field of ['title', 'startTime', 'endTime']) {
    if (field in updates) updates[field] = updates[field].trim();
  }

  try {
    const activity = await prisma.activity.update({ where: { id: req.params.id, userId: req.user.id }, data: updates });
    return res.json(activity);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Activity not found.' });
    console.error('Failed to update activity:', error);
    return res.status(500).json({ error: 'Unable to update activity.' });
  }
});

app.delete('/api/activities/:id', async (req, res) => {
  try {
    const result = await prisma.activity.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
    return result.count ? res.status(204).end() : res.status(404).json({ error: 'Activity not found.' });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Activity not found.' });
    console.error('Failed to delete activity:', error);
    return res.status(500).json({ error: 'Unable to delete activity.' });
  }
});

app.post('/api/notifications/subscriptions', async (req, res) => {
  const { endpoint, keys } = req.body ?? {};
  const timeZone = req.body?.timeZone || 'UTC';
  if (typeof endpoint !== 'string' || typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') {
    return res.status(400).json({ error: 'A valid push subscription is required.' });
  }
  try {
    if (new URL(endpoint).protocol !== 'https:') return res.status(400).json({ error: 'Push endpoint must use HTTPS.' });
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    return res.status(400).json({ error: 'A valid IANA time zone is required.' });
  }
  if (!pushConfigured) return res.status(503).json({ error: 'Push notifications are not configured on the API.' });

  try {
    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: req.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, timeZone },
      update: { userId: req.user.id, p256dh: keys.p256dh, auth: keys.auth, timeZone },
    });
    return res.status(201).json({ id: subscription.id });
  } catch (error) {
    console.error('Failed to save push subscription:', error);
    return res.status(500).json({ error: 'Unable to enable push notifications.' });
  }
});

app.delete('/api/notifications/subscriptions', async (req, res) => {
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== 'string') return res.status(400).json({ error: 'A subscription endpoint is required.' });
  try {
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user.id } });
    return res.status(204).end();
  } catch (error) {
    console.error('Failed to remove push subscription:', error);
    return res.status(500).json({ error: 'Unable to disable push notifications.' });
  }
});

const server = app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
  if (pushConfigured) {
    dispatchDueNotifications();
    setInterval(dispatchDueNotifications, 15000);
  } else {
    console.warn('Push delivery is disabled: VAPID keys are not configured.');
  }
});

async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);