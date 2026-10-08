export const initialTimer = () => ({
  phase: 'focus',
  duration: 25 * 60,
  remaining: 25 * 60,
  deadline: null,
});
export function remainingSeconds(timer, now = Date.now()) {
  return timer.deadline === null
    ? timer.remaining
    : Math.max(0, Math.ceil((timer.deadline - now) / 1000));
}
export function validTimer(timer) {
  return (
    timer &&
    ['focus', 'break'].includes(timer.phase) &&
    Number.isInteger(timer.duration) &&
    timer.duration >= 60 &&
    timer.duration <= 120 * 60 &&
    Number.isInteger(timer.remaining) &&
    timer.remaining >= 0 &&
    timer.remaining <= timer.duration &&
    (timer.deadline === null ||
      (Number.isFinite(timer.deadline) &&
        timer.deadline > 0 &&
        timer.deadline <= Date.now() + 121 * 60 * 1000))
  );
}
