import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import useModal from '../hooks/useModal.js';
import { today } from '../lib/api.js';
export default function WorkLogDialog({ log, projects, date, onClose, onSave }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useModal(ref);
  return (
    <dialog
      ref={ref}
      aria-labelledby="work-log-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const data = Object.fromEntries(new FormData(event.currentTarget));
          data.activity = data.activity.trim();
          data.project = data.project.trim();
          data.notes = data.notes.trim();
          data.minutes = Number(data.minutes);
          if (!data.activity || !data.project) {
            setError('Enter an activity and project name.');
            return;
          }
          setBusy(true);
          setError('');
          try {
            await onSave(data, log?.id);
            onClose();
          } catch (failure) {
            setError(failure.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="dialog-heading">
          <h2 id="work-log-title">{log ? 'Edit work log' : 'Record your work'}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close work log form"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p className="small muted">
          Record time you actually worked. Entries are manual records, not automatically
          measured or billable invoices.
        </p>
        <label>
          Activity
          <input
            name="activity"
            aria-label="Work activity"
            autoFocus
            required
            maxLength={120}
            defaultValue={log?.activity}
            disabled={busy}
            placeholder="e.g. Review the launch checklist"
          />
        </label>
        <label>
          Project
          <input
            name="project"
            aria-label="Work project"
            required
            maxLength={60}
            list="work-project-suggestions"
            defaultValue={log?.project}
            disabled={busy}
          />
          <datalist id="work-project-suggestions">
            {projects.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <div className="form-row">
          <label>
            Date
            <input
              name="date"
              aria-label="Work date"
              type="date"
              min="2000-01-01"
              max="2100-12-31"
              required
              defaultValue={log?.date ?? date ?? today()}
              disabled={busy}
            />
          </label>
          <label>
            Minutes
            <input
              name="minutes"
              aria-label="Minutes worked"
              type="number"
              min="1"
              max="1440"
              step="1"
              required
              defaultValue={log?.minutes ?? 30}
              disabled={busy}
            />
          </label>
        </div>
        <label>
          Notes
          <textarea
            name="notes"
            aria-label="Work notes"
            maxLength={500}
            rows={3}
            defaultValue={log?.notes}
            disabled={busy}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy ? 'Saving…' : 'Save work log'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
