import { useEffect, useRef } from 'react';

const openers = new WeakMap();

// Capture the opener before React autofocus runs. Keep it through Strict Mode's replay.
export default function useModal(ref) {
  const active = document.activeElement;
  const parent = active?.closest('dialog');
  // A command or notebook can hand off to another dialog without losing its opener.
  const opener = useRef((parent && openers.get(parent)) || active);
  useEffect(() => {
    const dialog = ref.current;
    openers.set(dialog, opener.current);
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      openers.delete(dialog);
      if (opener.current?.isConnected) opener.current.focus();
    };
  }, [ref]);
}
