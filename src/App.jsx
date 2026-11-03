import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  createActivity as createActivityRequest,
  deleteActivity as deleteActivityRequest,
  getActivities,
  getVapidPublicKey,
  removePushSubscription,
  savePushSubscription,
} from './services/api';
import { isSupabaseConfigured, supabase } from './services/supabase';
import PlannerScene from './components/PlannerScene';

const TOAST_TIMEOUT = 4200;

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDate(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day + days);
  return getLocalDateString(date);
}

function formatSelectedDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function timeToMinutes(time) {
  if (typeof time === 'number') return Math.max(0, time);
  const normalized = String(time ?? '').trim();
  if (!normalized) return 0;
  if (/^\d+$/.test(normalized)) return Number(normalized);
  const [hours, minutes] = normalized.split(':').map(Number);
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

function formatActivityDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function encodeApplicationServerKey(key) {
  const padding = '='.repeat((4 - (key.length % 4)) % 4);
  const base64 = `${key}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(window.atob(base64), (character) => character.charCodeAt(0));
}

function AuthenticationScreen({ theme, onThemeChange, isPasswordRecovery, onPasswordRecoveryComplete, onInstallApp, isAppInstalled, installHelp }) {
  const [mode, setMode] = useState('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsSubmitting(true);
    try {
      if (isPasswordRecovery) {
        if (password !== passwordConfirmation) throw new Error('The passwords do not match.');
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setMessage('Your password has been updated.');
        onPasswordRecoveryComplete();
        return;
      }

      if (mode === 'reset') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/?password-reset=1`,
        });
        if (resetError) throw resetError;
        setMessage('If an account exists for that email, a password reset link is on its way.');
        return;
      }

      const result = mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
      if (result.error) throw result.error;
      if (mode === 'sign-up' && !result.data.session) {
        setMessage('Check your email to confirm your account, then sign in.');
      }
    } catch (requestError) {
      setError(requestError.message || 'Unable to authenticate.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <main className="auth-screen">
        <section className="auth-panel">
          <p className="auth-eyebrow">Daily plan</p>
          <h1>Connect your account service</h1>
          <p>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your local environment, then restart Vite.</p>
          <p className="auth-note">The API also needs <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> in its environment.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-screen">
      <PlannerScene theme={theme} />
      <button
        className="auth-theme-toggle"
        type="button"
        onClick={onThemeChange}
        aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
        title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
      >
        {theme === 'light' ? '☾' : '☼'}
      </button>
      <section className="auth-panel">
        <p className="auth-eyebrow">Daily plan</p>
        {!isAppInstalled && (
          <div className="install-app-block">
            <button type="button" className="install-app-button" onClick={onInstallApp}>
              <span aria-hidden="true">↓</span> Install app
            </button>
            {installHelp && <p className="install-app-help" role="status">{installHelp}</p>}
          </div>
        )}
        <h1>{isPasswordRecovery ? 'Choose a new password' : mode === 'reset' ? 'Reset your password' : mode === 'sign-in' ? 'Welcome To Daily Plan' : 'Create your account'}</h1>
        <p className="auth-description">{isPasswordRecovery ? 'Set a new password for your account.' : 'Your timetable and reminders stay connected to your account.'}</p>
        <form className="auth-form" onSubmit={submit}>
          {!isPasswordRecovery && <label htmlFor="auth-email">Email</label>}
          {!isPasswordRecovery && <input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />}
          {(isPasswordRecovery || mode !== 'reset') && (
            <>
              <label htmlFor="auth-password">{isPasswordRecovery ? 'New password' : 'Password'}</label>
              <div className="password-input-wrap">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                  minLength="8"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  className="password-visibility-toggle"
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {isPasswordRecovery && (
                <>
                  <label htmlFor="auth-password-confirmation">Confirm new password</label>
                  <input
                    id="auth-password-confirmation"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    minLength="8"
                    required
                    value={passwordConfirmation}
                    onChange={(event) => setPasswordConfirmation(event.target.value)}
                  />
                </>
              )}
            </>
          )}
          {error && <p className="auth-error" role="alert">{error}</p>}
          {message && <p className="auth-message" role="status">{message}</p>}
          <button className="primary-action" type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? 'Please wait...'
              : isPasswordRecovery
                ? 'Update password'
                : mode === 'reset'
                  ? 'Send reset link'
                  : mode === 'sign-in'
                    ? 'Sign in'
                    : 'Create account'}
          </button>
        </form>
        {!isPasswordRecovery && (
          <div className="auth-links">
            {mode === 'sign-in' && (
              <button className="auth-mode-toggle" type="button" onClick={() => { setMode('reset'); setError(''); setMessage(''); }}>
                Forgot your password?
              </button>
            )}
            <button className="auth-mode-toggle" type="button" onClick={() => { setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up'); setError(''); setMessage(''); }}>
              {mode === 'sign-up' ? 'Already have an account? Sign in' : 'New here? Create an account'}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('planner-theme') || 'light');
  const [activities, setActivities] = useState([]);
  const [allActivities, setAllActivities] = useState([]);
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [toast, setToast] = useState(null);
  const [apiError, setApiError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateString());
  const [notificationPermission, setNotificationPermission] = useState(() => (
    'Notification' in window ? window.Notification.permission : 'unsupported'
  ));
  const [pushEnabled, setPushEnabled] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [alarmSoundEnabled, setAlarmSoundEnabled] = useState(false);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState('today');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isAppInstalled, setIsAppInstalled] = useState(() => (
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  ));
  const [installHelp, setInstallHelp] = useState('');
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(() => (
    new URLSearchParams(window.location.search).has('password-reset')
  ));
  const [now, setNow] = useState(new Date());
  const notifiedRef = useRef(new Set());
  const audioContextRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('planner-theme', theme);
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return undefined;
    }

    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (active) {
        setUser(data.session?.user || null);
        if (error) setApiError(error.message);
        setAuthReady(true);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
      setPushEnabled(false);
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady || !user) {
      setAllActivities([]);
      return undefined;
    }

    let active = true;
    setHistoryLoading(true);
    getActivities()
      .then((items) => {
        if (active) setAllActivities(items);
      })
      .catch((error) => {
        if (active) setApiError(error.message);
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => { active = false; };
  }, [authReady, isOnline, user?.id]);

  useEffect(() => {
    if (!authReady || !user) {
      setActivities([]);
      setIsLoading(false);
      return undefined;
    }

    let active = true;
    setIsLoading(true);
    setApiError('');
    getActivities(selectedDate)
      .then((items) => {
        if (active) setActivities(sortActivities(items));
      })
      .catch((error) => {
        if (active) setApiError(error.message);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [authReady, isOnline, selectedDate, user?.id]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
  }, []);

  useEffect(() => {
    const handleInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const handleInstalled = () => {
      setIsAppInstalled(true);
      setInstallPrompt(null);
      setInstallHelp('');
    };

    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const installApp = async () => {
    setInstallHelp('');
    if (installPrompt) {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') setIsAppInstalled(true);
      setInstallPrompt(null);
      return;
    }

    const isAppleMobile = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    setInstallHelp(isAppleMobile
      ? 'In Safari, tap Share, then Add to Home Screen.'
      : 'Open your browser menu and choose Install app or Add to Home Screen.');
  };

  const playAlarmTone = () => {
    const context = audioContextRef.current;
    if (!context || context.state !== 'running') return;

    const startAt = context.currentTime;
    [0, 0.32, 0.64].forEach((offset) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, startAt + offset);
      gain.gain.exponentialRampToValueAtTime(0.2, startAt + offset + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.23);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt + offset);
      oscillator.stop(startAt + offset + 0.24);
    });
  };

  const enableAlarmSound = async () => {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) {
      setApiError('Alarm sound is not supported by this browser.');
      return;
    }

    try {
      const context = audioContextRef.current || new AudioCtor();
      audioContextRef.current = context;
      await context.resume();
      setAlarmSoundEnabled(true);
      playAlarmTone();
      setApiError('');
    } catch (error) {
      setApiError(`Unable to enable alarm sound: ${error.message}`);
    }
  };

  useEffect(() => {
    if (!user) return undefined;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const key = `${now.getHours()}:${now.getMinutes()}`;
    const today = getLocalDateString(now);

    const triggered = allActivities.filter((activity) => {
      const start = timeToMinutes(activity.startTime);
      const reminderKey = `${user.id}-${activity.id}-${activity.date}-${key}`;
      if (activity.date !== today || currentMinutes !== start || notifiedRef.current.has(reminderKey)) return false;
      try {
        if (localStorage.getItem(`timetable-reminded:${reminderKey}`)) {
          notifiedRef.current.add(reminderKey);
          return false;
        }
        localStorage.setItem(`timetable-reminded:${reminderKey}`, '1');
      } catch (error) {
        console.error('Unable to persist reminder state:', error);
      }
      notifiedRef.current.add(reminderKey);
      return true;
    });

    triggered.forEach((activity) => {
      setToast({ title: activity.title, text: `${activity.startTime} - ${activity.endTime}` });

      if ('Notification' in window && window.Notification.permission === 'granted') {
        navigator.serviceWorker.ready
          .then((registration) => registration.showNotification('Activity Reminder', {
            body: `It's time for: ${activity.title}`,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: `activity-${activity.id}`,
            vibrate: [200, 100, 200],
          }))
          .catch((error) => {
            console.error('Unable to show activity notification:', error);
          });
      }

      if (alarmSoundEnabled) playAlarmTone();
    });

    if (triggered.length > 0) {
      const timer = setTimeout(() => setToast(null), TOAST_TIMEOUT);
      return () => clearTimeout(timer);
    }

    if (toast) {
      const timer = setTimeout(() => setToast(null), TOAST_TIMEOUT);
      return () => clearTimeout(timer);
    }
  }, [alarmSoundEnabled, allActivities, now, toast, user]);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  function getStatus(activity) {
    const today = getLocalDateString(now);
    if (activity.date < today) return 'done';
    if (activity.date > today) return 'up-next';
    const start = timeToMinutes(activity.startTime);
    const end = timeToMinutes(activity.endTime);
    if (nowMinutes >= end) return 'done';
    if (nowMinutes >= start) return 'live';
    return 'up-next';
  }

  const sortedActivities = useMemo(() => sortActivities(activities), [activities]);
  const completedActivities = useMemo(() => allActivities
    .filter((activity) => getStatus(activity) === 'done')
    .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime)), [allActivities, now]);
  const weeklyActivityData = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - index));
    const dateString = getLocalDateString(date);
    const dailyItems = allActivities.filter((activity) => activity.date === dateString);
    const done = dailyItems.filter((activity) => getStatus(activity) === 'done');
    const pending = dailyItems.filter((activity) => getStatus(activity) !== 'done');
    const minutes = (items) => items.reduce((total, activity) => (
      total + Math.max(0, timeToMinutes(activity.endTime) - timeToMinutes(activity.startTime))
    ), 0);
    return {
      day: date.toLocaleDateString(undefined, { weekday: 'short' }),
      completed: done.length,
      planned: pending.length,
      completedMinutes: minutes(done),
    };
  }), [allActivities, now]);
  const completedCount = completedActivities.length;
  const completedMinutes = completedActivities.reduce((total, activity) => (
    total + Math.max(0, timeToMinutes(activity.endTime) - timeToMinutes(activity.startTime))
  ), 0);
  const completionRate = allActivities.length ? Math.round((completedCount / allActivities.length) * 100) : 0;

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

  const finishPasswordRecovery = () => {
    window.history.replaceState({}, '', window.location.pathname);
    setIsPasswordRecovery(false);
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }
    const permission = await window.Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission !== 'granted') return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const publicKey = await getVapidPublicKey();
      const subscription = await registration.pushManager.getSubscription()
        || await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: encodeApplicationServerKey(publicKey),
        });
      await savePushSubscription(subscription, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
      setPushEnabled(true);
      setApiError('');
      setToast({ title: 'Reminders enabled', text: `Push reminders are linked to ${user.email}.` });
    } catch (error) {
      setApiError(error.message);
    }
  };

  const signOut = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
    } catch (error) {
      setApiError(error.message);
    }
    await supabase.auth.signOut();
  };

  const createActivity = async (event) => {
    event.preventDefault();
    if (!title.trim() || isSaving) return;

    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    if (endMinutes <= startMinutes) {
      setToast({ title: 'Invalid time range', text: 'End time must be later than start time.' });
      return;
    }

    setIsSaving(true);
    setApiError('');
    try {
      const nextItem = await createActivityRequest({
        title: title.trim(),
        startTime,
        endTime,
        date: selectedDate,
      });
      setActivities((prev) => sortActivities([...prev, nextItem]));
      setAllActivities((prev) => [...prev, nextItem]);
      setTitle('');
      setStartTime('09:00');
      setEndTime('10:00');
      setToast({
        title: nextItem.id.startsWith('local-') ? 'Saved offline' : 'Activity added',
        text: nextItem.id.startsWith('local-')
          ? `${nextItem.title} is saved on this device and will sync when online.`
          : `${nextItem.title} was saved to your timetable.`,
      });
    } catch (error) {
      setApiError(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const removeActivity = async (id) => {
    setApiError('');
    try {
      await deleteActivityRequest(id);
      setActivities((prev) => prev.filter((activity) => activity.id !== id));
      setAllActivities((prev) => prev.filter((activity) => activity.id !== id));
    } catch (error) {
      setApiError(error.message);
    }
  };

  useEffect(() => {
    if (!user || notificationPermission !== 'granted') return;
    let active = true;
    navigator.serviceWorker?.ready
      .then(async (registration) => {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await savePushSubscription(subscription, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
          if (active) setPushEnabled(true);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [notificationPermission, user?.id]);

  if (!authReady) {
    return <main className="auth-screen"><p className="auth-description">Loading your account...</p></main>;
  }
  if (!user || isPasswordRecovery) return (
    <AuthenticationScreen
      theme={theme}
      onThemeChange={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
      isPasswordRecovery={isPasswordRecovery}
      onPasswordRecoveryComplete={finishPasswordRecovery}
      onInstallApp={installApp}
      isAppInstalled={isAppInstalled}
      installHelp={installHelp}
    />
  );

  return (
    <div className="app-shell min-h-screen bg-slate-950 text-slate-100" data-theme={theme}>
      <PlannerScene theme={theme} />
      <div className="planner-layout mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <aside className="planner-sidebar w-full border-b border-white/10 bg-slate-950/80 p-4 backdrop-blur md:p-6 lg:w-[420px] lg:border-b-0 lg:border-r lg:border-white/10">
          <div className="planner-brand mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-violet-300">Daily plan</p>
              <h1 className="mt-2 text-2xl font-bold">Timetable</h1>
            </div>
            <div className="planner-brand-actions">
              {!isAppInstalled && (
                <button className="install-app-button" type="button" onClick={installApp} aria-label="Install Daily Timetable app">
                  <span aria-hidden="true">↓</span> Install
                </button>
              )}
              <div className="planner-clock rounded-full border border-violet-500/50 bg-violet-500/10 px-3 py-1 text-xs text-violet-200">
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
          {installHelp && !isAppInstalled && <p className="install-app-help planner-install-help" role="status">{installHelp}</p>}

          <div className="account-bar">
            <span title={user.email}>{user.email}</span>
            <div className="account-actions">
              <button
                className="theme-toggle"
                type="button"
                onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
              >
                {theme === 'light' ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.1A8.5 8.5 0 0 1 8.9 3.8 8.7 8.7 0 1 0 20.2 15.1Z" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg>
                )}
              </button>
              <button type="button" onClick={signOut}>Sign out</button>
            </div>
          </div>
          <p className="mb-4 text-xs text-slate-400" role="status">
            {isOnline ? 'Online · activity history syncs to your account' : 'Offline · saved activities and history are available on this device'}
          </p>

          <div className="calendar-controls mb-5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedDate((date) => shiftDate(date, -1))}
              aria-label="Previous day"
              className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:border-violet-400"
            >
              ←
            </button>
            <input
              type="date"
              aria-label="Schedule date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900 px-2 py-2 text-sm text-white outline-none focus:border-violet-400"
            />
            <button
              type="button"
              onClick={() => setSelectedDate((date) => shiftDate(date, 1))}
              aria-label="Next day"
              className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:border-violet-400"
            >
              →
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(getLocalDateString())}
              className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-200 hover:border-violet-400"
            >
              Today
            </button>
          </div>

          <button
            type="button"
            onClick={requestNotificationPermission}
            disabled={pushEnabled || notificationPermission === 'denied' || notificationPermission === 'unsupported'}
            className="notification-toggle mb-5 w-full rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-default disabled:opacity-70"
          >
            {pushEnabled
              ? 'Reminders enabled for this account'
              : notificationPermission === 'denied'
                ? 'Notifications blocked in browser settings'
                : notificationPermission === 'unsupported'
                  ? 'Browser notifications unavailable'
                  : notificationPermission === 'granted'
                    ? 'Finish enabling push reminders'
                    : 'Enable account reminders'}
          </button>
          <button
            type="button"
            onClick={alarmSoundEnabled ? () => setAlarmSoundEnabled(false) : enableAlarmSound}
            className="mb-2 w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100 transition hover:bg-emerald-500/20"
          >
            {alarmSoundEnabled ? 'Alarm tone enabled on this device' : 'Enable alarm tone'}
          </button>
          <p className="mb-5 text-xs text-slate-400">
            Offline alarms work while the app is open. Online push reminders can arrive while it is closed.
          </p>

          <form onSubmit={createActivity} className="activity-form rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-glow">
            <div className="activity-title-field">
              <label className="mb-2 block text-sm text-slate-300">Activity title</label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Focus session"
                className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-violet-400"
              />
            </div>

            <div className="activity-time-fields">
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
              disabled={isSaving}
              className="primary-action w-full rounded-xl bg-gradient-to-r from-violet-500 to-cyan-500 px-4 py-3 font-semibold text-white shadow-lg shadow-violet-600/30 transition hover:brightness-110"
            >
              {isSaving ? 'Saving...' : 'Add activity'}
            </button>
            {apiError && <p role="alert" className="text-sm text-red-300">{apiError}</p>}
          </form>

          <div className="activity-list mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{selectedDate === getLocalDateString() ? 'Today' : formatSelectedDate(selectedDate)}</h2>
              <span className="text-xs text-slate-400">{sortedActivities.length} items</span>
            </div>

            <div className="space-y-3">
              {isLoading ? (
                <div className="empty-state rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-400">
                  Loading activities...
                </div>
              ) : sortedActivities.length === 0 ? (
                <div className="empty-state rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-400">
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
                    <div key={activity.id} className="activity-card rounded-2xl border border-white/10 bg-slate-900/80 p-3 shadow-lg shadow-slate-950/40">
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

        <main className="planner-main flex-1 p-4 md:p-6">
          <div className="mobile-tabs mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label="Planner views">
            {[
              ['today', 'Today'],
              ['timeline', 'Timeline'],
              ['history', 'History'],
              ['insights', 'Insights'],
            ].map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`tab-button rounded-xl px-3 py-2 text-sm font-medium ${activeTab === tab ? 'tab-button-active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className={activeTab === 'today' ? 'block' : 'hidden'}>
            <div className="overview-panel rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-glow md:p-5">
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
                  <div className="empty-state rounded-2xl border border-dashed border-slate-700 bg-slate-800/70 p-5 text-slate-400">
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
                      <div key={activity.id} className="rhythm-item rounded-2xl border border-white/10 bg-slate-800/80 p-3">
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

          <div className={activeTab === 'timeline' ? 'block' : 'hidden'}>
            <div className="timeline-panel rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-glow md:p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.26em] text-violet-300">Schedule</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Timeline</h2>
                </div>
                <div className="rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1 text-xs text-violet-200">
                  {formatSelectedDate(selectedDate)}
                </div>
              </div>

              <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
                {timelineItems.map(({ label, minutes, activity }) => {
                  const isCurrentHour = selectedDate === getLocalDateString() && minutes === now.getHours() * 60 + now.getMinutes();
                  const isCurrentBlock = activity && getStatus(activity) === 'live';

                  return (
                    <div
                      key={`${label}-${minutes}`}
                      className={`timeline-row flex items-center gap-3 rounded-2xl border px-3 py-2 ${isCurrentHour ? 'border-cyan-400/60 bg-cyan-500/10' : 'border-white/5 bg-slate-800/60'}`}
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

          <div className={activeTab === 'history' ? 'block' : 'hidden'}>
            <section className="history-panel overview-panel rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-glow md:p-5" aria-labelledby="history-title">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="section-kicker">Your record</p>
                  <h2 id="history-title" className="mt-2 text-xl font-semibold">Completed activities</h2>
                </div>
                <span className="history-count">{completedCount} complete</span>
              </div>
              {historyLoading ? (
                <div className="empty-state p-5" role="status">Loading your history...</div>
              ) : completedActivities.length === 0 ? (
                <div className="empty-state p-5">Completed activities will appear here after their scheduled end time.</div>
              ) : (
                <div className="history-list">
                  {completedActivities.map((activity) => (
                    <article className="history-entry" key={activity.id}>
                      <div className="history-mark" aria-hidden="true">✓</div>
                      <div className="history-entry-copy">
                        <h3>{activity.title}</h3>
                        <p>{formatActivityDate(activity.date)} · {activity.startTime}–{activity.endTime}</p>
                      </div>
                      <span className="history-duration">{timeToMinutes(activity.endTime) - timeToMinutes(activity.startTime)} min</span>
                      <button
                        type="button"
                        className="history-date-button"
                        onClick={() => { setSelectedDate(activity.date); setActiveTab('today'); }}
                        aria-label={`View schedule for ${formatActivityDate(activity.date)}`}
                      >
                        View day
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className={activeTab === 'insights' ? 'block' : 'hidden'}>
            <section className="insights-view" aria-labelledby="insights-title">
              <div className="insights-heading">
                <div>
                  <p className="section-kicker">Your consistency</p>
                  <h2 id="insights-title">Activity insights</h2>
                </div>
                <span className="insights-period">Last 7 days</span>
              </div>

              <div className="insight-metrics">
                <article className="insight-metric">
                  <span>Completed</span>
                  <strong>{completedCount}</strong>
                  <small>activities all time</small>
                </article>
                <article className="insight-metric">
                  <span>Time completed</span>
                  <strong>{Math.floor(completedMinutes / 60)}<small>h</small> {completedMinutes % 60}<small>m</small></strong>
                  <small>scheduled time elapsed</small>
                </article>
                <article className="insight-metric">
                  <span>Completion rate</span>
                  <strong>{completionRate}<small>%</small></strong>
                  <small>of all saved activities</small>
                </article>
              </div>

              {allActivities.length === 0 ? (
                <div className="empty-state p-5">Add activities to start building your progress charts.</div>
              ) : (
                <div className="charts-grid">
                  <article className="chart-panel">
                    <div className="chart-heading">
                      <h3>Daily activity count</h3>
                      <p>Completed vs. still planned</p>
                    </div>
                    <div className="chart-canvas" role="img" aria-label="Bar chart of completed and planned activities for each of the last seven days">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={weeklyActivityData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
                          <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: 'var(--chart-label)', fontSize: 12 }} />
                          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'var(--chart-label)', fontSize: 12 }} />
                          <Tooltip cursor={{ fill: 'var(--chart-cursor)' }} contentStyle={{ background: 'var(--chart-tooltip)', border: '1px solid var(--chart-grid)', borderRadius: 8, color: 'var(--chart-text)' }} />
                          <Legend />
                          <Bar dataKey="completed" name="Completed" fill="#32835b" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="planned" name="Planned / active" fill="#d5a248" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </article>

                  <article className="chart-panel">
                    <div className="chart-heading">
                      <h3>Completed minutes</h3>
                      <p>Scheduled duration completed each day</p>
                    </div>
                    <div className="chart-canvas" role="img" aria-label="Line chart of completed activity minutes for each of the last seven days">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={weeklyActivityData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
                          <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: 'var(--chart-label)', fontSize: 12 }} />
                          <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--chart-label)', fontSize: 12 }} />
                          <Tooltip contentStyle={{ background: 'var(--chart-tooltip)', border: '1px solid var(--chart-grid)', borderRadius: 8, color: 'var(--chart-text)' }} />
                          <Line type="monotone" dataKey="completedMinutes" name="Minutes" stroke="#32835b" strokeWidth={3} dot={{ r: 4, fill: '#32835b' }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </article>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>

      {toast && (
          <div className="reminder-toast pointer-events-none fixed bottom-24 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-violet-400/30 bg-slate-900/90 p-4 shadow-2xl shadow-violet-900/40 backdrop-blur">
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
