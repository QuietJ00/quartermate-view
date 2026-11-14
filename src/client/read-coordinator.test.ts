import test from "node:test";
import assert from "node:assert/strict";
import { createReadCoordinator } from "./read-coordinator.ts";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test("same-resource background events share an in-flight request and a short completion window", async () => {
  let time = 0, calls = 0;
  const reads = createReadCoordinator(() => time), wait = deferred();
  const task = async () => { calls++; await wait.promise; };
  const first = reads.run("team-a", task);
  assert.equal(reads.run("team-a", task), first);
  await Promise.resolve(); assert.equal(calls, 1);
  wait.resolve(); await first;
  time = 249; await reads.run("team-a", task, { dedupeMs: 250 }); assert.equal(calls, 1);
  time = 250; await reads.run("team-a", task, { dedupeMs: 250 }); assert.equal(calls, 2);
});

test("a post-mutation forced read starts fresh and invalidates the older response", async () => {
  const reads = createReadCoordinator(), wait = deferred(), applied: string[] = [];
  const old = reads.run("team", async current => { await wait.promise; if (current()) applied.push("old"); });
  await Promise.resolve();
  await reads.run("team", async current => { if (current()) applied.push("new"); }, { force: true });
  wait.resolve(); await old;
  assert.deepEqual(applied, ["new"]);
});

test("team changes and mutation invalidation prevent stale results from becoming current again", async () => {
  const reads = createReadCoordinator(), wait = deferred();
  let oldIsCurrent = true;
  const old = reads.run("team-a", async current => { await wait.promise; oldIsCurrent = current(); });
  await Promise.resolve(); await reads.run("team-b", async () => {});
  await reads.run("team-a", async () => {}); wait.resolve(); await old;
  assert.equal(oldIsCurrent, false);
  let valid = () => true;
  await reads.run("account", async current => { valid = current; });
  reads.invalidate(); assert.equal(valid(), false);
});

test("failed or discarded reads do not suppress retries", async () => {
  const reads = createReadCoordinator(); let calls = 0;
  await assert.rejects(reads.run("team", async () => { calls++; throw new Error("offline"); }));
  await reads.run("team", async () => { calls++; return false; }, { dedupeMs: 250 });
  await reads.run("team", async () => { calls++; }, { dedupeMs: 250 });
  assert.equal(calls, 3);
});

test("hung fetches are aborted so later refreshes can recover", async () => {
  const reads = createReadCoordinator();
  await assert.rejects(reads.run("team", async (_current, signal) => {
    await new Promise<void>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  }, { timeoutMs: 1 }), { name: "AbortError" });
  let recovered = false;
  await reads.run("team", async () => { recovered = true; });
  assert.equal(recovered, true);
});

test("a backwards wall clock does not suppress future refreshes", async () => {
  let time = 1000, calls = 0;
  const reads = createReadCoordinator(() => time);
  await reads.run("team", async () => { calls++; });
  time = 0;
  await reads.run("team", async () => { calls++; }, { dedupeMs: 250 });
  assert.equal(calls, 2);
});

test("a failed parallel read aborts its unfinished sibling", async () => {
  const reads = createReadCoordinator(); let signal: AbortSignal | undefined;
  await assert.rejects(reads.run("account-and-teams", async (_current, sharedSignal) => {
    signal = sharedSignal;
    await Promise.all([
      Promise.reject(new Error("account unavailable")),
      new Promise<void>((_resolve, reject) => sharedSignal.addEventListener("abort", () => reject(sharedSignal.reason), { once: true })),
    ]);
  }));
  assert.equal(signal?.aborted, true);
});

test("a poll tick at the time limit starts a fresh read instead of joining the expiring one", async () => {
  let time = 0, calls = 0;
  const reads = createReadCoordinator(() => time), wait = deferred();
  let firstCurrent = () => true;
  const first = reads.run("team", async current => { calls++; firstCurrent = current; await wait.promise; }, { timeoutMs: 15_000 });
  await Promise.resolve();
  time = 5_000; assert.equal(reads.run("team", async () => { calls++; }), first);
  time = 14_999; const retry = reads.run("team", async () => { calls++; });
  assert.notEqual(retry, first);
  await retry; wait.resolve(); await first;
  assert.equal(calls, 2);
  assert.equal(firstCurrent(), false);
});
