import useModal from '../hooks/useModal.js';
import { useRef, useState } from 'react';
import { Search, ArrowRight, X } from 'lucide-react';
import { commandItems } from '../../shared/commands.js';

export default function CommandBar({ views, projects, onChoose, onClose }) {
  const ref = useRef(null);
  const [query, setQuery] = useState('');
  const items = commandItems(query, views, projects);
  useModal(ref);
  return (
    <dialog
      ref={ref}
      className="command-dialog"
      aria-labelledby="command-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (items[0]) onChoose(items[0]);
        }}
      >
        <div className="dialog-heading">
          <h2 id="command-title">Find your next step</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close workspace search"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <label className="command-input">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Search workspace commands</span>
          <input
            autoFocus
            type="search"
            maxLength={120}
            value={query}
            placeholder="Find a view, project, or task…"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <p className="small muted">
          Enter opens the first result. Tab moves through the choices. Escape closes.
        </p>
        <ul className="command-results" aria-label="Workspace commands">
          {items.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => onChoose(item)}>
                <span>{item.label}</span>
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <p className="small muted" role="status">
          {items.length} choices
        </p>
      </form>
    </dialog>
  );
}
