import { useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'daily-timetable-v1';
const TOAST_TIMEOUT = 4200;

function timeToMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function sortActivities(activities) {
  return [...activities].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
}

const defaultActivities = [
  { id: crypto.randomUUID(), title: 'Morning Workout', startTime: '07:00', endTime: '07:45' },
  { id: crypto.randomUUID(), title: 'Team Standup', startTime: '09:00', endTime: '09:30' },
  { id: crypto.randomUUID(), title: 'Focus Block', startTime: '14:00', endTime: '16:00' },
];

export default function App() {
  const [activities, setActivities] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return defaultActivities;
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) && parsed.length ? parsed : defaultActivities;
    } catch {
      return defaultActivities;
    }
  });

  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState('today');
  const [now, setNow] = useState(new Date());
  const notifiedRef = useRef(new Set());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(activities));
  }, [activities]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  useEffect(() => {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const key = `${now.getHours()}:${now.getMinutes()}`;

    const triggered = activities.filter((activity) => {
      const start = timeToMinutes(activity.startTime);
      return currentMinutes === start && !notifiedRef.current.has(`${activity.id}-${key}`);
    });

    triggered.forEach((activity) => {
      notifiedRef.current.add(`${activity.id}-${key}`);
      setToast({ title: activity.title, text: `${activity.startTime} - ${activity.endTime}` });

      try {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (AudioCtor) {
          const ctx = new AudioCtor();
          const oscillator = ctx.createOscillator();
          const gainNode = ctx.createGain();

          oscillator.type = 'sine';
          oscillator.frequency.value = 820;
          gainNode.gain.value = 0.0001;

          oscillator.connect(gainNode);
          gainNode.connect(ctx.destination);

          oscillator.start();
          gainNode.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.05);
          gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
          oscillator.stop(ctx.currentTime + 0.5);
        }
      } catch {
        // Ignore audio errors in unsupported browsers.
      }
    });

    if (triggered.length > 0) {
      const timer = setTimeout(() => setToast(null), TOAST_TIMEOUT);
      return () => clearTimeout(timer);
    }

    if (toast) {
      const timer = setTimeout(() => setToast(null), TOAST_TIMEOUT);
      return () => clearTimeout(timer);
    }
  }, [activities, now, toast]);

  const sortedActivities = useMemo(() => sortActivities(activities), [activities]);

  const timelineItems = useMemo(() => {
    return Array.from({ length: 48 }, (_, index) => {
      const minutes = index * 30;
      const label = formatMinutes(minutes);
      const current = sortedActivities.find((activity) => {
        const start = timeToMinutes(activity.startTime);
        const end = timeToMinutes(activity.endTime);
        return minutes >= start && minutes < end;
      });

      return { label, minutes, activity: current || null };
    });
  }, [sortedActivities]);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const createActivity = (event) => {
    event.preventDefault();
    if (!title.trim()) return;

    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    if (end <= start) {
      setToast({ title: 'Invalid time range', text: 'End time must be later than start time.' });
      return;
    }

    const nextItem = { id: crypto.randomUUID(), title: title.trim(), startTime, endTime };
    setActivities((prev) => sortActivities([...prev, nextItem]));
    setTitle('');
    setStartTime('09:00');
    setEndTime('10:00');
    setToast({ title: 'Activity added', text: `${nextItem.title} was saved to your timetable.` });
  };

  const removeActivity = (id) => {
    setActivities((prev) => prev.filter((activity) => activity.id !== id));
  };

  const getStatus = (activity) => {
    const start = timeToMinutes(activity.startTime);
    const end = timeToMinutes(activity.endTime);
    if (nowMinutes >= start && nowMinutes < end) return 'live';
    if (nowMinutes < start) return 'up-next';
    return 'done';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <aside className="w-full border-b border-white/10 bg-slate-950/80 p-4 backdrop-blur md:p-6 lg:w-[420px] lg:border-b-0 lg:border-r lg:border-white/10">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-violet-300">Daily plan</p>
              <h1 className="mt-2 text-2xl font-bold">Timetable</h1>
            </div>
            <div className="rounded-full border border-violet-500/50 bg-violet-500/10 px-3 py-1 text-xs text-violet-200">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>

          <form onSubmit={createActivity} className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-glow">
            <div>
              <label className="mb-2 block text-sm text-slate-300">Activity title</label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Focus session"
                className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-violet-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-2 block text-sm text-slate-300">Start</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-3 text-white outline-none transition focus:border-violet-400"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-300">End</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-3 text-white outline-none transition focus:border-violet-400"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-cyan-500 px-4 py-3 font-semibold text-white shadow-lg shadow-violet-600/30 transition hover:brightness-110"
            >
              Add activity
            </button>
          </form>

          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Today</h2>
              <span className="text-xs text-slate-400">{sortedActivities.length} items</span>
            </div>

            <div className="space-y-3">
              {sortedActivities.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-400">
                  No activities yet. Add one to get started.
                </div>
              ) : (
                sortedActivities.map((activity) => {
                  const status = getStatus(activity);
                  const statusText = {
                    live: 'Live',
                    'up-next': 'Up next',
                    done: 'Done',
                  }[status];

                  return (
                    <div key={activity.id} className="rounded-2xl border border-white/10 bg-slate-900/80 p-3 shadow-lg shadow-slate-950/40">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-white">{activity.title}</p>
                          <p className="mt-1 text-sm text-slate-300">
                            {activity.startTime} - {activity.endTime}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeActivity(activity.id)}
                          className="rounded-full border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 transition hover:border-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <span className="rounded-full bg-violet-500/15 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-violet-200">
                          {statusText}
                        </span>
                        <span className="text-xs text-slate-400">
                          {timeToMinutes(activity.endTime) - timeToMinutes(activity.startTime)} min
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        <main className="flex-1 p-4 md:p-6">
          <div className="mb-4 flex items-center justify-between lg:hidden">
            <button
              type="button"
              onClick={() => setActiveTab('today')}
              className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium ${activeTab === 'today' ? 'bg-violet-500 text-white' : 'bg-slate-800 text-slate-300'}`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('timeline')}
              className={`ml-2 flex-1 rounded-xl px-4 py-2 text-sm font-medium ${activeTab === 'timeline' ? 'bg-violet-500 text-white' : 'bg-slate-800 text-slate-300'}`}
            >
              Timeline
            </button>
          </div>

          <div className={`${activeTab === 'today' ? 'block' : 'hidden'} lg:block`}>
            <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-glow md:p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.26em] text-cyan-300">Overview</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Daily rhythm</h2>
                </div>
                <div className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200">
                  {sortedActivities.filter((activity) => getStatus(activity) === 'live').length} active
                </div>
              </div>

              <div className="space-y-3">
                {sortedActivities.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800/70 p-5 text-slate-400">
                    Your schedule is empty right now.
                  </div>
                ) : (
                  sortedActivities.map((activity) => {
                    const start = timeToMinutes(activity.startTime);
                    const end = timeToMinutes(activity.endTime);
                    const duration = Math.max(30, end - start);
                    const pct = Math.min(100, Math.max(8, (duration / (24 * 60)) * 100));
                    const live = getStatus(activity) === 'live';

                    return (
                      <div key={activity.id} className="rounded-2xl border border-white/10 bg-slate-800/80 p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-white">{activity.title}</p>
                            <p className="text-sm text-slate-300">{activity.startTime} → {activity.endTime}</p>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${live ? 'bg-emerald-500/15 text-emerald-200' : 'bg-slate-700 text-slate-300'}`}>
                            {live ? 'Now' : 'Scheduled'}
                          </span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-slate-700">
                          <div
                            className={`h-full rounded-full ${live ? 'bg-gradient-to-r from-emerald-400 to-cyan-400' : 'bg-gradient-to-r from-violet-500 to-indigo-400'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className={`${activeTab === 'timeline' ? 'block' : 'hidden'} lg:block`}>
            <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-glow md:p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.26em] text-violet-300">Schedule</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Timeline</h2>
                </div>
                <div className="rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1 text-xs text-violet-200">
                  {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
              </div>

              <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
                {timelineItems.map(({ label, minutes, activity }) => {
                  const isCurrentHour = minutes === now.getHours() * 60 + now.getMinutes();
                  const isCurrentBlock = activity && getStatus(activity) === 'live';

                  return (
                    <div
                      key={`${label}-${minutes}`}
                      className={`flex items-center gap-3 rounded-2xl border px-3 py-2 ${isCurrentHour ? 'border-cyan-400/60 bg-cyan-500/10' : 'border-white/5 bg-slate-800/60'}`}
                    >
                      <div className="w-16 text-xs text-slate-400">{label}</div>
                      <div className="flex-1">
                        {activity ? (
                          <div className={`rounded-xl border px-3 py-2 ${isCurrentBlock ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-violet-400/40 bg-violet-500/10'}`}>
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-medium text-white">{activity.title}</p>
                              <span className="text-[10px] uppercase tracking-[0.18em] text-violet-200">
                                {activity.startTime}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-300">{activity.startTime} - {activity.endTime}</p>
                          </div>
                        ) : (
                          <div className="h-8 rounded-xl border border-dashed border-slate-700 bg-slate-900/40" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </main>
      </div>

      {toast && (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-violet-400/30 bg-slate-900/90 p-4 shadow-2xl shadow-violet-900/40 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-violet-300">Reminder</p>
              <p className="mt-1 font-semibold text-white">{toast.title}</p>
              <p className="mt-1 text-sm text-slate-300">{toast.text}</p>
            </div>
            <div className="mt-1 h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
          </div>
        </div>
      )}
    </div>
  );
}
