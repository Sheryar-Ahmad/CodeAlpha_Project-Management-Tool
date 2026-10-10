import { useEffect, useRef, useState } from 'react';
import { request, today } from '../lib/api.js';
import { loggedTime } from '../../shared/workLog.js';

function CapacityRow({ row, date, busy, onSave }) {
  const [minutes, setMinutes] = useState(row.capacity ?? '');
  useEffect(() => setMinutes(row.capacity ?? ''), [row.capacity, date]);
  return (
    <li className="workload-row">
      <div>
        <h3>{row.name}</h3>
        <p>
          {loggedTime(row.minutes)} estimated · {row.tasks} due tasks
        </p>
        <p className="small muted">
          {row.unestimated} without estimates · {row.undated} undated
        </p>
        <p className="small">
          {row.capacity === null
            ? 'Capacity not set'
            : row.minutes > row.capacity
              ? 'Estimated work exceeds capacity'
              : 'Estimated work is within capacity'}
          {row.unestimated > 0 &&
            ' · Add missing estimates before relying on this comparison.'}
        </p>
      </div>
      {row.canEdit ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave(row.id, minutes === '' ? null : Number(minutes));
          }}
        >
          <label>
            Weekly capacity (minutes)
            <input
              aria-label={'Capacity for ' + row.name}
              type="number"
              min="0"
              max="10080"
              step="1"
              value={minutes}
              disabled={busy}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </label>
          <button className="secondary" disabled={busy}>
            Save capacity
          </button>
          <p className="small muted">Blank clears it; zero means no availability.</p>
        </form>
      ) : (
        <p>Capacity: {row.capacity === null ? 'Not set' : loggedTime(row.capacity)}</p>
      )}
    </li>
  );
}
export default function ProjectWorkload({ project, onExpired }) {
  const [date, setDate] = useState(today),
    [data, setData] = useState(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [revision, setRevision] = useState(0);
  const lock = useRef(false),
    endpoint = '/projects/' + project.id + '/workload';
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setError('');
    request(endpoint + '?date=' + date, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          if (failure.status === 401) onExpired();
          else setError(failure.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date, endpoint, revision, onExpired]);
  async function save(user, minutes) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(endpoint + '/capacity', {
        method: 'PATCH',
        body: JSON.stringify({ user, minutes, date }),
      });
      setRevision((value) => value + 1);
      setNotice('Capacity saved for this project and week.');
    } catch (failure) {
      if (failure.status === 401) onExpired();
      else setError(failure.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="team-panel" aria-labelledby="workload-heading">
      <h2 id="workload-heading">Plan a manageable week</h2>
      <p className="small muted">
        For this project only: unfinished tasks due by Sunday, including overdue work.
        Estimates are planning assumptions, not logged hours or a delivery forecast.
        Undated work is separate.
      </p>
      <div className="template-controls">
        <label>
          Choose a week
          <input
            aria-label="Workload week"
            type="date"
            min="2000-01-01"
            max="2100-12-31"
            required
            value={date}
            disabled={busy}
            onChange={(event) => {
              if (event.target.value) setDate(event.target.value);
            }}
          />
        </label>
        <button
          className="secondary"
          disabled={busy || loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          Refresh workload
        </button>
      </div>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      <p role="status">{notice}</p>
      {loading ? (
        <p role="status">Loading workload…</p>
      ) : (
        data && (
          <>
            <p>
              {data.week.start} – {data.week.end}
            </p>
            {data.truncated && (
              <p role="status">
                The directory shows the first 100 members. Other assignments are grouped
                below.
              </p>
            )}
            <ul className="workload-list">
              {data.rows.map((row) => (
                <CapacityRow
                  key={row.id}
                  row={row}
                  date={date}
                  busy={busy}
                  onSave={save}
                />
              ))}
            </ul>
            <p>
              <strong>Unassigned:</strong> {data.unassigned.tasks} due tasks ·{' '}
              {loggedTime(data.unassigned.minutes)} estimated ·{' '}
              {data.unassigned.unestimated} unestimated · {data.unassigned.undated}{' '}
              undated
            </p>
            <p>
              <strong>Other or former assignments:</strong> {data.otherAssignments.tasks}{' '}
              due tasks · {loggedTime(data.otherAssignments.minutes)} estimated ·{' '}
              {data.otherAssignments.undated} undated
            </p>
          </>
        )
      )}
    </section>
  );
}
