import { useEffect, useState } from 'react';
import { Clock3, Pause, Play, RotateCcw } from 'lucide-react';
import { initialTimer, remainingSeconds, validTimer } from '../lib/focus.js';

export default function FocusTimer({ storageScope }) {
  const key = 'orbit.focus.v1.' + storageScope;
  const [storageError, setStorageError] = useState('');
  const [timer, setTimer] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(key));
      return validTimer(stored) ? stored : initialTimer();
    } catch {
      return initialTimer();
    }
  });
  const [now, setNow] = useState(Date.now());
  const [goal, setGoal] = useState('');
  const remaining = remainingSeconds(timer, now);
  const running = timer.deadline !== null;
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(timer));
      setStorageError('');
    } catch {
      setStorageError(
        'Timer works here, but browser storage is unavailable. It will not survive a refresh.',
      );
    }
  }, [key, timer]);
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, [running]);
  useEffect(() => {
    if (running && remaining === 0)
      setTimer((current) => ({ ...current, deadline: null, remaining: 0 }));
  }, [running, remaining]);
  function start() {
    const seconds = timer.remaining > 0 ? timer.remaining : timer.duration;
    setNow(Date.now());
    setTimer((current) => ({
      ...current,
      remaining: seconds,
      deadline: Date.now() + seconds * 1000,
    }));
  }
  function pause() {
    setTimer((current) => ({
      ...current,
      remaining: remainingSeconds(current),
      deadline: null,
    }));
  }
  function configure(phase, minutes) {
    setNow(Date.now());
    setTimer({ phase, duration: minutes * 60, remaining: minutes * 60, deadline: null });
  }
  const display =
    Math.floor(remaining / 60)
      .toString()
      .padStart(2, '0') +
    ':' +
    (remaining % 60).toString().padStart(2, '0');
  return (
    <section className="focus-panel" aria-labelledby="focus-heading">
      <div className="focus-intro">
        <span className="feature-icon">
          <Clock3 size={22} />
        </span>
        <p className="eyebrow">ONE THING AT A TIME</p>
        <h2 id="focus-heading">Make space to focus.</h2>
        <p className="muted">Pick a small goal, work for a while, then take a break.</p>
      </div>
      <label className="focus-goal">
        What will you work on?
        <input
          maxLength={120}
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="e.g. Finish the first draft"
        />
      </label>
      <div className="focus-modes" aria-label="Session type">
        <button
          className={timer.phase === 'focus' ? 'selected' : ''}
          aria-pressed={timer.phase === 'focus'}
          disabled={running}
          onClick={() => configure('focus', 25)}
        >
          Focus
        </button>
        <button
          className={timer.phase === 'break' ? 'selected' : ''}
          aria-pressed={timer.phase === 'break'}
          disabled={running}
          onClick={() => configure('break', 5)}
        >
          Break
        </button>
      </div>
      <div
        className="focus-clock"
        role="timer"
        aria-live="off"
        aria-label={'Time remaining: ' + display}
      >
        {display}
      </div>
      <label className="focus-duration">
        Session length
        <select
          aria-label="Session length"
          value={timer.duration / 60}
          disabled={running}
          onChange={(event) => configure(timer.phase, Number(event.target.value))}
        >
          {[1, 5, 15, 25, 50].map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} {minutes === 1 ? 'minute' : 'minutes'}
            </option>
          ))}
        </select>
      </label>
      <div className="focus-actions">
        {running ? (
          <button className="button" onClick={pause}>
            <Pause size={16} /> Pause
          </button>
        ) : (
          <button className="button" onClick={start}>
            <Play size={16} />{' '}
            {remaining === 0
              ? 'Start again'
              : remaining < timer.duration
                ? 'Resume'
                : 'Start session'}
          </button>
        )}
        <button
          className="secondary"
          onClick={() => configure(timer.phase, timer.duration / 60)}
        >
          <RotateCcw size={15} /> Reset
        </button>
      </div>
      <p className="focus-message" role="status">
        {remaining === 0
          ? timer.phase === 'focus'
            ? 'Focus session complete. Take a well-earned break.'
            : 'Break complete. Ready for your next step?'
          : running
            ? goal ||
              (timer.phase === 'focus'
                ? 'Keep your attention on one small step.'
                : 'Step away and recharge.')
            : 'Start when you’re ready.'}
      </p>
      {storageError && (
        <p className="form-error" role="alert">
          {storageError}
        </p>
      )}
      <p className="small muted">
        The timer continues when you switch views and survives a refresh on this browser.
        Your written focus goal is not stored.
      </p>
    </section>
  );
}
