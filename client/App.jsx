import { useCallback, useEffect, useState } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  CalendarRange,
  FolderOpen,
  CheckCheck,
  CircleDot,
  Clock3,
  LayoutDashboard,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';
import AuthScreen from './components/AuthScreen.jsx';
import TaskCard, { statuses } from './components/TaskCard.jsx';
import TaskDialog from './components/TaskDialog.jsx';
import ProjectOverview from './components/ProjectOverview.jsx';
import FocusTimer from './components/FocusTimer.jsx';
import useWorkspace from './hooks/useWorkspace.js';
import { request, today } from './lib/api.js';
import { addDays } from '../shared/planning.js';

const workspaceViews = {
  all: {
    label: 'Task board',
    title: 'Let’s move things forward',
    description: 'A little clarity for your next big thing.',
  },
  today: {
    label: 'Today',
    title: 'Make today count',
    description: 'Unfinished tasks due today or overdue. Start with what matters.',
  },
  upcoming: {
    label: 'Upcoming',
    title: 'Stay one step ahead',
    description: 'Unfinished deadlines in the next seven days, starting tomorrow.',
  },
  projects: {
    label: 'Projects',
    title: 'Every project, in perspective',
    description: 'See progress and unfinished deadlines across your project groups.',
  },
  focus: {
    label: 'Focus timer',
    title: 'A little room to focus',
    description: 'Choose one clear goal. Give it your attention, then take a break.',
  },
};

function Workspace({ mode, user, onExit, onExpired }) {
  const workspace = useWorkspace(mode, onExpired);
  const [dialog, setDialog] = useState(null);
  const [actionError, setActionError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const planning = ['today', 'upcoming'].includes(workspace.view);
  const pageCopy = workspaceViews[workspace.view];
  function openNewTask() {
    // Every entry point keeps the active project and calendar context.
    setDialog({
      task:
        planning || workspace.project
          ? {
              project: workspace.project || undefined,
              due:
                workspace.view === 'today'
                  ? today()
                  : workspace.view === 'upcoming'
                    ? addDays(today(), 1)
                    : '',
            }
          : null,
    });
  }
  const stats = [
    ['Total tasks', workspace.overview.total, 'Across your projects', Target],
    ['In progress', workspace.overview.active, 'Keep the momentum', CircleDot],
    ['Completed', workspace.overview.completed, 'One step closer', CheckCheck],
    ['Overdue', workspace.overview.overdue, 'Needs your attention', Clock3],
  ];
  async function act(callback) {
    setActionError('');
    try {
      await callback();
    } catch (failure) {
      setActionError(failure.message);
    }
  }
  async function exit() {
    setSigningOut(true);
    try {
      if (mode === 'account') await request('/auth/logout', { method: 'POST' });
      onExit();
    } catch (failure) {
      if (failure.status === 401) onExit();
      else setActionError(failure.message);
    } finally {
      setSigningOut(false);
    }
  }
  return (
    <div className={'workspace' + (workspace.view === 'focus' ? ' focus-workspace' : '')}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="logo" aria-hidden="true">
            ◈
          </span>{' '}
          orbit.
        </a>
        <div className="workspace-label">
          <span className="avatar">
            {mode === 'demo'
              ? 'O'
              : user.name
                  .split(' ')
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()}
          </span>
          <div>
            {mode === 'demo' ? 'Demo workspace' : user.name}
            <small>
              {mode === 'demo' ? 'Explore at your own pace' : 'Personal workspace'}
            </small>
          </div>
        </div>
        <nav aria-label="Workspace">
          {[
            ['all', 'Task board', LayoutDashboard],
            ['today', 'Today', CalendarDays],
            ['upcoming', 'Upcoming', CalendarRange],
            ['projects', 'Projects', FolderOpen],
            ['focus', 'Focus timer', Clock3],
          ].map(([value, label, Icon]) => (
            <button
              type="button"
              key={value}
              className={workspace.view === value ? 'nav-active' : ''}
              aria-pressed={workspace.view === value}
              disabled={workspace.busy}
              onClick={() => workspace.setView(value)}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
          <a href="/#features">
            <ArrowUpRight size={16} /> About Orbit
          </a>
          <a href="/privacy.html">
            <ShieldCheck size={16} /> Privacy &amp; data
          </a>
        </nav>
        <div className="sidebar-note">
          <Sparkles size={19} />
          <p>
            Small steps.
            <br />
            Big possibilities.
          </p>
          <span className="small muted">Make a little progress today.</span>
        </div>
        <button
          className="sidebar-exit"
          disabled={signingOut || workspace.busy}
          onClick={exit}
        >
          <LogOut size={15} />{' '}
          {mode === 'demo' ? 'Leave demo' : signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </aside>
      <main id="main" className="dashboard">
        <header className="topbar">
          <span>
            Workspace <span className="muted">/ {pageCopy.label}</span>
          </span>
          <div className="topbar-actions">
            <span className="pill">
              {mode === 'demo' ? 'LOCAL DEMO' : 'PERSONAL WORKSPACE'}
            </span>
            {mode === 'demo' && (
              <button
                type="button"
                className="demo-exit"
                disabled={signingOut || workspace.busy}
                onClick={exit}
              >
                <LogOut size={14} aria-hidden="true" /> Leave demo
              </button>
            )}
          </div>
        </header>
        <section className="page-heading">
          <div>
            <p className="eyebrow">YOUR WORK, IN FOCUS</p>
            <h1>
              {pageCopy.title}
              <span className="brand-dot">.</span>
            </h1>
            <p className="muted">{pageCopy.description}</p>
          </div>
          {workspace.view !== 'focus' && (
            <button className="button" disabled={workspace.busy} onClick={openNewTask}>
              <Plus size={17} /> New task
            </button>
          )}
        </section>
        <div className="notice-row" role="status" aria-live="polite">
          {workspace.notice}
        </div>
        {workspace.view !== 'focus' && (
          <section className="workspace-summary" aria-label="All tasks summary">
            <p className="summary-heading">Across your workspace</p>
            <div className="stats">
              {stats.map(([label, value, caption, Icon]) => (
                <article key={label}>
                  <div className="stat-label">
                    <span>{label}</span>
                    <Icon size={17} />
                  </div>
                  <strong>
                    {workspace.loading && workspace.overview.total === 0 ? '—' : value}
                  </strong>
                  <small>{caption}</small>
                </article>
              ))}
            </div>
          </section>
        )}
        {(workspace.error || actionError) && (
          <div className="error-banner" role="alert">
            <span>{workspace.error || actionError}</span>
            <button
              className="text-button"
              onClick={() => {
                setActionError('');
                workspace.retry();
              }}
            >
              Try again
            </button>
          </div>
        )}
        {workspace.view === 'focus' ? (
          <FocusTimer storageScope={mode === 'demo' ? 'demo' : user.id} />
        ) : workspace.view === 'projects' ? (
          <ProjectOverview
            projects={workspace.overview.projectSummaries ?? []}
            loading={workspace.loading}
            onOpen={workspace.openProject}
          />
        ) : (
          <section aria-labelledby="board-heading" aria-busy={workspace.loading}>
            <div className="board-toolbar">
              <div>
                <h2 id="board-heading">
                  {workspace.view === 'today'
                    ? 'Today’s priorities'
                    : workspace.view === 'upcoming'
                      ? 'Upcoming deadlines'
                      : 'Your task board'}
                </h2>
                <span className="small muted">
                  Page {workspace.page} · {workspace.tasks.length} tasks shown
                </span>
              </div>
              <div className="filters">
                <label className="search-field">
                  <Search size={15} aria-hidden="true" />
                  <span className="sr-only">Search tasks</span>
                  <input
                    type="search"
                    maxLength={120}
                    placeholder="Search your tasks…"
                    value={workspace.search}
                    onChange={(event) => workspace.setSearch(event.target.value)}
                  />
                </label>
                <label>
                  <span className="sr-only">Filter by project</span>
                  <select
                    aria-label="Filter by project"
                    value={workspace.project}
                    onChange={(event) => workspace.setProject(event.target.value)}
                  >
                    <option value="">All projects</option>
                    {[
                      ...new Set([
                        ...workspace.overview.projects,
                        ...(workspace.project ? [workspace.project] : []),
                      ]),
                    ].map((project) => (
                      <option value={project} key={project}>
                        {project}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className={'board' + (planning ? ' planning-board' : '')}>
              {Object.entries(statuses)
                .filter(([status]) => !planning || status !== 'done')
                .map(([status, label]) => {
                  const tasks = workspace.tasks.filter((task) => task.status === status);
                  return (
                    <section
                      className="column"
                      key={status}
                      aria-labelledby={'column-' + status}
                    >
                      <h3 className="column-heading" id={'column-' + status}>
                        <span
                          className={
                            'dot ' +
                            (status === 'progress'
                              ? 'progress-dot'
                              : status === 'done'
                                ? 'done-dot'
                                : '')
                          }
                        />
                        {label}
                        <span className="count">{tasks.length}</span>
                      </h3>
                      {workspace.loading ? (
                        <div className="skeleton-stack" aria-label="Loading tasks">
                          <div className="skeleton-card" />
                          <div className="skeleton-card" />
                        </div>
                      ) : (
                        tasks.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            busy={workspace.busy}
                            onEdit={(task) => setDialog({ task })}
                            onStatus={(task, status) =>
                              act(() => workspace.updateStatus(task, status))
                            }
                            onChecklist={(task, checklist) =>
                              act(() => workspace.updateChecklist(task, checklist))
                            }
                            onDuplicate={(task) =>
                              setDialog({
                                task: {
                                  ...task,
                                  id: undefined,
                                  title: task.title.slice(0, 113) + ' (copy)',
                                  status: 'todo',
                                  due: '',
                                  checklist: (task.checklist ?? []).map((step) => ({
                                    ...step,
                                    id: crypto.randomUUID(),
                                    done: false,
                                  })),
                                },
                              })
                            }
                            onDelete={(task) => {
                              if (
                                window.confirm(
                                  'Delete “' + task.title + '”? This cannot be undone.',
                                )
                              )
                                act(() => workspace.remove(task));
                            }}
                          />
                        ))
                      )}
                      {!workspace.loading && !tasks.length && (
                        <div className="board-empty">
                          <span aria-hidden="true">＋</span>
                          <p>
                            {workspace.search || workspace.project
                              ? 'No matching tasks on this page.'
                              : status === 'todo'
                                ? 'Nothing waiting here.'
                                : status === 'progress'
                                  ? 'No tasks in progress here.'
                                  : 'Completed work will appear here.'}
                          </p>
                          {status === 'todo' && (
                            <button className="text-button" onClick={openNewTask}>
                              Create a task
                            </button>
                          )}
                        </div>
                      )}
                    </section>
                  );
                })}
            </div>
            {(workspace.page > 1 || workspace.hasMore) && (
              <nav className="pagination" aria-label="Task pages">
                <button
                  className="secondary"
                  disabled={workspace.page === 1 || workspace.loading || workspace.busy}
                  onClick={() => workspace.setPage(workspace.page - 1)}
                >
                  Previous
                </button>
                <span>Page {workspace.page}</span>
                <button
                  className="secondary"
                  disabled={!workspace.hasMore || workspace.loading || workspace.busy}
                  onClick={() => workspace.setPage(workspace.page + 1)}
                >
                  Next
                </button>
              </nav>
            )}
          </section>
        )}
        <footer className="dashboard-footer">
          <span>
            {mode === 'demo'
              ? 'Demo tasks stay in this browser. No account required.'
              : 'Your tasks are saved to your private account.'}
          </span>
          {mode === 'demo' && (
            <button
              className="text-button"
              disabled={workspace.busy}
              onClick={() => {
                if (window.confirm('Replace your local tasks with sample tasks?'))
                  act(() => workspace.reset());
              }}
            >
              Reset demo
            </button>
          )}
        </footer>
      </main>
      {dialog && (
        <TaskDialog
          task={dialog.task}
          onClose={() => setDialog(null)}
          onSave={workspace.save}
        />
      )}
    </div>
  );
}
export default function App() {
  const [mode, setMode] = useState(
    new URLSearchParams(location.search).get('demo') === '1' ? 'demo' : 'checking',
  );
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const expired = useCallback(() => {
    setUser(null);
    setMode('auth');
    setError('Your session has expired. Please sign in again.');
  }, []);
  useEffect(() => {
    if (new URLSearchParams(location.search).get('demo') === '1') return;
    const controller = new AbortController();
    request('/auth/me', { signal: controller.signal })
      .then((result) => {
        setUser(result.user);
        setMode('account');
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          if (failure.status !== 401)
            setError(
              'Account service is unavailable. You can still explore the local demo.',
            );
          setMode('auth');
        }
      });
    return () => controller.abort();
  }, []);
  function chooseMode(value) {
    history.replaceState(null, '', value === 'demo' ? '/app.html?demo=1' : '/app.html');
    setMode(value);
  }
  if (mode === 'checking')
    return (
      <main className="auth-loading" role="status">
        <span className="logo" aria-hidden="true">
          ◈
        </span>
        <p>Opening your workspace…</p>
      </main>
    );
  if (mode === 'auth')
    return (
      <AuthScreen
        key={error}
        initialError={error}
        initialRegister={new URLSearchParams(location.search).get('auth') === 'register'}
        onUser={(value) => {
          setUser(value);
          setError('');
          chooseMode('account');
        }}
        onDemo={() => chooseMode('demo')}
      />
    );
  return (
    <Workspace
      mode={mode}
      user={user}
      onExpired={expired}
      onExit={() => {
        setUser(null);
        setError('');
        chooseMode('auth');
      }}
    />
  );
}
