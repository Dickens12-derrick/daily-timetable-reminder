import { supabase } from './supabase';

const STORAGE_PREFIX = 'daily-timetable';
const syncByUser = new Map();

function getStorageKey(userId, collection) {
  return `${STORAGE_PREFIX}:${collection}:${userId}`;
}

function readStorage(userId, collection, fallback) {
  try {
    const stored = localStorage.getItem(getStorageKey(userId, collection));
    return stored ? JSON.parse(stored) : fallback;
  } catch (error) {
    console.error(`Unable to read cached ${collection}:`, error);
    return fallback;
  }
}

function writeStorage(userId, collection, value) {
  try {
    localStorage.setItem(getStorageKey(userId, collection), JSON.stringify(value));
  } catch (error) {
    console.error(`Unable to save cached ${collection}:`, error);
    throw new Error('Unable to save timetable data on this device. Check available storage.');
  }
}

async function getSession() {
  if (!supabase) throw new Error('Authentication is not configured.');
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session?.access_token || !session.user?.id) throw new Error('Sign in to continue.');
  return session;
}

function isNetworkError(error) {
  return !navigator.onLine || error instanceof TypeError;
}

function readActivities(userId) {
  return readStorage(userId, 'activities', []);
}

function saveActivities(userId, activities) {
  writeStorage(userId, 'activities', activities);
}

function updateCachedActivity(userId, activity) {
  const activities = readActivities(userId);
  const index = activities.findIndex((item) => item.id === activity.id);
  if (index === -1) activities.push(activity);
  else activities[index] = activity;
  saveActivities(userId, activities);
}

function queueOperation(userId, operation) {
  const queue = readStorage(userId, 'pending', []);
  queue.push(operation);
  writeStorage(userId, 'pending', queue);
}

async function apiRequest(session, path, options = {}) {
  const { data: { session: currentSession } } = await supabase.auth.getSession();
  const token = currentSession?.access_token || session.access_token;
  const response = await fetch(getApiUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '') || '';
const isLocalApiUrl = /^https?:\/\/(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?$/i.test(configuredApiUrl);
const API_BASE_URL = import.meta.env.DEV || isLocalApiUrl ? '' : configuredApiUrl;

function getApiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

async function applyPending(session) {
  const { user } = session;
  let queue = readStorage(user.id, 'pending', []);

  while (queue.length) {
    const operation = queue[0];
    if (operation.type === 'create') {
      const saved = await apiRequest(session, '/api/activities', {
        method: 'POST',
        body: JSON.stringify(operation.activity),
      });
      saveActivities(user.id, readActivities(user.id).filter((item) => item.id !== operation.localId));
      updateCachedActivity(user.id, saved);
    } else if (operation.type === 'delete') {
      await apiRequest(session, `/api/activities/${encodeURIComponent(operation.id)}`, { method: 'DELETE' });
    }
    queue = queue.slice(1);
    writeStorage(user.id, 'pending', queue);
  }
}

function syncPending(session) {
  const { id } = session.user;
  const existingSync = syncByUser.get(id);
  if (existingSync) return existingSync;

  const sync = applyPending(session).finally(() => syncByUser.delete(id));
  syncByUser.set(id, sync);
  return sync;
}

export async function getActivities(date) {
  const session = await getSession();
  const { user } = session;
  const cached = readActivities(user.id);

  try {
    await syncPending(session);
    const fetched = await apiRequest(
      session,
      `/api/activities${date ? `?date=${encodeURIComponent(date)}` : ''}`,
    );
    const merged = date
      ? [...readActivities(user.id).filter((item) => item.date !== date), ...fetched]
      : fetched;
    saveActivities(user.id, merged);
    return date ? merged.filter((item) => item.date === date) : merged;
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    return date ? cached.filter((item) => item.date === date) : cached;
  }
}

export async function createActivity(activity) {
  const session = await getSession();
  try {
    const saved = await apiRequest(session, '/api/activities', {
      method: 'POST',
      body: JSON.stringify(activity),
    });
    updateCachedActivity(session.user.id, saved);
    return saved;
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    const localActivity = { ...activity, id: `local-${crypto.randomUUID()}`, createdAt: new Date().toISOString() };
    queueOperation(session.user.id, { type: 'create', localId: localActivity.id, activity });
    updateCachedActivity(session.user.id, localActivity);
    return localActivity;
  }
}

export async function deleteActivity(id) {
  const session = await getSession();
  const cached = readActivities(session.user.id);
  const isLocal = id.startsWith('local-');
  if (isLocal) {
    const queue = readStorage(session.user.id, 'pending', []);
    writeStorage(session.user.id, 'pending', queue.filter((operation) => operation.localId !== id));
  } else {
    try {
      await apiRequest(session, `/api/activities/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      queueOperation(session.user.id, { type: 'delete', id });
    }
  }
  saveActivities(session.user.id, cached.filter((activity) => activity.id !== id));
}
