export async function request(path, options = {}) {
  const response = await fetch('/api' + path, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (response.status === 204) return null;
  const data = await response
    .json()
    .catch(() => ({ message: 'The server returned an unexpected response.' }));
  if (!response.ok) {
    const error = new Error(
      data.details?.[0]?.message || data.message || 'Request failed.',
    );
    error.status = response.status;
    throw error;
  }
  return data;
}
export const today = () => {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
};
