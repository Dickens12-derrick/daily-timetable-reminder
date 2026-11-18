const STORAGE_KEY = 'daily-timetable:activities:local';
const LEGACY_PREFIX = 'daily-timetable:activities:';

function parseActivities(value) {
  if (!Array.isArray(value)) throw new Error('Saved timetable data is not a list.');
  const isValidActivity = (activity) => (
    activity
    && typeof activity.id === 'string'
    && typeof activity.title === 'string'
    && typeof activity.startTime === 'string'
    && typeof activity.endTime === 'string'
    && typeof activity.date === 'string'
  );
  if (!value.every(isValidActivity)) throw new Error('Saved timetable data contains an invalid activity.');
  return value;
}

function loadActivities() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return parseActivities(JSON.parse(stored));

    const legacyKeys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter((key) => key?.startsWith(LEGACY_PREFIX) && key !== STORAGE_KEY);
    if (legacyKeys.length === 1) {
      const imported = parseActivities(JSON.parse(localStorage.getItem(legacyKeys[0]) || '[]'));
      saveActivities(imported);
      return imported;
    }

    return [];
  } catch (error) {
    console.error('Unable to load saved activities:', error);
    throw new Error('Unable to load timetable data from this device.');
  }
}

function saveActivities(activities) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(activities));
  } catch (error) {
    console.error('Unable to save activities:', error);
    throw new Error('Unable to save timetable data on this device. Check available storage.');
  }
}

export async function getActivities(date) {
  const activities = loadActivities();
  return date ? activities.filter((activity) => activity.date === date) : activities;
}

export async function createActivity(activity) {
  const activities = loadActivities();
  const saved = {
    ...activity,
    id: `local-${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
  };
  saveActivities([...activities, saved]);
  return saved;
}

export async function deleteActivity(id) {
  saveActivities(loadActivities().filter((activity) => activity.id !== id));
}
