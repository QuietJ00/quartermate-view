import { assignFormationPlayers, generateLineups, getFormation, getQuarterFormation, getQuarterFormationId, getPlayerMinutes, inspectLineups, isPlayerAvailable, positionGroup, type Match, type Player, type TeamState } from "./football.ts";
import { getMatchPlayers, initializeMatchParticipants, normalizeTeamParticipants, snapshotMatchPlayers } from "./match-participants.ts";

type Side = "A" | "B";
const sides: Side[] = ["A", "B"];
const uniquePlayers = (players: Player[]) => [...new Map(players.map((player) => [player.id, player])).values()];
const canKeep = (player: Player) => player.position === "GK" || player.secondaryPosition === "GK";
const sideName = (match: Match, side: Side) => side === "A" ? match.internal?.teamAName || "A팀" : match.internal?.teamBName || "B팀";

/** Old live fixtures have no clock yet, but their current lineup is already locked. */
export function isQuarterLocked(match: Match, quarter: number): boolean {
  return match.status === "finished" || match.completedQuarters.includes(quarter) || Boolean(match.clocks?.[quarter]) || match.actualLineups[quarter] !== undefined || match.internal?.actualLineupsB[quarter] !== undefined || (match.status === "live" && !Object.keys(match.clocks || {}).length && match.currentQuarter === quarter);
}

/** Stable, balanced teams include absent players so their future membership is explicit. */
export function splitInternalTeams(inputPlayers: Player[]): Record<string, Side> {
  const players = uniquePlayers(inputPlayers);
  const order = { GK: 0, DF: 1, MF: 2, FW: 3 };
  const sorted = [...players].sort((a, b) => Number(b.attending) - Number(a.attending) || Number(canKeep(b)) - Number(canKeep(a)) || order[positionGroup(a.position)] - order[positionGroup(b.position)] || a.number - b.number || a.id.localeCompare(b.id));
  const assigned: Record<string, Side> = {};
  const rosters: Record<Side, Player[]> = { A: [], B: [] };
  for (const player of sorted) {
    const compare = (a: Side, b: Side) => {
      const rosterA = rosters[a], rosterB = rosters[b];
      return (canKeep(player) ? rosterA.filter(canKeep).length - rosterB.filter(canKeep).length : 0)
        || rosterA.filter((person) => person.position === player.position).length - rosterB.filter((person) => person.position === player.position).length
        || rosterA.length - rosterB.length
        || rosterA.reduce((sum, person) => sum + (person.attending ? person.availableUntil - person.availableFrom + 1 : 0), 0) - rosterB.reduce((sum, person) => sum + (person.attending ? person.availableUntil - person.availableFrom + 1 : 0), 0);
    };
    const side: Side = compare("A", "B") <= 0 ? "A" : "B";
    assigned[player.id] = side;
    rosters[side].push(player);
  }
  return assigned;
}

export function getMatchSide(match: Match, playerId: string): Side | undefined {
  return match.kind === "internal" ? match.internal?.playerTeams[playerId] : "A";
}

/** Slot order and empty slots are preserved for pitch rendering and position snapshots. */
export function getQuarterLineup(match: Match, quarter: number, side: Side, actual = false): string[] {
  if (side === "A") return (actual ? match.actualLineups : match.lineups)[quarter] ?? [];
  if (match.kind !== "internal") return [];
  return (actual ? match.internal?.actualLineupsB : match.internal?.lineupsB)?.[quarter] ?? [];
}

/** Manual choices honor attendance and teams, independently of saved positions. */
export function getManualLineupPlayers(roster: Player[], match: Match, quarter: number, side: Side = "A"): Player[] {
  return getMatchPlayers(roster, match).filter((player) => isPlayerAvailable(player, quarter) && (match.kind !== "internal" || getMatchSide(match, player.id) === side));
}

export function setManualLineupPlayer(roster: Player[], match: Match, quarter: number, side: Side, slotIndex: number, playerId: string): Match {
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > match.quarters || isQuarterLocked(match, quarter)) throw new Error("시작 전 쿼터에서 선수를 변경해 주세요.");
  if (side === "B" && (match.kind !== "internal" || !match.internal)) throw new Error("자체전에서만 B팀을 변경할 수 있습니다.");
  const formation = getQuarterFormation(match, quarter, side);
  if (!Number.isInteger(slotIndex) || !formation.positions[slotIndex]) throw new Error("변경할 자리를 확인해 주세요.");
  if (!getManualLineupPlayers(roster, match, quarter, side).some((player) => player.id === playerId)) throw new Error("이 쿼터에 참가할 수 있는 선수를 선택해 주세요.");
  const saved = getQuarterLineup(match, quarter, side);
  const slots = Array.from({ length: formation.players }, (_, index) => saved[index] || "");
  const displaced = slots[slotIndex], other = slots.indexOf(playerId);
  slots[slotIndex] = playerId;
  if (other >= 0 && other !== slotIndex) slots[other] = displaced;
  const previousPins=side==="A"?match.manualLineups:match.internal?.manualLineupsB;
  const pins={...previousPins,[quarter]:{...previousPins?.[quarter],[slotIndex]:playerId,...(other>=0&&other!==slotIndex?{[other]:displaced}: {})}};
  // An empty displaced slot does not pin an intentional vacancy.
  pins[quarter]=Object.fromEntries(Object.entries(pins[quarter]).filter(([,id])=>Boolean(id)));
  return side === "A"
    ? { ...match, manualLineups:pins, lineups: { ...match.lineups, [quarter]: slots } }
    : { ...match, internal: { ...match.internal!, manualLineupsB:pins, lineupsB: { ...match.internal!.lineupsB, [quarter]: slots } } };
}

/** Release a future manual placement without changing its current lineup. */
export function releaseManualLineupSlot(match:Match,quarter:number,side:Side,index:number):Match {
  if(isQuarterLocked(match,quarter))throw new Error("시작 전 쿼터에서 수동 고정을 해제해 주세요.");
  const source=side==="A"?match.manualLineups:match.internal?.manualLineupsB;
  const pins={...source,[quarter]:{...source?.[quarter]}};delete pins[quarter][index];
  return side==="A"?{...match,manualLineups:pins}:{...match,internal:{...match.internal!,manualLineupsB:pins}};
}

/** An internal goal belongs to the scorer's side; it is never counted for both teams. */
export function getMatchScore(match: Match, side: Side, quarter?: number): number {
  if (match.kind === "internal") return match.events.filter((event) => (quarter === undefined || event.quarter === quarter) && getMatchSide(match, event.scorerId) === side).length;
  if (side === "A") return match.events.filter((event) => quarter === undefined || event.quarter === quarter).length;
  return quarter === undefined ? Object.values(match.opponentGoals).reduce((sum, goals) => sum + goals, 0) : match.opponentGoals[quarter] || 0;
}

function asSideMatch(match: Match, side: Side): Match {
  return { ...match, kind: "friendly", internal: undefined, manualLineups: side === "A" ? match.manualLineups : match.internal?.manualLineupsB, formation: side === "A" ? match.formation : match.internal?.formationB || match.formation, formations: side === "A" ? match.formations : match.internal?.formationsB, lineups: side === "A" ? match.lineups : match.internal?.lineupsB || {}, actualLineups: side === "A" ? match.actualLineups : match.internal?.actualLineupsB || {}, actualFormations: side === "A" ? match.actualFormations : match.internal?.actualFormationsB };
}

export function inspectMatch(inputPlayers: Player[], match: Match): string[] {
  inputPlayers = getMatchPlayers(inputPlayers, match);
  if (match.kind !== "internal") return inspectLineups(inputPlayers, match);
  if (!match.internal) return ["자체전의 A팀과 B팀을 먼저 구성해 주세요."];
  const warnings: string[] = [];
  const players = uniquePlayers(inputPlayers);
  if (players.length !== inputPlayers.length) warnings.push("선수 ID가 중복되어 있습니다. 중복된 선수는 한 명으로 계산합니다.");
  const unassigned = players.filter((player) => !getMatchSide(match, player.id));
  if (unassigned.length) warnings.push(`${unassigned.map((player) => player.name).join(", ")}: 자체전 팀이 지정되지 않았습니다.`);
  if (getFormation(match.formation).players !== getFormation(match.internal.formationB).players) warnings.push("자체전 A팀과 B팀의 포메이션 인원수가 다릅니다. 같은 인원수로 선택해 주세요.");
  for (const side of sides) {
    const roster = inputPlayers.filter((player) => getMatchSide(match, player.id) === side);
    warnings.push(...inspectLineups(roster, asSideMatch(match, side)).map((warning) => `${sideName(match, side)}: ${warning}`));
  }
  for (let quarter = 1; quarter <= match.quarters; quarter++) {
    if (getQuarterFormation(match, quarter, "A").players !== getQuarterFormation(match, quarter, "B").players) warnings.push(`${quarter}Q 자체전 A팀과 B팀의 포메이션 인원수가 다릅니다.`);
    const teamB = new Set(getQuarterLineup(match, quarter, "B"));
    if (getQuarterLineup(match, quarter, "A").some((id) => id && teamB.has(id))) warnings.push(`${quarter}Q에 양 팀으로 중복 배치된 선수가 있습니다.`);
    const actualB = new Set(getQuarterLineup(match, quarter, "B", true));
    if (getQuarterLineup(match, quarter, "A", true).some((id) => id && actualB.has(id))) warnings.push(`${quarter}Q 실제 출전 기록에 양 팀으로 중복된 선수가 있습니다.`);
  }
  return [...new Set(warnings)];
}

export function planMatch(players: Player[], inputMatch: Match): { match: Match; warnings: string[] } {
  players = getMatchPlayers(players, inputMatch);
  if (inputMatch.kind !== "internal") {
    const plan = generateLineups(players, inputMatch);
    return { match: { ...inputMatch, lineups: plan.lineups }, warnings: plan.warnings };
  }
  let internal = inputMatch.internal ?? { teamAName: "A팀", teamBName: "B팀", formationB: inputMatch.formation, playerTeams: splitInternalTeams(players), lineupsB: {}, actualLineupsB: {}, actualPositionsB: {}, actualFormationsB: {} };
  const playerTeams = { ...internal.playerTeams };
  const missing = players.filter((player) => !playerTeams[player.id]).sort((a, b) => Number(b.attending) - Number(a.attending) || Number(canKeep(b)) - Number(canKeep(a)) || a.number - b.number);
  for (const player of missing) {
    const a = players.filter((person) => playerTeams[person.id] === "A");
    const b = players.filter((person) => playerTeams[person.id] === "B");
    const difference = (canKeep(player) ? a.filter((person) => person.attending && canKeep(person)).length - b.filter((person) => person.attending && canKeep(person)).length : 0)
      || a.filter((person) => person.attending && person.position === player.position).length - b.filter((person) => person.attending && person.position === player.position).length
      || (player.attending ? a.filter((person) => person.attending).length - b.filter((person) => person.attending).length : 0)
      || a.length - b.length;
    playerTeams[player.id] = difference <= 0 ? "A" : "B";
  }
  internal = { ...internal, playerTeams };
  let match: Match = { ...inputMatch, internal };
  const a = generateLineups(players.filter((player) => internal.playerTeams[player.id] === "A"), asSideMatch(match, "A"));
  const b = generateLineups(players.filter((player) => internal.playerTeams[player.id] === "B"), asSideMatch(match, "B"));
  match = { ...match, lineups: a.lineups, internal: { ...internal, lineupsB: b.lineups } };
  const warnings = [...a.warnings.map((warning) => `${sideName(match, "A")}: ${warning}`), ...b.warnings.map((warning) => `${sideName(match, "B")}: ${warning}`), ...inspectMatch(players, match)];
  return { match, warnings: [...new Set(warnings)] };
}

/** Switch fixtures without discarding the current schedule or any played result. */
export function activateScheduledMatch(state: TeamState, id: string): TeamState {
  state = normalizeTeamParticipants(state);
  if (state.match.status === "live") throw new Error("진행 중인 경기를 먼저 종료해 주세요. 경기 기록을 보존하기 위해 다른 경기로 전환할 수 없습니다.");
  const upcoming = state.scheduledMatches || [];
  const target = upcoming.find((match) => match.id === id);
  if (!target || target.status !== "scheduled") throw new Error("전환할 예정 경기를 찾을 수 없습니다.");
  const history = (state.history || []).filter((match) => match.id !== state.match.id);
  const queued = upcoming.filter((match) => match.id !== id && match.id !== state.match.id);
  // Played profiles are already frozen. Rebuilding them while switching fixtures
  // can apply newer attendance values and make an unchanged result look edited.
  const archived = structuredClone(state.match.playerSnapshots ? state.match : snapshotMatchPlayers(state.players, state.match));
  if (!state.match.isPlaceholder) {
    if (state.match.status === "finished") history.push(archived);
    else queued.push(archived);
  }
  const players = state.players;
  // A fixture owns its participant choices, including its temporary guests.
  const cleanTarget = structuredClone(initializeMatchParticipants(players, target));
  if (cleanTarget.internal) {
    const matchPlayers = getMatchPlayers(players, cleanTarget);
    const rosterIds = new Set(matchPlayers.map((player) => player.id));
    const existing = cleanTarget.internal.playerTeams;
    const automatic = splitInternalTeams(matchPlayers);
    cleanTarget.internal.playerTeams = Object.fromEntries(matchPlayers.map((player) => [player.id, existing[player.id] || automatic[player.id]]));
    cleanTarget.internal.lineupsB = Object.fromEntries(Object.entries(cleanTarget.internal.lineupsB).map(([quarter, ids]) => [quarter, ids.map((playerId) => rosterIds.has(playerId) ? playerId : "")]));
  }
  const planned = planMatch(players, cleanTarget).match;
  const matchPlayers = getMatchPlayers(players, planned);
  const validSavedLineup = (quarter: number, side: Side): boolean => {
    const saved = side === "A" ? cleanTarget.lineups[quarter] : cleanTarget.internal?.lineupsB[quarter];
    const formation = getQuarterFormation(planned, quarter, side);
    if (!saved || saved.length > formation.players) return false;
    const available = matchPlayers.filter((player) => isPlayerAvailable(player, quarter) && (planned.kind !== "internal" || getMatchSide(planned, player.id) === side));
    const byId = new Map(available.map((player) => [player.id, player]));
    const ids = saved.filter(Boolean);
    if (new Set(ids).size !== ids.length || ids.some((id) => !byId.has(id))) return false;
    // A manual plan may fill more slots than position-based automatic allocation.
    return ids.length >= assignFormationPlayers(available, formation.id).filter(Boolean).length;
  };
  for (let quarter = 1; quarter <= planned.quarters; quarter++) {
    if (validSavedLineup(quarter, "A")) planned.lineups[quarter] = cleanTarget.lineups[quarter];
    if (planned.internal && validSavedLineup(quarter, "B")) planned.internal.lineupsB[quarter] = cleanTarget.internal!.lineupsB[quarter];
  }
  return { ...state, players, match: planned, history, scheduledMatches: queued };
}

function resizeAvailability(player: Player, oldCount: number, count: number): Player {
  if (player.availableFrom > count) return { ...player, attending: false };
  return { ...player, availableUntil: player.availableUntil === oldCount ? count : Math.min(player.availableUntil, count) };
}

/** A newly added live quarter honors the rest boundary with the preserved plan. */
function addedQuarterLineup(players: Player[], match: Match, quarter: number, side: Side, preserveNextBoundary = false): string[] {
  const roster = players.filter((player) => match.kind !== "internal" || getMatchSide(match, player.id) === side);
  const available = roster.filter((player) => isPlayerAvailable(player, quarter));
  const capacity = getQuarterFormation(match, quarter, side).players;
  const previousActual = match.completedQuarters.includes(quarter - 1) && (side === "A" ? match.actualLineups[quarter - 1] !== undefined : match.internal?.actualLineupsB[quarter - 1] !== undefined);
  const previous = new Set(getQuarterLineup(match, quarter - 1, side, previousActual));
  const nextActual = side === "A" ? match.actualLineups[quarter + 1] !== undefined : match.internal?.actualLineupsB[quarter + 1] !== undefined;
  const nextPlanned = side === "A" ? match.lineups[quarter + 1] : match.internal?.lineupsB[quarter + 1];
  const hasNext = preserveNextBoundary && quarter < match.quarters && (nextActual || nextPlanned !== undefined);
  const next = new Set(getQuarterLineup(match, quarter + 1, side, nextActual));
  const restBoundaries = (player: Player) => Number(isPlayerAvailable(player, quarter - 1) && !previous.has(player.id)) + Number(hasNext && isPlayerAvailable(player, quarter + 1) && !next.has(player.id));
  const pastMatch = { ...match, quarters: quarter - 1, lineups: { ...match.lineups, ...match.actualLineups }, internal: match.internal ? { ...match.internal, lineupsB: { ...match.internal.lineupsB, ...match.internal.actualLineupsB } } : undefined };
  const sort = (a: Player, b: Player) => getPlayerMinutes(a.id, pastMatch) - getPlayerMinutes(b.id, pastMatch) || a.number - b.number || a.id.localeCompare(b.id);
  const requiredByRest = available.filter((player) => restBoundaries(player) > 0).sort((a, b) => restBoundaries(b) - restBoundaries(a) || sort(a, b));
  const required = preserveNextBoundary ? requiredByRest : requiredByRest.slice(0, capacity);
  const optional = available.filter((player) => !required.some((selected) => selected.id === player.id)).sort((a, b) => (required.some(canKeep) ? 0 : Number(canKeep(b)) - Number(canKeep(a))) || sort(a, b));
  return assignFormationPlayers([...required, ...optional], getQuarterFormationId(match, quarter, side), required.map((player) => player.id));
}

/** Changing one quarter must not replace manual choices in the other quarters. */
export function replanMatchQuarter(roster: Player[], original: Match, quarter: number, side: Side = "A"): { match: Match; warnings: string[] } {
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > original.quarters) throw new Error("변경할 쿼터를 확인해 주세요.");
  if (isQuarterLocked(original, quarter)) throw new Error("시작하거나 완료한 쿼터는 변경할 수 없습니다. 이후 쿼터를 선택해 주세요.");
  if (side === "B" && (original.kind !== "internal" || !original.internal)) throw new Error("자체전에서만 B팀 포메이션을 변경할 수 있습니다.");
  const players = getMatchPlayers(roster, original);
  const sideMatch=asSideMatch(original,side);
  const pins=sideMatch.manualLineups?.[quarter];
  const lineup = pins && Object.keys(pins).length
    ? generateLineups(players.filter(p=>original.kind!=="internal"||getMatchSide(original,p.id)===side), {...sideMatch,completedQuarters:Array.from({length:original.quarters},(_,i)=>i+1).filter(q=>q!==quarter)}).lineups[quarter]
    : addedQuarterLineup(players, original, quarter, side, true);
  const match: Match = side === "A"
    ? { ...original, lineups: { ...original.lineups, [quarter]: lineup } }
    : { ...original, internal: { ...original.internal!, lineupsB: { ...original.internal!.lineupsB, [quarter]: lineup } } };
  return { match, warnings: inspectMatch(roster, match) };
}

/** Replan only future quarters, scoring rotations against the actual locked past. */
export function replanRemainingMatch(roster: Player[], original: Match): { match: Match; warnings: string[] } {
  if (original.status === "scheduled") return planMatch(roster, original);
  if (original.status === "finished") return { match: original, warnings: inspectMatch(roster, original) };
  return planMatch(roster, original);
}

/** Resize safely during play; completed snapshots and the current lineup stay immutable. */
export function resizeMatchQuarters(state: TeamState, count: number): TeamState {
  if (!Number.isInteger(count) || count < 1 || count > 12) throw new Error("쿼터 수는 1–12 사이의 정수로 선택해 주세요.");
  const original = state.match;
  if (original.status === "finished") throw new Error("종료된 경기의 쿼터 수는 변경할 수 없습니다.");
  if (original.status === "live" && count < Math.max(original.currentQuarter, ...original.completedQuarters)) throw new Error("진행 중이거나 종료한 쿼터를 삭제할 수 없습니다.");
  if (count === original.quarters) return state;
  const players = getMatchPlayers(state.players, original).map((player) => resizeAvailability(player, original.quarters, count));
  const trim = <T>(values: Record<number, T>) => Object.fromEntries(Object.entries(values).filter(([quarter]) => Number(quarter) <= count));
  let match: Match = { ...original, participants: Object.fromEntries(players.map((player) => [player.id, { attending: player.attending, availableFrom: player.availableFrom, availableUntil: player.availableUntil }])), manualLineups: original.manualLineups ? trim(original.manualLineups) : undefined, quarters: count, currentQuarter: Math.min(original.currentQuarter, count), lineups: trim(original.lineups), formations: original.formations ? trim(original.formations) : undefined };
  if (match.internal) match.internal = { ...match.internal, lineupsB: trim(match.internal.lineupsB), manualLineupsB: match.internal.manualLineupsB ? trim(match.internal.manualLineupsB) : undefined, formationsB: match.internal.formationsB ? trim(match.internal.formationsB) : undefined };
  if (original.status === "scheduled") match = planMatch(players, match).match;
  else for (let quarter = original.quarters + 1; quarter <= count; quarter++) {
    match = { ...match, lineups: { ...match.lineups, [quarter]: addedQuarterLineup(players, match, quarter, "A") } };
    if (match.kind === "internal" && match.internal) match = { ...match, internal: { ...match.internal, lineupsB: { ...match.internal.lineupsB, [quarter]: addedQuarterLineup(players, match, quarter, "B") } } };
  }
  return { ...state, match };
}
