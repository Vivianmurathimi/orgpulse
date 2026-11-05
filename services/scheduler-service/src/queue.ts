// Only one scheduler job runs at a time, so the timer and the button can't
// work on the same rotation at once. Jobs wait their turn.
let last: Promise<unknown> = Promise.resolve();

export function runInTurn<T>(job: () => Promise<T>): Promise<T> {
  const result = last.then(job, job);
  last = result.catch(() => undefined); // one failed job must not block the next
  return result;
}
