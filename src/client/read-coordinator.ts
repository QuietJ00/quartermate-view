type ReadOptions = { force?: boolean; dedupeMs?: number; timeoutMs?: number };
type ReadTask = (isCurrent: () => boolean, signal: AbortSignal) => Promise<boolean | void>;
// A poll tick that coincides with the GET time limit (15 s cadence) must not join
// a request that is about to be aborted, or the retry slips a whole interval.
const EXPIRING_MS = 1_000;

/** Component-scoped reads only. Never caches response data or shares across users. */
export function createReadCoordinator(now: () => number = () => Date.now()) {
  let generation = 0;
  let pending: { key: string; promise: Promise<void>; cancel: () => void; expiresAt: number } | null = null;
  let completed: { key: string; at: number } | null = null;

  return {
    run(key: string, task: ReadTask, { force = false, dedupeMs = 0, timeoutMs = 15_000 }: ReadOptions = {}): Promise<void> {
      if (!force && pending?.key === key && pending.expiresAt - now() > EXPIRING_MS) return pending.promise;
      // A short completed-event window also merges focus and visibilitychange
      // when the first request finishes before the second event is dispatched.
      if (!force && !pending && completed?.key === key && now() - completed.at >= 0 && now() - completed.at < dedupeMs) return Promise.resolve();
      const current = ++generation;
      pending?.cancel();
      const isCurrent = () => current === generation;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const cancel = () => { clearTimeout(timeout); controller.abort(); };
      completed = null;
      const promise = Promise.resolve().then(() => isCurrent() ? task(isCurrent, controller.signal) : false).then(success => {
        if (isCurrent() && success !== false) completed = { key, at: now() };
      }).finally(() => {
        // Promise.all may reject while a sibling fetch is still pending.
        cancel();
        if (isCurrent()) pending = null;
      });
      pending = { key, promise, cancel, expiresAt: now() + timeoutMs };
      return promise;
    },
    invalidate() {
      generation++;
      pending?.cancel();
      pending = null;
      completed = null;
    },
  };
}
