import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { statuses } from './TaskCard.jsx';
import { validResourceUrl } from '../../shared/task.js';

export default function TaskDialog({ task, onClose, onSave }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [steps, setSteps] = useState(task?.checklist ?? []);
  const [links, setLinks] = useState(task?.links ?? []);
  useEffect(() => {
    const trigger = document.activeElement;
    ref.current.showModal();
    return () => trigger?.focus();
  }, []);
  async function submit(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    data.title = data.title.trim();
    data.project = data.project.trim();
    data.description = data.description.trim();
    data.notes = data.notes.trim();
    data.links = links.map((link) => ({
      label: link.label.trim(),
      url: link.url.trim(),
    }));
    if (data.links.some((link) => !link.label || !validResourceUrl(link.url))) {
      setError('Give each resource a name and a valid HTTP or HTTPS link.');
      return;
    }
    if (!data.title || !data.project) {
      setError('Enter a task title and project.');
      return;
    }
    data.checklist = steps.map((step) => ({ ...step, text: step.text.trim() }));
    if (data.checklist.some((step) => !step.text)) {
      setError('Fill in every checklist step, or remove the empty ones.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave(data, task?.id);
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
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="dialog-heading">
          <h2 id="dialog-title">{task?.id ? 'Edit task' : 'New task'}</h2>
          <button
            className="icon-button"
            type="button"
            disabled={busy}
            aria-label="Close task form"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <label>
          Task title
          <input
            name="title"
            required
            maxLength={120}
            defaultValue={task?.title}
            autoFocus
            disabled={busy}
            placeholder="What needs to get done?"
          />
        </label>
        <label>
          Project
          <input
            name="project"
            required
            maxLength={60}
            defaultValue={task?.project}
            disabled={busy}
            placeholder="e.g. Website launch"
          />
        </label>
        <label>
          Description
          <textarea
            name="description"
            maxLength={1000}
            rows={3}
            defaultValue={task?.description}
            disabled={busy}
            placeholder="A little context goes a long way"
          />
        </label>
        <div className="form-row">
          <label>
            Priority
            <select
              aria-label="Priority"
              name="priority"
              defaultValue={task?.priority || 'medium'}
              disabled={busy}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label>
            Due date
            <input
              name="due"
              type="date"
              min="2000-01-01"
              max="2100-12-31"
              defaultValue={task?.due}
              disabled={busy}
            />
          </label>
        </div>
        <label>
          Status
          <select
            aria-label="Status"
            name="status"
            defaultValue={task?.status || 'todo'}
            disabled={busy}
          >
            {Object.entries(statuses).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <details
          className="context-editor"
          open={Boolean(task?.notes || task?.links?.length)}
        >
          <summary>Notes &amp; resources</summary>
          <p className="small muted">
            Keep useful context and documents close to this task.
          </p>
          <label>
            Notes
            <textarea
              aria-label="Notes"
              name="notes"
              rows={4}
              maxLength={3000}
              defaultValue={task?.notes}
              disabled={busy}
              placeholder="Decisions, reminders, or useful background…"
            />
          </label>
          <fieldset disabled={busy}>
            <legend className="small">Resource links · up to 8</legend>
            {links.map((link, index) => (
              <div className="resource-editor" key={index}>
                <label>
                  <span className="sr-only">Resource label {index + 1}</span>
                  <input
                    required
                    maxLength={100}
                    value={link.label}
                    placeholder="e.g. Design brief"
                    onChange={(event) =>
                      setLinks(
                        links.map((item, position) =>
                          position === index
                            ? { ...item, label: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  <span className="sr-only">Resource URL {index + 1}</span>
                  <input
                    type="url"
                    required
                    maxLength={2048}
                    value={link.url}
                    placeholder="https://…"
                    onChange={(event) =>
                      setLinks(
                        links.map((item, position) =>
                          position === index
                            ? { ...item, url: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="card-icon"
                  aria-label={'Remove resource ' + (index + 1)}
                  onClick={() =>
                    setLinks(links.filter((_, position) => position !== index))
                  }
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-button add-step"
              disabled={links.length >= 8}
              onClick={() => setLinks([...links, { label: '', url: '' }])}
            >
              <Plus size={14} /> Add a resource
            </button>
          </fieldset>
        </details>
        <fieldset className="checklist-editor" disabled={busy}>
          <legend>
            Checklist <span className="muted small">Optional · up to 20 steps</span>
          </legend>
          {steps.map((step, index) => (
            <div className="step-editor" key={step.id}>
              <input
                type="checkbox"
                aria-label={'Mark step ' + (index + 1) + ' complete'}
                checked={step.done}
                onChange={(event) =>
                  setSteps(
                    steps.map((item) =>
                      item.id === step.id
                        ? { ...item, done: event.target.checked }
                        : item,
                    ),
                  )
                }
              />
              <input
                aria-label={'Checklist step ' + (index + 1)}
                maxLength={160}
                required
                value={step.text}
                placeholder="A small, clear next step"
                onChange={(event) =>
                  setSteps(
                    steps.map((item) =>
                      item.id === step.id ? { ...item, text: event.target.value } : item,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="card-icon"
                aria-label={'Remove checklist step ' + (index + 1)}
                onClick={() => setSteps(steps.filter((item) => item.id !== step.id))}
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-button add-step"
            disabled={steps.length >= 20}
            onClick={() =>
              setSteps([...steps, { id: crypto.randomUUID(), text: '', done: false }])
            }
          >
            <Plus size={14} /> Add a step
          </button>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button className="secondary" type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy ? 'Saving…' : 'Save task'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
