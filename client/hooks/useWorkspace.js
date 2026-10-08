import { useEffect, useRef, useState } from 'react';
import { request, today } from '../lib/api.js';
import { readDemo, saveDemo, demoOverview, resetDemo } from '../lib/demo.js';

const emptyOverview = { total: 0, active: 0, completed: 0, overdue: 0, projects: [] };
export default function useWorkspace(mode, onExpired) {
  const [tasks, setTasks] = useState([]);
  const [overview, setOverview] = useState(emptyOverview);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [project, setProject] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const mutationLock = useRef(false);
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timeout);
  }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    async function load() {
      try {
        let result, stats;
        if (mode === 'demo') {
          const all = readDemo();
          stats = demoOverview(all, today());
          const query = debounced.toLocaleLowerCase();
          const filtered = all.filter(
            (task) =>
              (!project || task.project === project) &&
              (task.title + ' ' + task.project + ' ' + task.description)
                .toLocaleLowerCase()
                .includes(query),
          );
          result = {
            tasks: filtered.slice((page - 1) * 30, page * 30),
            hasMore: filtered.length > page * 30,
          };
        } else {
          const params = new URLSearchParams({
            search: debounced,
            project,
            page: String(page),
          });
          [result, stats] = await Promise.all([
            request('/tasks?' + params, { signal: controller.signal }),
            request('/tasks/overview?date=' + today(), { signal: controller.signal }),
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
  }, [mode, debounced, project, page, revision, onExpired]);
  async function mutate(action, id, data) {
    if (mutationLock.current) throw new Error('Please wait for the current save.');
    mutationLock.current = true;
    setBusy(true);
    setNotice('');
    try {
      if (mode === 'demo') {
        const all = readDemo();
        const next =
          action === 'create'
            ? [{ ...data, id: crypto.randomUUID() }, ...all]
            : action === 'delete'
              ? all.filter((task) => task.id !== id)
              : all.map((task) => (task.id === id ? { ...task, ...data } : task));
        saveDemo(next);
      } else {
        await request('/tasks' + (id ? '/' + id : ''), {
          method: action === 'create' ? 'POST' : action === 'delete' ? 'DELETE' : 'PATCH',
          ...(data ? { body: JSON.stringify(data) } : {}),
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
  return {
    tasks,
    overview,
    search,
    setSearch,
    project,
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
    updateStatus: (task, status) => mutate('update', task.id, { status }),
    remove: (task) => mutate('delete', task.id),
    reset: () => {
      resetDemo();
      setPage(1);
      setProject('');
      setSearch('');
      setRevision((value) => value + 1);
    },
  };
}
