import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X, RefreshCw, ArrowUpRight, Check } from 'lucide-react';
import useModal from '../hooks/useModal.js';
import { request } from '../lib/api.js';

function NotificationPanel({
  report,
  error,
  loading,
  busy,
  onClose,
  onRefresh,
  onInvite,
  onTask,
  onTeams,
}) {
  const ref = useRef(null);
  useModal(ref);
  return createPortal(
    <dialog
      ref={ref}
      className="notification-dialog"
      aria-labelledby="notifications-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <div className="dialog-heading">
        <div>
          <p className="eyebrow">KEEP IN THE LOOP</p>
          <h2 id="notifications-title">Your notifications</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close notifications"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <p className="muted small">
        Invitations and assigned work, in one place. Updates appear within 30 seconds
        while Orbit is open.
      </p>
      <button
        type="button"
        className="secondary"
        disabled={busy || loading}
        onClick={onRefresh}
      >
        <RefreshCw size={16} /> Refresh notifications
      </button>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <p role="status" className="small muted">
        {loading ? 'Checking notifications…' : ''}
      </p>
      {report && (
        <>
          <section aria-labelledby="notification-invites">
            <h3 id="notification-invites">Project invitations</h3>
            {!report.invitations.length && (
              <p className="muted small">No pending invitations.</p>
            )}
            <ul className="notification-list">
              {report.invitations.map((item) => (
                <li key={item.id}>
                  <strong>{item.project}</strong>
                  <p className="small muted">
                    {item.from} invited you as{' '}
                    {item.role === 'guest' ? 'a read-only guest' : 'a teammate'}.
                  </p>
                  <div className="team-actions">
                    {['accept', 'decline'].map((action) => (
                      <button
                        key={action}
                        type="button"
                        className="secondary"
                        disabled={busy}
                        aria-label={`${action === 'accept' ? 'Accept' : 'Decline'} invitation to ${item.project}`}
                        onClick={() => onInvite(item, action)}
                      >
                        {action === 'accept' ? 'Accept invitation' : 'Decline'}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="notification-assignments">
            <h3 id="notification-assignments">Assigned to you</h3>
            <p className="small muted">
              These tasks are already yours to work on. Open one to update it in its
              shared project.
            </p>
            {!report.tasks.length && (
              <p className="muted small">No unfinished assigned tasks.</p>
            )}
            <ul className="notification-list">
              {report.tasks.map((item) => (
                <li key={item.id}>
                  <div className="notification-task-heading">
                    <strong>{item.title}</strong>
                    {item.unread && <span className="pill">New assignment</span>}
                  </div>
                  <p className="small muted">
                    {item.project}
                    {item.due ? ` · Due ${item.due}` : ''}
                  </p>
                  <div className="team-actions">
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => onTask(item, true)}
                      aria-label={`Open assigned task ${item.title}`}
                    >
                      Open task <ArrowUpRight size={16} />
                    </button>
                    {item.unread && (
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => onTask(item, false)}
                        aria-label={`Mark assignment ${item.title} as read`}
                      >
                        <Check size={16} /> Mark as read
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
          {report.truncated && (
            <p className="small muted">
              This inbox shows a limited set of projects and the first 30 tasks. Open Team
              projects to view more.
            </p>
          )}
          <button type="button" className="secondary" disabled={busy} onClick={onTeams}>
            Open Team projects <ArrowUpRight size={16} />
          </button>
        </>
      )}
    </dialog>,
    document.body,
  );
}

export default function Notifications({
  onExpired,
  revision,
  onOpenTask,
  onOpenProject,
  onTeams,
}) {
  const [open, setOpen] = useState(false),
    [report, setReport] = useState(null);
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    request('/teams/inbox', { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setReport(result);
          setError('');
        }
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        setReport(null);
        if (failure.status === 401) onExpired();
        else setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [onExpired, revision, refresh]);
  useEffect(() => {
    const check = () => {
      if (!document.hidden && !lock.current) setRefresh((value) => value + 1);
    };
    const timer = setInterval(check, 30000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);
  async function action(work) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await work();
      setRefresh((value) => value + 1);
    } catch (failure) {
      if (failure.status === 401) onExpired();
      else setError(failure.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const count = report?.unread ?? 0;
  return (
    <>
      <button
        type="button"
        className="notification-button"
        aria-label={`Notifications, ${count} unread${error ? ', could not refresh' : ''}`}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
          setRefresh((value) => value + 1);
        }}
      >
        <Bell size={19} aria-hidden="true" />
        <span className="notification-button-label">Notifications</span>
        {count > 0 && (
          <span className="notification-badge" aria-hidden="true">
            {count > 99 ? '99+' : count}
          </span>
        )}
        {error && <span aria-hidden="true">!</span>}
      </button>
      <span className="sr-only" role="status">
        {report ? `${count} unread notifications` : ''}
      </span>
      {open && (
        <NotificationPanel
          report={report}
          error={error}
          loading={loading}
          busy={busy}
          onClose={() => setOpen(false)}
          onRefresh={() => setRefresh((value) => value + 1)}
          onInvite={(item, choice) =>
            action(async () => {
              await request('/teams/invitations/' + item.id, {
                method: 'PATCH',
                body: JSON.stringify({ action: choice }),
              });
              if (choice === 'accept') {
                setOpen(false);
                onOpenProject(item.projectId);
              }
            })
          }
          onTask={(item, navigate) =>
            action(async () => {
              if (item.unread)
                await request('/teams/inbox/tasks/' + item.id + '/read', {
                  method: 'PATCH',
                  body: JSON.stringify({ version: item.version }),
                });
              if (navigate) {
                setOpen(false);
                onOpenTask(item);
              }
            })
          }
          onTeams={() => {
            setOpen(false);
            onTeams();
          }}
        />
      )}
    </>
  );
}
