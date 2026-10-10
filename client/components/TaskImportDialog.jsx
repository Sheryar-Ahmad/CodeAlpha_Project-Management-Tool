import { useRef, useState } from 'react';
import useModal from '../hooks/useModal.js';
import { request } from '../lib/api.js';
export default function TaskImportDialog({ user, onClose, onImported, onExpired }) {
  const ref = useRef(null),
    lock = useRef(false);
  const storageKey = 'orbit.import-retry.' + user.id;
  const [retry] = useState(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem(storageKey));
      return value &&
        typeof value.key === 'string' &&
        typeof value.projectName === 'string'
        ? value
        : null;
    } catch {
      return null;
    }
  });
  const [key, setKey] = useState(retry?.key ?? crypto.randomUUID());
  const [projectName, setProjectName] = useState(retry?.projectName ?? '');
  const [file, setFile] = useState(null),
    [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false),
    [frozen, setFrozen] = useState(Boolean(retry)),
    [error, setError] = useState('');
  useModal(ref);
  async function chooseFile(event) {
    const selected = event.target.files[0];
    setFile(null);
    setPreview(null);
    setError('');
    if (!selected) return;
    if (selected.size > 1024 * 1024) {
      setError('Choose an Orbit JSON backup up to 1 MB and 100 tasks.');
      return;
    }
    setBusy(true);
    try {
      const parsed = JSON.parse(await selected.text());
      const result = await request('/imports/preview', {
        method: 'POST',
        body: JSON.stringify({ file: parsed }),
      });
      setFile(parsed);
      setPreview(result);
    } catch (failure) {
      if (failure.status === 401) onExpired();
      else
        setError(
          failure instanceof SyntaxError
            ? 'This file is not valid JSON.'
            : failure.message,
        );
    } finally {
      setBusy(false);
    }
  }
  async function submit(event) {
    event.preventDefault();
    if (!file || lock.current) return;
    if (
      !frozen &&
      !window.confirm(
        'Import these tasks into a new private project? Existing work stays saved.',
      )
    )
      return;
    lock.current = true;
    setBusy(true);
    setError('');
    setFrozen(true);
    const name = projectName.trim();
    try {
      // Retain only retry metadata. The original backup must be selected again after a reload.
      sessionStorage.setItem(storageKey, JSON.stringify({ key, projectName: name }));
      await request('/imports', {
        method: 'POST',
        body: JSON.stringify({ key, projectName: name, file }),
      });
      sessionStorage.removeItem(storageKey);
      onImported();
      onClose();
    } catch (failure) {
      if (failure.status === 401) onExpired();
      else setError(failure.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      aria-labelledby="import-heading"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <h2 id="import-heading">Bring your task backup back</h2>
        <p className="small muted">
          Import up to 100 tasks / 1 MB into a new owned project. Task content, estimates,
          status and archive/trash state are preserved. IDs are replaced; assignments,
          recurrence links and repeating schedules are not restored. No existing tasks are
          overwritten.
        </p>
        {retry && (
          <p role="status">
            An import may be unfinished. Select the original file to safely retry the
            saved project name.
          </p>
        )}
        <label>
          Orbit JSON backup
          <input
            aria-label="Orbit JSON backup"
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={chooseFile}
          />
        </label>
        <label>
          New import project
          <input
            aria-label="New import project"
            required
            maxLength={60}
            disabled={busy || frozen}
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
          />
        </label>
        {preview && (
          <div className="import-preview">
            <p>{preview.count} tasks checked and ready to import</p>
            <ul>
              {preview.tasks.map((task, index) => (
                <li key={index}>
                  <strong>{task.title}</strong> · {task.status} · {task.lifecycle} ·{' '}
                  {task.due || 'No due date'}
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        {frozen && !busy && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              if (
                !window.confirm(
                  'Start a separate import? If the previous one partly saved, its project and tasks remain.',
                )
              )
                return;
              sessionStorage.removeItem(storageKey);
              setKey(crypto.randomUUID());
              setFrozen(false);
              setError('');
            }}
          >
            Start a separate import
          </button>
        )}
        <div className="dialog-actions">
          <button type="button" className="secondary" disabled={busy} onClick={onClose}>
            Close import
          </button>
          <button className="button" disabled={busy || !preview || !projectName.trim()}>
            {busy ? 'Importing…' : frozen ? 'Retry import' : 'Import checked tasks'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
