import type { Match } from "./football";

/** A server timestamp keeps the same count-up clock after refresh or on another device. */
export function getElapsedSeconds(match: Match, quarter: number, now = Date.now()): number {
  const clock = match.clocks?.[quarter];
  if (!clock) return 0;
  const saved = Number.isFinite(clock.elapsedSeconds) ? Math.max(0, Math.floor(clock.elapsedSeconds)) : 0;
  const started = clock.startedAt ? Date.parse(clock.startedAt) : NaN;
  const running = Number.isFinite(started) && Number.isFinite(now) ? Math.max(0, Math.floor((now - started) / 1000)) : 0;
  return Math.min(86_400, saved + running);
}

const minuteClock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

export function formatClock(seconds: number, regularMinutes: number): string {
  const elapsed = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const regular = Math.max(0, Math.floor(regularMinutes * 60));
  return elapsed > regular ? `${minuteClock(regular)} +${minuteClock(elapsed - regular)}` : minuteClock(elapsed);
}

/** Old records with no timestamp stay unknown rather than acquiring an invented 00:00. */
export function formatMatchTime(quarter: number, seconds: number | null | undefined, regularMinutes: number): string {
  if (seconds == null || !Number.isFinite(seconds)) return `${quarter}Q · 시간 미기록`;
  const elapsed = Math.max(0, Math.floor(seconds));
  const regular = Math.max(0, Math.floor(regularMinutes * 60));
  const rest = elapsed > regular ? elapsed - regular : elapsed;
  const minutes = Math.floor(rest / 60);
  const remainder = rest % 60;
  return `${quarter}Q ${elapsed > regular ? `${Math.floor(regular / 60)}+` : ""}${minutes}분${remainder ? ` ${remainder}초` : ""}`;
}

export type ClockAction = "start" | "pause" | "resume" | "finish";
