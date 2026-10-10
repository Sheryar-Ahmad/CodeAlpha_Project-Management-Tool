import GuestPortal from './GuestPortal.jsx';
import ProjectRequests from './ProjectRequests.jsx';
import ProjectDependencies from './ProjectDependencies.jsx';
import ProjectReviews from './ProjectReviews.jsx';
import TaskDiscussion from './TaskDiscussion.jsx';
import { useEffect, useRef, useState } from 'react';
import { Users, Plus, RefreshCw } from 'lucide-react';
import { request, today } from '../lib/api.js';
import TaskCard from './TaskCard.jsx';
import TaskDialog from './TaskDialog.jsx';
import ProjectNotebook from './ProjectNotebook.jsx';

// This view has its own explicit project scope. Personal task views never mix in shared work.
export default function TeamWorkspace({ demo, onExpired }) {
  const [projects, setProjects] = useState([]),
    [invitations, setInvitations] = useState([]);
  const [selected, setSelected] = useState(''),
    [directory, setDirectory] = useState(null);
  const [tasks, setTasks] = useState([]),
    [overview, setOverview] = useState(null);
  const [page, setPage] = useState(1),
    [hasMore, setHasMore] = useState(false);
  const [lifecycle, setLifecycle] = useState('all'),
    [search, setSearch] = useState('');
  const [query, setQuery] = useState(''),
    [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [email, setEmail] = useState(''),
    [dialog, setDialog] = useState(null);
  const [discussion, setDiscussion] = useState(null);
  const [reviewInbox, setReviewInbox] = useState([]),
    [inboxTruncated, setInboxTruncated] = useState(false);
  const [mine, setMine] = useState(false);
  const [panel, setPanel] = useState('tasks');
  const [inviteRole, setInviteRole] = useState('member');
  const [notebook, setNotebook] = useState(false),
    [truncated, setTruncated] = useState(false);
  const lock = useRef(false);
  const project = projects.find((item) => item.id === selected);
  const endpoint = '/projects/' + selected;
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  // Refresh visible team work periodically; this is polling, not a live socket connection.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden && !lock.current) setRevision((value) => value + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    async function load() {
      try {
        const teams = await request('/teams', { signal: controller.signal });
        if (controller.signal.aborted) return;
        setReviewInbox(teams.reviewInbox);
        setInboxTruncated(teams.inboxTruncated);
        setProjects(teams.projects);
        setInvitations(teams.invitations);
        setTruncated(teams.truncated);
        if (selected && !teams.projects.some((item) => item.id === selected)) {
          setSelected('');
          setTasks([]);
          setDirectory(null);
          setOverview(null);
          setDialog(null);
          setNotebook(false);
          setDiscussion(null);
          setDiscussion(null);
          setNotice('Project access changed. Choose an available project.');
          return;
        }
        if (!selected) return;
        if (teams.projects.find((item) => item.id === selected)?.role === 'guest') {
          setDirectory(null);
          setTasks([]);
          setOverview(null);
          return;
        }
        const params = new URLSearchParams({
          page: String(page),
          view: lifecycle,
          search: query,
          assigned: mine ? 'me' : '',
        });
        const [members, result, stats] = await Promise.all([
          request(endpoint + '/members', { signal: controller.signal }),
          request(endpoint + '/tasks?' + params, { signal: controller.signal }),
          request(endpoint + '/tasks/overview?date=' + today(), {
            signal: controller.signal,
          }),
        ]);
        if (controller.signal.aborted) return;
        if (!result.tasks.length && page > 1) {
          setPage(page - 1);
          return;
        }
        setDirectory(members);
        setTasks(result.tasks);
        setHasMore(result.hasMore);
        setOverview(stats);
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (failure.status === 401) onExpired();
        else {
          setError(failure.message);
          // Avoid displaying stale project records after access was removed.
          if (failure.status === 404) {
            setTasks([]);
            setDirectory(null);
            setOverview(null);
            setDialog(null);
            setNotebook(false);
            setDiscussion(null);
            setDiscussion(null);
          }
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [demo, selected, endpoint, page, lifecycle, query, revision, mine, onExpired]);
  async function mutate(path, method, body, message) {
    if (lock.current) throw new Error('Please wait for the current save.');
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      setRevision((value) => value + 1);
      setNotice(message || 'Project updated.');
    } catch (failure) {
      if (failure.status === 401) onExpired();
      setError(failure.message);
      throw failure;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function act(action) {
    action().catch(() => {});
  }
  function choose(id, nextPanel = 'tasks') {
    setPanel(nextPanel);
    setSelected(id);
    setMine(false);
    setTasks([]);
    setDirectory(null);
    setOverview(null);
    setPage(1);
    setLifecycle('all');
    setSearch('');
    setQuery('');
    setEmail('');
    setNotice('');
  }
  function saveTask(data, id) {
    return mutate(
      endpoint + '/tasks' + (id ? '/' + id : ''),
      id ? 'PATCH' : 'POST',
      data,
    );
  }
  if (demo)
    return (
      <section className="team-empty">
        <Users size={32} aria-hidden="true" />
        <h2>Make room for your team</h2>
        <p>
          Team projects use real accounts and explicit invitations. Create an account,
          create a project, and invite another Orbit account from this view.
        </p>
        <a className="button" href="/app.html?auth=register">
          Create your account
        </a>
        <p className="small muted">Your local demo stays in this browser.</p>
      </section>
    );
  return (
    <section className="team-workspace" aria-busy={loading}>
      <div className="team-toolbar">
        <label>
          Choose a project
          <select
            aria-label="Choose a project"
            value={selected}
            onChange={(event) => choose(event.target.value)}
            disabled={busy}
          >
            <option value="">Select a project</option>
            {projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.role}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="secondary"
          disabled={busy || loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>
      <p className="small muted">
        Team work refreshes every 30 seconds while this tab is visible. Private tasks,
        notes, and work logs stay separate.
      </p>
      <p role="status" aria-live="polite">
        {notice || (loading ? 'Loading team projects…' : '')}
      </p>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {truncated && (
        <p role="status">
          Only the first 1,000 owned projects and memberships are shown.
        </p>
      )}
      {invitations.length > 0 && (
        <section className="team-panel" aria-labelledby="invitations-heading">
          <h2 id="invitations-heading">Your invitations</h2>
          <ul className="team-members">
            {invitations.map((item) => (
              <li key={item.id}>
                <span>{item.project}</span>
                <div className="team-actions">
                  {['accept', 'decline'].map((action) => (
                    <button
                      key={action}
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        act(() =>
                          mutate(
                            '/teams/invitations/' + item.id,
                            'PATCH',
                            { action },
                            action === 'accept'
                              ? 'Invitation accepted. Choose the project above.'
                              : 'Invitation declined.',
                          ),
                        )
                      }
                    >
                      {action === 'accept' ? 'Accept' : 'Decline'}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {reviewInbox.length > 0 && (
        <section className="team-panel" aria-labelledby="review-inbox-heading">
          <h2 id="review-inbox-heading">Waiting for your review</h2>
          <ul className="team-members">
            {reviewInbox.map((item) => (
              <li key={item.id}>
                <span>
                  {item.title}
                  <small className="muted"> · {item.project}</small>
                </span>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => choose(item.projectId, 'reviews')}
                >
                  Open project reviews
                </button>
              </li>
            ))}
          </ul>
          {inboxTruncated && (
            <p role="status">The first 100 review requests are shown.</p>
          )}
        </section>
      )}
      {!selected && !loading && (
        <div className="team-empty">
          <Users size={32} />
          <h2>Work together, with clear boundaries</h2>
          <p>
            Select a project to manage its team and shared tasks. Your owned projects
            appear here automatically; create one from Projects if you need a new space.
          </p>
          <p className="small muted">
            Only connected tasks are shared. Use “Connect existing tasks” in Projects for
            older tasks you want to share.
          </p>
        </div>
      )}
      {project?.role === 'guest' && (
        <GuestPortal key={project.id} projectId={project.id} onExpired={onExpired} />
      )}
      {project && directory && (
        <section className="team-panel" aria-labelledby="team-heading">
          <h2 id="team-heading">{project.name}</h2>
          {project.description && <p>{project.description}</p>}
          <p className="small muted">
            Owner: {directory.owner?.name ?? 'Unavailable'} · Your role: {directory.role}
          </p>
          <h3>Project members</h3>
          <ul className="team-members">
            {directory.members.map((item) => (
              <li key={item.id}>
                <span>
                  {item.user.name}{' '}
                  <small className="muted">
                    ·{' '}
                    {item.status === 'active'
                      ? item.role === 'guest'
                        ? 'Guest'
                        : 'Member'
                      : 'Invited'}
                  </small>
                </span>
                {directory.role === 'owner' && (
                  <button
                    type="button"
                    className="text-button danger"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          'Remove access for ' +
                            item.user.name +
                            '? Their existing project work stays saved.',
                        )
                      )
                        act(() =>
                          mutate(
                            endpoint + '/members/' + item.id,
                            'DELETE',
                            null,
                            'Project access removed.',
                          ),
                        );
                    }}
                  >
                    {item.status === 'invited' ? 'Cancel invitation' : 'Remove access'}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!directory.members.length && (
            <p className="small muted">No accepted members yet.</p>
          )}
          {directory.truncated && <p role="status">The first 100 members are shown.</p>}
          {directory.role === 'owner' && (
            <form
              className="team-invite"
              onSubmit={async (event) => {
                event.preventDefault();
                try {
                  await mutate(
                    endpoint + '/members',
                    'POST',
                    { email, role: inviteRole },
                    'Invitation sent in Orbit. Your teammate can accept it in Team projects.',
                  );
                  setEmail('');
                } catch {
                  /* Error appears above; preserve the input for retry. */
                }
              }}
            >
              <label>
                Teammate’s account email
                <input
                  type="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={busy}
                  autoComplete="off"
                />
              </label>
              <label>
                Invitation role
                <select
                  aria-label="Invitation role"
                  value={inviteRole}
                  disabled={busy}
                  onChange={(event) => setInviteRole(event.target.value)}
                >
                  <option value="member">Member — collaborate</option>
                  <option value="guest">Guest — read-only portal</option>
                </select>
              </label>
              <button className="button" disabled={busy}>
                Invite teammate
              </button>
              <p className="small muted">
                Guests see the project brief, milestones, and task
                titles/descriptions/dates. Notes and conversations stay restricted. Use an
                existing Orbit account. This sends an in-app invitation, without email
                delivery.
              </p>
            </form>
          )}
          <p className="small muted">
            Members can create, edit, archive, and restore connected tasks. The owner
            manages members and permanent deletion. Personal notebook entries are never
            shared.
          </p>
          <button
            type="button"
            className="secondary"
            disabled={busy || loading}
            onClick={() => setNotebook(true)}
          >
            Open team notes
          </button>
        </section>
      )}
      {project && directory && (
        <nav className="project-tool-nav" aria-label="Project tools">
          {[
            ['tasks', 'Shared tasks'],
            ['dependencies', 'Dependencies'],
            ['reviews', 'Reviews'],
            ['requests', 'Work requests'],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={panel === value}
              disabled={busy}
              onClick={() => setPanel(value)}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      {project && directory && overview && panel === 'tasks' && (
        <section aria-labelledby="shared-tasks-heading">
          <div className="team-toolbar">
            <div>
              <h2 id="shared-tasks-heading">Shared project tasks</h2>
              <p className="small muted">
                {overview.total} active tasks · {overview.completed} completed ·{' '}
                {overview.blocked} blocked · {overview.overdue} overdue
              </p>
            </div>
            <button
              type="button"
              className="button"
              disabled={busy || loading}
              onClick={() => setDialog({ task: { project: project.name } })}
            >
              <Plus size={16} /> New shared task
            </button>
          </div>
          <div className="team-toolbar">
            <label>
              Search shared tasks
              <input
                type="search"
                maxLength={120}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label>
              Task location
              <select
                value={lifecycle}
                disabled={busy}
                onChange={(event) => {
                  setLifecycle(event.target.value);
                  setPage(1);
                }}
              >
                <option value="all">Active tasks</option>
                <option value="archived">Archive</option>
                <option value="trash">Trash</option>
              </select>
            </label>
          </div>
          <label className="shared-mine-filter">
            <input
              type="checkbox"
              checked={mine}
              disabled={busy}
              onChange={(event) => {
                setMine(event.target.checked);
                setPage(1);
              }}
            />{' '}
            Only tasks assigned to me
          </label>
          {loading ? (
            <p role="status">Loading shared tasks…</p>
          ) : (
            <ul className="task-list">
              {tasks.map((task) => (
                <li key={task.id}>
                  <TaskCard
                    task={task}
                    busy={busy}
                    canPurge={directory.role === 'owner'}
                    onEdit={(item) => setDialog({ task: item })}
                    onDuplicate={(item) =>
                      setDialog({
                        task: {
                          ...item,
                          id: undefined,
                          title: item.title.slice(0, 110) + ' (copy)',
                          status: 'todo',
                          blockerReason: '',
                        },
                      })
                    }
                    onStatus={(item, status) =>
                      status === 'blocked'
                        ? setDialog({ task: { ...item, status } })
                        : act(() => saveTask({ status, blockerReason: '' }, item.id))
                    }
                    onChecklist={(item, checklist) =>
                      act(() => saveTask({ checklist }, item.id))
                    }
                    onArchive={(item) =>
                      act(() =>
                        mutate(endpoint + '/tasks/' + item.id + '/lifecycle', 'PATCH', {
                          action: 'archive',
                        }),
                      )
                    }
                    onRestore={(item) =>
                      act(() =>
                        mutate(endpoint + '/tasks/' + item.id + '/lifecycle', 'PATCH', {
                          action: item.lifecycle === 'archived' ? 'unarchive' : 'restore',
                        }),
                      )
                    }
                    onDelete={(item) => {
                      if (window.confirm('Move this shared task to Trash?'))
                        act(() => mutate(endpoint + '/tasks/' + item.id, 'DELETE'));
                    }}
                    onPermanentDelete={(item) => {
                      if (
                        window.confirm(
                          'Permanently delete this shared task? This cannot be undone.',
                        )
                      )
                        act(() =>
                          mutate(endpoint + '/tasks/' + item.id + '/permanent', 'DELETE'),
                        );
                    }}
                  />
                  <div className="shared-task-controls">
                    <label>
                      Assigned to
                      <select
                        aria-label={'Assignee for ' + task.title}
                        value={task.assignee ?? ''}
                        disabled={busy || loading || task.lifecycle !== 'active'}
                        onChange={(event) =>
                          act(() =>
                            mutate(
                              endpoint + '/collaboration/' + task.id + '/assignee',
                              'PATCH',
                              { assignee: event.target.value || null },
                              'Task assignment saved.',
                            ),
                          )
                        }
                      >
                        <option value="">Unassigned</option>
                        {directory.owner && (
                          <option value={directory.owner.id}>
                            {directory.owner.name} · Owner
                          </option>
                        )}
                        {directory.members
                          .filter(
                            (item) => item.status === 'active' && item.role !== 'guest',
                          )
                          .map((item) => (
                            <option key={item.id} value={item.user.id}>
                              {item.user.name}
                            </option>
                          ))}
                        {task.assignee &&
                          task.assignee !== directory.owner?.id &&
                          !directory.members.some(
                            (item) =>
                              item.status === 'active' &&
                              item.role !== 'guest' &&
                              item.user.id === task.assignee,
                          ) && (
                            <option value={task.assignee}>
                              Former member · Reassign this task
                            </option>
                          )}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy || loading}
                      onClick={() => setDiscussion(task)}
                    >
                      Discussion
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!loading && !tasks.length && (
            <p className="empty">No shared tasks match this view.</p>
          )}
          {(page > 1 || hasMore) && (
            <nav className="pagination" aria-label="Shared task pages">
              <button
                className="secondary"
                disabled={busy || loading || page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>Page {page}</span>
              <button
                className="secondary"
                disabled={busy || loading || !hasMore}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </nav>
          )}
        </section>
      )}
      {project && directory && panel === 'dependencies' && (
        <ProjectDependencies
          key={project.id}
          project={project}
          tasks={tasks}
          onExpired={onExpired}
        />
      )}
      {project && directory && panel === 'reviews' && (
        <ProjectReviews
          key={project.id}
          project={project}
          directory={directory}
          tasks={tasks}
          onExpired={onExpired}
        />
      )}
      {project && directory && panel === 'requests' && (
        <ProjectRequests
          key={project.id}
          project={project}
          onExpired={onExpired}
          onAccepted={() => {
            setPanel('tasks');
            setRevision((value) => value + 1);
          }}
        />
      )}
      {project && discussion && (
        <TaskDiscussion
          projectId={project.id}
          task={discussion}
          onExpired={onExpired}
          onClose={() => setDiscussion(null)}
        />
      )}
      {project && dialog && (
        <TaskDialog
          task={dialog.task}
          lockedProject
          projectNames={[project.name]}
          onClose={() => setDialog(null)}
          onSave={saveTask}
        />
      )}
      {project && notebook && (
        <ProjectNotebook
          project={project}
          shared
          demo={false}
          onExpired={onExpired}
          onClose={() => setNotebook(false)}
          onFollowUp={(task) => {
            setNotebook(false);
            setDiscussion(null);
            setDiscussion(null);
            setDialog({ task });
          }}
        />
      )}
    </section>
  );
}
