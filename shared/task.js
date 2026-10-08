export const taskStatuses = {
  todo: 'To do',
  progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

// Shared validation keeps account requests and browser-only demo data consistent.
export function validResourceUrl(value) {
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
