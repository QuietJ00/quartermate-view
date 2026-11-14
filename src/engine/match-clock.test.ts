import { createDemoState } from "../demo-data.ts";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatClock, formatMatchTime, getElapsedSeconds } from "./match-clock.ts";

describe("persistent count-up match clock", () => {
  it("starts at zero and reconstructs elapsed time from a shared server timestamp", () => {
    const match = createDemoState().match;
    match.clocks = { 1: { elapsedSeconds: 0, startedAt: "2026-10-15T00:00:00.000Z" } };
    const start = Date.parse(match.clocks[1].startedAt!);
    assert.equal(getElapsedSeconds(match, 1, start), 0);
    assert.equal(getElapsedSeconds(match, 1, start + 123_950), 123);
    assert.equal(getElapsedSeconds(structuredClone(match), 1, start + 123_950), 123);
    assert.equal(getElapsedSeconds(match, 2, start + 123_950), 0);
  });

  it("stays fixed while paused and resumes without resetting accumulated seconds", () => {
    const match = createDemoState().match;
    match.clocks = { 1: { elapsedSeconds: 1482, startedAt: null }, 2: { elapsedSeconds: 35, startedAt: "2026-10-15T01:00:00.000Z" } };
    assert.equal(getElapsedSeconds(match, 1, Date.parse("2026-10-15T10:00:00.000Z")), 1482);
    assert.equal(getElapsedSeconds(match, 2, Date.parse("2026-10-15T01:01:00.000Z")), 95);
    assert.equal(getElapsedSeconds(match, 2, Date.parse("2026-10-15T00:59:59.000Z")), 35);
  });

  it("counts beyond regular time and labels added time without auto ending", () => {
    assert.equal(formatClock(0, 25), "00:00");
    assert.equal(formatClock(1499, 25), "24:59");
    assert.equal(formatClock(1500, 25), "25:00");
    assert.equal(formatClock(1623, 25), "25:00 +02:03");
    assert.equal(formatMatchTime(1, 1620, 25), "1Q 25+2분");
    assert.equal(formatMatchTime(1, 1623, 25), "1Q 25+2분 3초");
    assert.equal(formatMatchTime(2, 63, 20), "2Q 1분 3초");
    assert.equal(formatMatchTime(2, 0, 20), "2Q 0분");
    assert.equal(formatMatchTime(3, undefined, 20), "3Q · 시간 미기록");
    assert.equal(formatMatchTime(3, null, 20), "3Q · 시간 미기록");
  });
});
