import { supabase } from './supabase';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

async function request(path, options = {}) {
  if (!supabase) throw new Error('Authentication is not configured. Add the Supabase frontend settings to .env.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in to continue.');

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    },
  });

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status}).`);
  }
  return payload;
}

export function getActivities(date) {
  return request(`/api/activities?date=${encodeURIComponent(date)}`);
}

export function createActivity(activity) {
  return request('/api/activities', {
    method: 'POST',
    body: JSON.stringify(activity),
  });
}

export function updateActivity(id, updates) {
  return request(`/api/activities/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export function deleteActivity(id) {
  return request(`/api/activities/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getVapidPublicKey() {
  const response = await fetch(`${API_BASE_URL}/api/notifications/vapid-public-key`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Unable to load push notification settings.');
  return payload.publicKey;
}

export function savePushSubscription(subscription, timeZone) {
  return request('/api/notifications/subscriptions', {
    method: 'POST',
    body: JSON.stringify({ ...subscription.toJSON(), timeZone }),
  });
}

export function removePushSubscription(endpoint) {
  return request('/api/notifications/subscriptions', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint }),
  });
}