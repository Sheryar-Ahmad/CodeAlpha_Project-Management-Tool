// Progress supports increasing and decreasing targets and never predicts delivery.
export function resultProgress(result) {
  if (result.target === result.baseline)
    return result.current === result.target ? 100 : 0;
  return Math.round(
    Math.max(
      0,
      Math.min(
        100,
        ((result.current - result.baseline) / (result.target - result.baseline)) * 100,
      ),
    ),
  );
}
export function goalProgress(results) {
  return results.length
    ? Math.round(
        results.reduce((sum, result) => sum + resultProgress(result), 0) / results.length,
      )
    : 0;
}
