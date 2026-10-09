import { useEffect, useRef, useState } from 'react';
import { request, today } from '../lib/api.js';
import { createTaskExport } from '../../shared/export.js';
import { downloadTaskExport } from '../lib/export.js';
import { nextRecurringDraft } from '../../shared/recurrence.js';
import { matchesPlanningView } from '../../shared/planning.js';
import { readDemo, saveDemo, demoOverview, resetDemo } from '../lib/demo.js';

const lifecycleActions = {
  archive: { from: 'active', to: 'archived' },
  unarchive: { from: 'archived', to: 'active' },
  restore: { from: 'trashed', to: 'active' },
};
const emptyOverview = {
  total: 0,
  active: 0,
  completed: 0,
  blocked: 0,
  archived: 0,
  trashed: 0,
  overdue: 0,
  projects: [],
  projectSummaries: [],
};
export default function useWorkspace(mode, onExpired) {
  const [tasks, setTasks] = useState([]);
  const [overview, setOverview] = useState(emptyOverview);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [project, setProject] = useState('');
  const [view, setView] = useState('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [date, setDate] = useState(today);
  // Refresh calendar views after midnight, including tabs returning from the background.
  useEffect(() => {
    const refreshDate = () => setDate(today());
    const interval = setInterval(refreshDate, 60000);
    document.addEventListener('visibilitychange', refreshDate);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshDate);
    };
  }, []);
  const mutationLock = useRef(false);
  useEffect(() => {
    const query = search.trim();
    // An unchanged query must not reset a page selected during the debounce window.
    if (query === debounced) return;
    const timeout = setTimeout(() => {
      setDebounced(query);
      setPage(1);
    }, 250);
    return () => clearTimeout(timeout);
  }, [search, debounced]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    async function load() {
      try {
        let result, stats;
        if (mode === 'demo') {
          const all = readDemo();
          stats = demoOverview(all, date);
          const query = debounced.toLocaleLowerCase();
          const filtered = all.filter(
            (task) =>
              matchesPlanningView(task, view, date) &&
              (!project || task.project === project) &&
              (
                task.title +
                ' ' +
                task.project +
                ' ' +
                task.description +
                ' ' +
                task.notes +
                ' ' +
                task.blockerReason
              )
                .toLocaleLowerCase()
                .includes(query),
          );
          if (['today', 'upcoming'].includes(view))
            filtered.sort((a, b) => a.due.localeCompare(b.due));
          result = {
            tasks: filtered.slice((page - 1) * 30, page * 30),
            hasMore: filtered.length > page * 30,
          };
        } else {
          const params = new URLSearchParams({
            search: debounced,
            project,
            page: String(page),
            view: ['projects', 'focus'].includes(view) ? 'all' : view,
            date,
          });
          [result, stats] = await Promise.all([
            ['projects', 'focus'].includes(view)
              ? Promise.resolve({ tasks: [], hasMore: false })
              : request('/tasks?' + params, { signal: controller.signal }),
            request('/tasks/overview?date=' + date, { signal: controller.signal }),
          ]);
        }
        if (!controller.signal.aborted) {
          if (!result.tasks.length && page > 1) {
            setPage(page - 1);
            return;
          }
          setTasks(result.tasks);
          setHasMore(result.hasMore);
          setOverview(stats);
        }
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (failure.status === 401) onExpired();
        else setError(failure.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [mode, debounced, project, view, page, revision, date, onExpired]);
  async function mutate(action, id, data) {
    if (mutationLock.current) throw new Error('Please wait for the current save.');
    mutationLock.current = true;
    setBusy(true);
    setNotice('');
    try {
      const transition = lifecycleActions[action];
      if (mode === 'demo') {
        const all = readDemo();
        const current = all.find((task) => task.id === id);
        if (
          action !== 'create' &&
          (!current ||
            (transition && current.lifecycle !== transition.from) ||
            (action === 'update' && current.lifecycle !== 'active') ||
            (action === 'delete' && current.lifecycle === 'trashed') ||
            (action === 'permanent' && current.lifecycle !== 'trashed'))
        ) {
          throw new Error('This task has changed. Refresh and try again.');
        }
        const changes = transition
          ? { lifecycle: transition.to }
          : action === 'delete'
            ? { lifecycle: 'trashed' }
            : data;
        let next =
          action === 'create'
            ? [{ ...data, lifecycle: 'active', id: crypto.randomUUID() }, ...all]
            : action === 'permanent'
              ? all.filter((task) => task.id !== id)
              : all.map((task) => (task.id === id ? { ...task, ...changes } : task));
        const changed = next.find(
          (task) => task.id === (action === 'create' ? next[0].id : id),
        );
        if (
          changed &&
          data?.due &&
          (!current || data.due !== current.due || !current.repeatDay)
        )
          changed.repeatDay = Number(data.due.slice(8));
        if (
          changed &&
          data?.status === 'done' &&
          changed.recurrence !== 'none' &&
          !changed.repeatNext
        ) {
          const draft = nextRecurringDraft(changed, () => crypto.randomUUID());
          if (draft) {
            const nextId = crypto.randomUUID();
            changed.repeatNext = nextId;
            next = [{ ...draft, id: nextId, repeatSource: changed.id }, ...next];
          }
        }
        saveDemo(next);
      } else {
        const suffix = transition
          ? '/lifecycle'
          : action === 'permanent'
            ? '/permanent'
            : '';
        const body = transition ? { action } : data;
        await request('/tasks' + (id ? '/' + id : '') + suffix, {
          method:
            action === 'create'
              ? 'POST'
              : ['delete', 'permanent'].includes(action)
                ? 'DELETE'
                : 'PATCH',
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      }
      setRevision((value) => value + 1);
      setNotice(mode === 'demo' ? 'Saved in this browser.' : 'Saved to your workspace.');
    } catch (failure) {
      if (failure.status === 401) onExpired();
      throw failure;
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }
  async function exportTasks() {
    if (mutationLock.current) throw new Error('Please wait for the current save.');
    mutationLock.current = true;
    setBusy(true);
    setNotice('');
    try {
      const data =
        mode === 'demo'
          ? createTaskExport(readDemo(), 'demo')
          : await request('/tasks/export');
      downloadTaskExport(data);
      setNotice('Task export prepared. Keep the downloaded file somewhere private.');
    } catch (failure) {
      if (failure.status === 401) onExpired();
      throw failure;
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }
  return {
    exportTasks,
    tasks,
    overview,
    search,
    setSearch,
    project,
    view,
    setView: (value) => {
      setView(value);
      setProject('');
      setSearch('');
      setPage(1);
    },
    openProject: (value) => {
      setView('all');
      setProject(value);
      setSearch('');
      setPage(1);
    },
    setProject: (value) => {
      setProject(value);
      setPage(1);
    },
    page,
    setPage,
    hasMore,
    loading,
    busy,
    error,
    notice,
    retry: () => setRevision((value) => value + 1),
    save: (data, id) => mutate(id ? 'update' : 'create', id, data),
    updateStatus: (task, status) =>
      mutate('update', task.id, { status, blockerReason: '' }),
    updateChecklist: (task, checklist) => mutate('update', task.id, { checklist }),
    remove: (task) => mutate('delete', task.id),
    archive: (task) => mutate('archive', task.id),
    restore: (task) =>
      mutate(task.lifecycle === 'archived' ? 'unarchive' : 'restore', task.id),
    purge: (task) => mutate('permanent', task.id),
    reset: () => {
      resetDemo();
      setPage(1);
      setProject('');
      setSearch('');
      setRevision((value) => value + 1);
    },
  };
}
