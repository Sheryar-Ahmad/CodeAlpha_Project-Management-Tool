import useModal from '../hooks/useModal.js';
import { useRef, useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import {
  projectStatuses,
  validProjectDates,
  validMilestones,
} from '../../shared/project.js';
export default function ProjectDialog({ project, demo, onClose, onSave }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [milestones, setMilestones] = useState(project?.milestones ?? []);
  function updateMilestone(id, change) {
    setMilestones((items) =>
      items.map((item) => (item.id === id ? { ...item, ...change } : item)),
    );
  }
  useModal(ref);
  async function submit(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    data.name = data.name?.trim();
    data.description = data.description.trim();
    data.milestones = milestones.map((item) => ({ ...item, title: item.title.trim() }));
    if (!validMilestones(data.milestones)) {
      setError('Give every milestone a title and valid date.');
      return;
    }
    if (!project?.id && !data.name) {
      setError('Enter a project name.');
      return;
    }
    if (!validProjectDates(data.startDate, data.targetDate)) {
      setError('The target date cannot be before the start date.');
      return;
    }
    if (project?.id) delete data.name;
    setBusy(true);
    setError('');
    try {
      await onSave(data, project?.id);
      onClose();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      aria-labelledby="project-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="dialog-heading">
          <h2 id="project-dialog-title">
            {project?.id ? 'Edit project details' : 'Create a project'}
          </h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close project form"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p className="small muted">
          Give the work a clear purpose and a realistic timeline.
        </p>
        <label>
          Project name
          <input
            name="name"
            aria-label="Project name"
            required
            maxLength={60}
            defaultValue={project?.name}
            readOnly={Boolean(project?.id)}
            disabled={busy}
            autoFocus={!project?.id}
            placeholder="e.g. Website launch"
          />
          {project?.id && (
            <span className="small muted">
              The name stays fixed to keep existing task groups connected.
            </span>
          )}
        </label>
        <label>
          Project description
          <textarea
            name="description"
            aria-label="Project description"
            maxLength={1000}
            rows={4}
            defaultValue={project?.description}
            disabled={busy}
            autoFocus={Boolean(project?.id)}
            placeholder="What are we trying to achieve?"
          />
        </label>
        <div className="form-row">
          <label>
            Start date
            <input
              name="startDate"
              aria-label="Project start date"
              type="date"
              min="2000-01-01"
              max="2100-12-31"
              defaultValue={project?.startDate}
              disabled={busy}
            />
          </label>
          <label>
            Target date
            <input
              name="targetDate"
              aria-label="Project target date"
              type="date"
              min="2000-01-01"
              max="2100-12-31"
              defaultValue={project?.targetDate}
              disabled={busy}
            />
          </label>
        </div>
        <label>
          Project status
          <select
            name="status"
            aria-label="Project status"
            defaultValue={project?.status ?? 'planned'}
            disabled={busy}
          >
            {Object.entries(projectStatuses).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <details className="milestone-editor">
          <summary>Milestones ({milestones.length}/20)</summary>
          <p className="small muted">
            Name the important checkpoints. Mark them complete when the outcome is
            achieved.
          </p>
          {milestones.map((item, index) => (
            <fieldset key={item.id}>
              <legend>Milestone {index + 1}</legend>
              <label>
                Title
                <input
                  aria-label={'Milestone title ' + (index + 1)}
                  value={item.title}
                  maxLength={120}
                  required
                  disabled={busy}
                  onChange={(event) =>
                    updateMilestone(item.id, { title: event.target.value })
                  }
                />
              </label>
              <div className="form-row">
                <label>
                  Due date
                  <input
                    aria-label={'Milestone due date ' + (index + 1)}
                    type="date"
                    min="2000-01-01"
                    max="2100-12-31"
                    value={item.due}
                    disabled={busy}
                    onChange={(event) =>
                      updateMilestone(item.id, { due: event.target.value })
                    }
                  />
                </label>
                <label className="milestone-done">
                  <input
                    type="checkbox"
                    aria-label={'Milestone completed ' + (index + 1)}
                    checked={item.done}
                    disabled={busy}
                    onChange={(event) =>
                      updateMilestone(item.id, { done: event.target.checked })
                    }
                  />{' '}
                  Completed
                </label>
              </div>
              <button
                type="button"
                className="text-button"
                aria-label={'Remove milestone ' + (index + 1)}
                disabled={busy}
                onClick={() =>
                  setMilestones((items) => items.filter((value) => value.id !== item.id))
                }
              >
                <Trash2 size={14} /> Remove milestone
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            className="secondary"
            disabled={busy || milestones.length >= 20}
            onClick={() =>
              setMilestones((items) => [
                ...items,
                { id: crypto.randomUUID(), title: '', due: '', done: false },
              ])
            }
          >
            <Plus size={14} /> Add milestone
          </button>
        </details>
        <p className="small muted">
          Project status is your planning decision. Task completion is calculated
          separately.{' '}
          {demo
            ? 'Demo project details stay in this browser.'
            : 'This project stays private to your account.'}
        </p>
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
            {busy ? 'Saving…' : 'Save project'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
