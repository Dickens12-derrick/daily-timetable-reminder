import { supabase } from './supabase';
import { readApiResponse } from './apiResponse';
export {
  createActivity,
  deleteActivity,
  getActivities,
} from './offlineActivities';

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '') || '';
const isLocalApiUrl = /^https?:\/\/(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?$/i.test(configuredApiUrl);
const API_BASE_URL = import.meta.env.DEV || isLocalApiUrl ? '' : configuredApiUrl;

function getApiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

async function request(path, options = {}) {
  if (!supabase) throw new Error('Authentication is not configured. Add the Supabase frontend settings to .env.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in to continue.');

  const response = await fetch(getApiUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    },
  });

  return readApiResponse(response);
}

export function updateActivity(id, updates) {
  return request(`/api/activities/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function getVapidPublicKey() {
  const response = await fetch(getApiUrl('/api/notifications/vapid-public-key'));
  const payload = await readApiResponse(response, 'Unable to load push notification settings');
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