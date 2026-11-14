import { canPlaySlot, getQuarterFormation, isPlayerAvailable, type Match, type Player, type Position } from "./football.ts";
import { getElapsedSeconds } from "./match-clock.ts";

export type MatchSide = "A" | "B";

export interface SubstitutionSelection {
  id: string;
  quarter: number;
  side: MatchSide;
  outPlayerId: string;
  inPlayerId: string;
  allowPositionOverride?: boolean;
}

export interface PlayingInterval {
  playerId: string;
  side: MatchSide;
  slotIndex: number;
  position: Position;
  fromSeconds: number;
  toSeconds: number;
}

function kickoffLineup(match: Match, quarter: number, side: MatchSide): string[] {
  if (side === "B") return match.kind === "internal" ? match.internal?.actualLineupsB[quarter] ?? match.internal?.lineupsB[quarter] ?? [] : [];
  return match.actualLineups[quarter] ?? match.lineups[quarter] ?? [];
}

function quarterSubstitutions(match: Match, quarter: number, side: MatchSide) {
  // Stable sort retains the server's ordering for two changes in the same second.
  return (match.substitutions || []).filter((entry) => entry.quarter === quarter && entry.side === side).sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);
}

export function getCurrentQuarterLineup(match: Match, quarter: number, side: MatchSide = "A", atSeconds = Infinity): string[] {
  const lineup = [...kickoffLineup(match, quarter, side)];
  for (const entry of quarterSubstitutions(match, quarter, side)) {
    if (entry.elapsedSeconds <= atSeconds && lineup[entry.slotIndex] === entry.outPlayerId && !lineup.includes(entry.inPlayerId)) lineup[entry.slotIndex] = entry.inPlayerId;
  }
  return lineup;
}

export function getQuarterAppearingPlayerIds(match: Match, quarter: number, side: MatchSide = "A"): string[] {
  return [...new Set([...kickoffLineup(match, quarter, side), ...quarterSubstitutions(match, quarter, side).flatMap((entry) => [entry.outPlayerId, entry.inPlayerId])].filter(Boolean))];
}

/** Completed quarters use saved elapsed time. Legacy results retain configured minutes. */
export function getQuarterPlayingIntervals(match: Match, quarter: number, side: MatchSide = "A", endSeconds?: number): PlayingInterval[] {
  const duration = Math.max(0, endSeconds ?? (match.clocks?.[quarter] ? getElapsedSeconds(match, quarter) : match.minutes * 60));
  const lineup = [...kickoffLineup(match, quarter, side)];
  const formation = getQuarterFormation(match, quarter, side, true);
  const positionSnapshot = side === "B" ? match.internal?.actualPositionsB?.[quarter] : match.actualPositions?.[quarter];
  const starts = lineup.map(() => 0);
  const positions = lineup.map((id, index) => positionSnapshot?.[id] ?? formation.positions[index]?.position ?? "MF" as Position);
  const intervals: PlayingInterval[] = [];
  const finish = (index: number, toSeconds: number) => {
    if (lineup[index]) intervals.push({ playerId: lineup[index], side, slotIndex: index, position: positions[index], fromSeconds: starts[index], toSeconds });
  };
  for (const entry of quarterSubstitutions(match, quarter, side)) {
    if (entry.elapsedSeconds > duration || lineup[entry.slotIndex] !== entry.outPlayerId || lineup.includes(entry.inPlayerId)) continue;
    finish(entry.slotIndex, entry.elapsedSeconds);
    lineup[entry.slotIndex] = entry.inPlayerId;
    starts[entry.slotIndex] = entry.elapsedSeconds;
    positions[entry.slotIndex] = entry.position;
  }
  lineup.forEach((_id, index) => finish(index, duration));
  return intervals;
}

/** Both sides of a same-second change are eligible at that second, since clocks store whole seconds. */
export function getQuarterPlayerIdsAtTime(match: Match, quarter: number, side: MatchSide, seconds?: number | null): string[] {
  if (seconds == null) return getQuarterAppearingPlayerIds(match, quarter, side);
  const end = Math.max(seconds, ...quarterSubstitutions(match, quarter, side).map((entry) => entry.elapsedSeconds), match.clocks?.[quarter] ? getElapsedSeconds(match, quarter) : match.minutes * 60);
  return [...new Set(getQuarterPlayingIntervals(match, quarter, side, end).filter((interval) => interval.fromSeconds <= seconds && interval.toSeconds >= seconds).map((interval) => interval.playerId))];
}

/** Goal and assist must share a time interval, including unknown-time old records. */
export function canPlayersRecordTogether(match: Match, quarter: number, side: MatchSide, scorerId: string, assistId: string | null, seconds?: number | null): boolean {
  if (scorerId === assistId) return false;
  if (seconds != null) {
    const ids = getQuarterPlayerIdsAtTime(match, quarter, side, seconds);
    return ids.includes(scorerId) && (assistId === null || ids.includes(assistId));
  }
  const intervals = getQuarterPlayingIntervals(match, quarter, side);
  const scorer = intervals.filter((interval) => interval.playerId === scorerId);
  return scorer.length > 0 && (assistId === null || scorer.some((goal) => intervals.some((assist) => assist.playerId === assistId && Math.max(goal.fromSeconds, assist.fromSeconds) <= Math.min(goal.toSeconds, assist.toSeconds))));
}

export function canManuallySubstitute(player: Player, position: Position): boolean {
  // Goalkeepers are never offered an outfield slot. A registered backup keeper may keep goal.
  return position === "GK" ? canPlaySlot(player, "GK") : player.position !== "GK";
}

/** Validate chains independently of the current permanent roster's later profile edits. */
export function validateSubstitutionHistory(match: Match, roster: Player[]): string | null {
  const entries = match.substitutions || [];
  if (entries.length > 500 || new Set(entries.map((entry) => entry.id)).size !== entries.length) return "교체 기록의 개수 또는 중복된 번호를 확인해 주세요.";
  const known = new Set([...roster, ...(match.playerSnapshots || []), ...(match.guests || [])].map((player) => player.id));
  const times = new Map<string, number>();
  const lineups = new Map<string, string[]>();
  for (const entry of entries) {
    const key = `${entry.quarter}:${entry.side}`;
    const formation = getQuarterFormation(match, entry.quarter, entry.side, true);
    const lineup = lineups.get(key) ?? [...kickoffLineup(match, entry.quarter, entry.side)];
    const clock = match.clocks?.[entry.quarter];
    if (entry.quarter < 1 || entry.quarter > match.quarters || entry.side === "B" && match.kind !== "internal" || !clock || !Number.isInteger(entry.elapsedSeconds) || entry.elapsedSeconds < (times.get(key) ?? 0) || entry.elapsedSeconds > getElapsedSeconds(match, entry.quarter) || entry.elapsedSeconds > 86400) return "교체 기록의 쿼터와 경기 시간을 확인해 주세요.";
    if (!Number.isInteger(entry.slotIndex) || entry.slotIndex < 0 || entry.slotIndex >= formation.players || lineup[entry.slotIndex] !== entry.outPlayerId || lineup.includes(entry.inPlayerId) || entry.outPlayerId === entry.inPlayerId) return "교체 전후의 출전 명단이 맞지 않습니다. 해당 쿼터의 교체 기록을 확인해 주세요.";
    // The outgoing player already owns this slot, possibly via a manual pregame choice.
    if (!known.has(entry.outPlayerId) || !known.has(entry.inPlayerId) || entry.outPlayer.id !== entry.outPlayerId || entry.inPlayer.id !== entry.inPlayerId || formation.positions[entry.slotIndex].position !== entry.position || !canManuallySubstitute(entry.inPlayer, entry.position)) return "교체 선수와 포지션 정보를 확인해 주세요.";
    if (match.kind === "internal" && (match.internal?.playerTeams[entry.outPlayerId] !== entry.side || match.internal?.playerTeams[entry.inPlayerId] !== entry.side)) return "교체는 같은 팀의 선수끼리 진행해 주세요.";
    // Saved profiles prove eligibility at the time of substitution even if attendance is later edited.
    if (!isPlayerAvailable(entry.inPlayer, entry.quarter) || !canPlaySlot(entry.inPlayer, entry.position) && !entry.allowPositionOverride) return "교체 선수의 참가 범위 또는 포지션을 확인해 주세요.";
    lineup[entry.slotIndex] = entry.inPlayerId;
    times.set(key, entry.elapsedSeconds);
    lineups.set(key, lineup);
  }
  return null;
}
