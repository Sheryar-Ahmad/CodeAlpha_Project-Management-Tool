import TeamWorkspace from './components/TeamWorkspace.jsx';
import TaskImportDialog from './components/TaskImportDialog.jsx';
import AccountSettings, { AccountDeletionScreen } from './components/AccountSettings.jsx';
import { useCallback, useEffect, useState } from 'react';
import {
  Users,
  Download,
  Inbox,
  Timer,
  Archive,
  Trash2,
  ArrowUpRight,
  CalendarDays,
  CalendarRange,
  FolderOpen,
  CheckCheck,
  CircleDot,
  CirclePause,
  Clock3,
  LayoutDashboard,
  List,
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
import ProjectNotebook from './components/ProjectNotebook.jsx';
import ProjectDialog from './components/ProjectDialog.jsx';
import CommandBar from './components/CommandBar.jsx';
import CalendarView from './components/CalendarView.jsx';
import TimeTracking from './components/TimeTracking.jsx';
import FocusTimer from './components/FocusTimer.jsx';
import useWorkspace from './hooks/useWorkspace.js';
import { request, today } from './lib/api.js';
import { addDays, attentionReasons } from '../shared/planning.js';

const workspaceViews = {
  teams: {
    label: 'Team projects',
    title: 'Good work, together',
    description: 'Share a project with the right people and keep the next steps clear.',
  },
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
  calendar: {
    label: 'Calendar',
    title: 'See your month clearly',
    description: 'Keep deadlines in view and make room for the work ahead.',
  },
  attention: {
    label: 'Action Center',
    title: 'Know what needs you next',
    description:
      'Unfinished work that is blocked, high priority, overdue, or due within three days.',
  },
  projects: {
    label: 'Projects',
    title: 'Every project, in perspective',
    description: 'Give each project a purpose, a timeline, and clear next steps.',
  },
  blocked: {
    label: 'Blockers',
    title: 'Clear the way forward',
    description: 'See what is waiting on input, decisions, or access.',
  },
  archived: {
    label: 'Archive',
    title: 'Keep the progress, clear the space',
    description:
      'Archived tasks stay saved without appearing in active work. Return them to the board whenever you need them.',
  },
  trash: {
    label: 'Trash',
    title: 'A second chance for your work',
    description:
      'Restore a task to the board or permanently delete it. Nothing is automatically removed from Trash.',
  },
  time: {
    label: 'Work log',
    title: 'Give your effort a clear record',
    description: 'Record actual work and review a simple weekly timesheet.',
  },
  focus: {
    label: 'Focus timer',
    title: 'A little room to focus',
    description: 'Choose one clear goal. Give it your attention, then take a break.',
  },
};

function Workspace({ mode, user, onExit, onExpired, onDeleting }) {
  const workspace = useWorkspace(mode, onExpired);
  const [dialog, setDialog] = useState(null);
  const [projectDialog, setProjectDialog] = useState(null);
  const [notebookProject, setNotebookProject] = useState(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [layout, setLayout] = useState('board');
  const [actionError, setActionError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => {
    function shortcut(event) {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'k' &&
        !workspace.busy &&
        !dialog &&
        !projectDialog &&
        !notebookProject
      ) {
        event.preventDefault();
        const openDialog = document.querySelector('dialog[open]');
        if (openDialog && !openDialog.classList.contains('command-dialog')) return;
        setCommandOpen((value) => !value);
      }
    }
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, [workspace.busy, dialog, projectDialog, notebookProject]);
  function chooseCommand(item) {
    setCommandOpen(false);
    if (item.kind === 'task') openNewTask();
    else if (item.kind === 'createProject') setProjectDialog({ project: null });
    else if (item.kind === 'view') workspace.setView(item.value);
    else if (item.kind === 'project') workspace.openProject(item.value);
    else if (item.kind === 'search') {
      workspace.setView('all');
      workspace.setSearch(item.value);
    }
  }
  const recovery = ['archived', 'trash'].includes(workspace.view);
  const planning = ['today', 'upcoming'].includes(workspace.view);
  const pageCopy = workspaceViews[workspace.view];
  const taskHeading =
    {
      attention: 'Work that needs attention',
      today: 'Today’s priorities',
      upcoming: 'Upcoming deadlines',
      blocked: 'Work that needs unblocking',
      archived: 'Archived tasks',
      trash: 'Tasks in Trash',
    }[workspace.view] || (layout === 'list' ? 'Your task list' : 'Your task board');
  const visibleStatuses = Object.entries(statuses).filter(([status]) => {
    if (workspace.view === 'blocked') return status === 'blocked';
    if (planning && status === 'done') return false;
    return status !== 'blocked' || workspace.overview.blocked > 0;
  });
  function openNewTask() {
    // Every entry point keeps the active project and calendar context.
    setDialog({
      task:
        planning || workspace.project || workspace.view === 'calendar'
          ? {
              project: workspace.project || undefined,
              due:
                workspace.view === 'today'
                  ? today()
                  : workspace.view === 'upcoming'
                    ? addDays(today(), 1)
                    : workspace.view === 'calendar'
                      ? workspace.date.startsWith(workspace.month)
                        ? workspace.date
                        : workspace.month + '-01'
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
  // Board and list share every action, so their behavior cannot drift apart.
  function renderTask(task) {
    return (
      <TaskCard
        key={task.id}
        task={task}
        busy={workspace.busy}
        attention={
          workspace.view === 'attention' ? attentionReasons(task, workspace.date) : []
        }
        onEdit={(task) => setDialog({ task })}
        onStatus={(task, status) =>
          status === 'blocked'
            ? setDialog({ task: { ...task, status: 'blocked' } })
            : act(() => workspace.updateStatus(task, status))
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
              blockerReason: '',
              recurrence: 'none',
              repeatSource: undefined,
              repeatNext: undefined,
              due: '',
              checklist: (task.checklist ?? []).map((step) => ({
                ...step,
                id: crypto.randomUUID(),
                done: false,
              })),
            },
          })
        }
        onArchive={(task) => act(() => workspace.archive(task))}
        onRestore={(task) => act(() => workspace.restore(task))}
        onPermanentDelete={(task) => {
          if (
            window.confirm(
              'Permanently delete “' + task.title + '”? This cannot be undone.',
            )
          )
            act(() => workspace.purge(task));
        }}
        onDelete={(task) => {
          if (
            window.confirm(
              'Move “' + task.title + '” to Trash? You can restore it later.',
            )
          )
            act(() => workspace.remove(task));
        }}
      />
    );
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
            ['calendar', 'Calendar', CalendarDays],
            ['attention', 'Action Center', Inbox],
            ['projects', 'Projects', FolderOpen],
            ['teams', 'Team projects', Users],
            ['blocked', 'Blockers', CirclePause],
            ['focus', 'Focus timer', Clock3],
            ['time', 'Work log', Timer],
            ['archived', 'Archive', Archive],
            ['trash', 'Trash', Trash2],
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
              {['blocked', 'archived', 'trash'].includes(value) &&
                workspace.overview[value === 'trash' ? 'trashed' : value] > 0 && (
                  <span className="nav-count">
                    {workspace.overview[value === 'trash' ? 'trashed' : value]}
                  </span>
                )}
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
            <button
              type="button"
              className="workspace-search-button"
              aria-label="Search workspace"
              title="Search workspace (Ctrl+K or Command+K)"
              disabled={workspace.busy || workspace.loading}
              onClick={() => setCommandOpen(true)}
            >
              <Search size={15} aria-hidden="true" />
              <span>Quick find</span>
              <kbd>Ctrl K</kbd>
            </button>
            <span className="pill">
              {mode === 'demo'
                ? 'LOCAL DEMO'
                : workspace.view === 'teams'
                  ? 'TEAM PROJECTS'
                  : 'PERSONAL WORKSPACE'}
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
          {!['focus', 'time', 'teams'].includes(workspace.view) && !recovery && (
            <button
              className="button"
              disabled={workspace.busy || workspace.loading}
              onClick={() =>
                workspace.view === 'projects'
                  ? setProjectDialog({ project: null })
                  : openNewTask()
              }
            >
              <Plus size={17} />{' '}
              {workspace.view === 'projects' ? 'New project' : 'New task'}
            </button>
          )}
        </section>
        <div className="notice-row" role="status" aria-live="polite">
          {workspace.notice}
        </div>
        {!['focus', 'time', 'teams'].includes(workspace.view) && (
          <section className="workspace-summary" aria-label="All tasks summary">
            <p className="summary-heading">Across your active workspace</p>
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
        {workspace.view === 'teams' ? (
          <TeamWorkspace demo={mode === 'demo'} onExpired={onExpired} />
        ) : workspace.view === 'focus' ? (
          <FocusTimer storageScope={mode === 'demo' ? 'demo' : user.id} />
        ) : workspace.view === 'time' ? (
          <TimeTracking
            demo={mode === 'demo'}
            projects={workspace.overview.projects}
            onExpired={onExpired}
          />
        ) : workspace.view === 'calendar' ? (
          <CalendarView
            month={workspace.month}
            onMonth={workspace.setMonth}
            tasks={workspace.tasks}
            loading={workspace.loading}
            busy={workspace.busy}
            truncated={workspace.calendarTruncated}
            today={workspace.date}
            projects={workspace.overview.projects}
            project={workspace.project}
            onProject={workspace.setProject}
            onNew={(due) =>
              setDialog({ task: { due, project: workspace.project || undefined } })
            }
            renderTask={renderTask}
          />
        ) : workspace.view === 'projects' ? (
          <ProjectOverview
            date={workspace.date}
            projects={workspace.overview.projectSummaries ?? []}
            loading={workspace.loading}
            onOpen={workspace.openProject}
            busy={workspace.busy}
            truncated={workspace.overview.projectRecordsTruncated}
            onEdit={(project) => setProjectDialog({ project })}
            onNotebook={setNotebookProject}
            onConnect={(project) => act(() => workspace.connectProject(project))}
          />
        ) : (
          <section aria-labelledby="board-heading" aria-busy={workspace.loading}>
            <div className="board-toolbar">
              <div>
                <h2 id="board-heading">{taskHeading}</h2>
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
                {!recovery && (
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
                )}
              </div>
            </div>
            {!recovery && (
              <div className="view-switch" role="group" aria-label="Task layout">
                <button
                  type="button"
                  aria-pressed={layout === 'board'}
                  onClick={() => setLayout('board')}
                >
                  <LayoutDashboard size={15} aria-hidden="true" /> Board view
                </button>
                <button
                  type="button"
                  aria-pressed={layout === 'list'}
                  onClick={() => setLayout('list')}
                >
                  <List size={15} aria-hidden="true" /> List view
                </button>
                <span className="small muted">Same tasks. A different perspective.</span>
              </div>
            )}
            {layout === 'list' || recovery ? (
              workspace.loading ? (
                <div className="list-skeleton" role="status" aria-label="Loading tasks">
                  <div className="skeleton-card" />
                  <div className="skeleton-card" />
                </div>
              ) : workspace.tasks.length ? (
                <ul className="task-list" aria-label="Tasks on this page">
                  {workspace.tasks.map((task) => (
                    <li key={task.id}>{renderTask(task)}</li>
                  ))}
                </ul>
              ) : (
                <div className="board-empty list-empty">
                  <h3>
                    {workspace.search || workspace.project
                      ? 'No matching tasks on this page'
                      : recovery
                        ? workspace.view === 'trash'
                          ? 'Trash is empty'
                          : 'No archived tasks yet'
                        : workspace.view === 'blocked'
                          ? 'Nothing is blocked here'
                          : 'A little space for your next step'}
                  </h3>
                  <p>
                    {workspace.search || workspace.project
                      ? 'Try a different search or project filter.'
                      : recovery
                        ? 'Your active tasks are still on the board.'
                        : 'Create a task when you are ready.'}
                  </p>
                  {!recovery && (
                    <button type="button" className="text-button" onClick={openNewTask}>
                      Create a task
                    </button>
                  )}
                </div>
              )
            ) : (
              <div
                className={
                  'board' +
                  (planning ? ' planning-board' : '') +
                  (visibleStatuses.length === 4 ? ' expanded-board' : '') +
                  (workspace.view === 'blocked' ? ' blocked-board' : '')
                }
                style={{ '--board-columns': visibleStatuses.length }}
              >
                {visibleStatuses.map(([status, label]) => {
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
                                : status === 'blocked'
                                  ? 'blocked-dot'
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
                        tasks.map(renderTask)
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
                                  : status === 'blocked'
                                    ? 'Nothing is blocked here.'
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
            )}
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
              : workspace.view === 'teams'
                ? 'Shared project work is visible to accepted members. Exports contain only tasks owned by your account.'
                : 'Your tasks are saved to your private account.'}
          </span>
          <div className="footer-actions">
            {workspace.view !== 'teams' && (
              <button
                className="text-button"
                disabled={workspace.busy || workspace.loading}
                onClick={() => act(workspace.exportCalendar)}
              >
                Export deadline calendar
              </button>
            )}
            {mode === 'account' && (
              <button
                className="text-button"
                disabled={workspace.busy || workspace.loading}
                onClick={() => setAccountOpen(true)}
              >
                Account settings
              </button>
            )}
            {mode === 'account' && (
              <button
                type="button"
                className="text-button"
                disabled={workspace.busy || workspace.loading}
                onClick={() => setImportOpen(true)}
              >
                Import task backup
              </button>
            )}
            <button
              type="button"
              className="text-button"
              disabled={workspace.busy || workspace.loading}
              title="Download all tasks, including Archive and Trash"
              onClick={() => act(workspace.exportTasks)}
            >
              <Download size={14} aria-hidden="true" />{' '}
              {workspace.view === 'teams' ? 'Export owned tasks' : 'Export tasks'}
            </button>
            {mode === 'demo' && (
              <button
                className="text-button"
                disabled={workspace.busy}
                onClick={() => {
                  if (
                    window.confirm(
                      'Replace demo tasks with samples and remove project details, notebook entries, and work logs?',
                    )
                  )
                    act(() => workspace.reset());
                }}
              >
                Reset demo
              </button>
            )}
          </div>
        </footer>
      </main>
      {notebookProject && (
        <ProjectNotebook
          project={notebookProject}
          demo={mode === 'demo'}
          onClose={() => setNotebookProject(null)}
          onExpired={onExpired}
          onFollowUp={(task) => {
            setNotebookProject(null);
            setDialog({ task });
          }}
        />
      )}
      {accountOpen && (
        <AccountSettings
          onClose={() => setAccountOpen(false)}
          onExpired={onExpired}
          onDeleted={onExit}
          onDeleting={onDeleting}
        />
      )}
      {importOpen && (
        <TaskImportDialog
          user={user}
          onClose={() => setImportOpen(false)}
          onExpired={onExpired}
          onImported={() => workspace.retry()}
        />
      )}
      {commandOpen && (
        <CommandBar
          views={workspaceViews}
          projects={workspace.overview.projects}
          onClose={() => setCommandOpen(false)}
          onChoose={chooseCommand}
        />
      )}
      {projectDialog && (
        <ProjectDialog
          project={projectDialog.project}
          demo={mode === 'demo'}
          onClose={() => setProjectDialog(null)}
          onSave={workspace.saveProject}
        />
      )}
      {dialog && (
        <TaskDialog
          task={dialog.task}
          projectNames={workspace.overview.projects}
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
  if (user?.deleting)
    return (
      <AccountDeletionScreen
        onExpired={expired}
        onDeleted={() => {
          setUser(null);
          setError('Your account has been removed.');
          chooseMode('auth');
        }}
      />
    );
  return (
    <Workspace
      mode={mode}
      user={user}
      onDeleting={() => setUser((value) => ({ ...value, deleting: true }))}
      onExpired={expired}
      onExit={() => {
        setUser(null);
        setError('');
        chooseMode('auth');
      }}
    />
  );
}
