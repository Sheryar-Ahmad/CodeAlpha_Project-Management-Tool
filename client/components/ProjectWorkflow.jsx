import { useEffect, useRef, useState } from 'react';
import { request } from '../lib/api.js';
import { projectTemplates } from '../../shared/projectTemplates.js';
export default function ProjectWorkflow({ project, onExpired, onApplied }) {
  const [templateId, setTemplateId] = useState(projectTemplates[0].id),
    [setup, setSetup] = useState(null);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [revision, setRevision] = useState(0);
  const lock = useRef(false),
    endpoint = '/projects/' + project.id + '/workflow/template';
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    request(endpoint, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setSetup(result);
          if (result.templateId) setTemplateId(result.templateId);
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          if (failure.status === 401) onExpired();
          else {
            setError(failure.message);
            setSetup(null);
          }
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint, revision, onExpired]);
  const template = projectTemplates.find((item) => item.id === templateId);
  async function apply() {
    if (
      lock.current ||
      !window.confirm(
        'Add these starter tasks to this project? Existing tasks stay saved. A project can use one template.',
      )
    )
      return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(endpoint, { method: 'POST', body: JSON.stringify({ templateId }) });
      setRevision((value) => value + 1);
      setNotice('Project starter tasks are ready. Open Shared tasks to adapt them.');
      onApplied();
    } catch (failure) {
      if (failure.status === 401) onExpired();
      else {
        setError(failure.message);
        setRevision((value) => value + 1);
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="team-panel" aria-labelledby="workflow-heading">
      <h2 id="workflow-heading">Give this project a useful starting point</h2>
      <p className="small muted">
        Preview a small reusable workflow. Applying adds new tasks, with editable
        checklists and estimates. It does not replace existing work, set dates or invite
        anyone.
      </p>
      <button
        className="secondary"
        disabled={busy || loading}
        onClick={() => setRevision((value) => value + 1)}
      >
        Refresh workflow
      </button>
      {loading ? (
        <p role="status">Loading workflow…</p>
      ) : (
        setup && (
          <>
            {setup.templateId && (
              <p role="status">
                {setup.ready
                  ? 'Project template applied.'
                  : 'Template setup is unfinished. The owner can retry safely.'}
              </p>
            )}
            <label>
              Project template
              <select
                aria-label="Project template"
                value={templateId}
                disabled={busy || Boolean(setup.templateId)}
                onChange={(event) => setTemplateId(event.target.value)}
              >
                {projectTemplates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {template && (
              <div className="template-preview">
                <h3>{template.name}</h3>
                <p>{template.description}</p>
                <ol>
                  {template.tasks.map((task) => (
                    <li key={task.title}>
                      <strong>{task.title}</strong>
                      <p className="small">
                        {task.description} · {task.estimateMinutes} min estimate
                      </p>
                      <ul>
                        {task.steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {project.role === 'owner' && !setup.ready && (
              <button className="button" disabled={busy} onClick={apply}>
                {busy
                  ? 'Preparing tasks…'
                  : setup.templateId
                    ? 'Retry template setup'
                    : 'Apply project template'}
              </button>
            )}
            {project.role !== 'owner' && (
              <p className="small muted">Only the owner can apply a project template.</p>
            )}
          </>
        )
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <p role="status">{notice}</p>
    </section>
  );
}
