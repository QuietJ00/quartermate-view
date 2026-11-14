import type { Match, Player, TeamState } from "./football.ts";

type Participation = NonNullable<Match["participants"]>[string];

/** A shorter fixture must not leave the displayed window different from the saved one. */
export function updateMatchParticipation(match: Match, id: string, changes: Partial<Participation>): Match {
  const previous = match.participants?.[id] ?? { attending: false, availableFrom: 1, availableUntil: match.quarters };
  const entry = { ...previous, ...changes };
  const bound = (value: number) => Math.max(1, Math.min(match.quarters, Number.isFinite(value) ? Math.trunc(value) : 1));
  entry.availableFrom = bound(entry.availableFrom);
  entry.availableUntil = bound(entry.availableUntil);
  if (entry.availableFrom > entry.availableUntil) {
    if (changes.availableFrom !== undefined) entry.availableUntil = entry.availableFrom;
    else entry.availableFrom = entry.availableUntil;
  }
  return { ...match, participants: { ...match.participants, [id]: entry } };
}

/** Removing an unplayed guest also removes every planned reference to that guest. */
export function removeMatchGuest(match: Match, id: string): Match {
  if (!(match.guests || []).some((guest) => guest.id === id)) return match;
  const actual = [...Object.values(match.actualLineups), ...Object.values(match.internal?.actualLineupsB || {})];
  const played = actual.some((lineup) => lineup.includes(id)) || match.events.some((event) => event.scorerId === id || event.assistId === id) || (match.substitutions || []).some((entry) => entry.outPlayerId === id || entry.inPlayerId === id);
  const locked = new Set([...match.completedQuarters, ...Object.keys(match.clocks || {}).map(Number)]);
  if (match.status === "live" && !Object.keys(match.clocks || {}).length) locked.add(match.currentQuarter);
  const plannedWhileStarted = [...locked].some((quarter) => [...(match.lineups[quarter] || []), ...(match.internal?.lineupsB[quarter] || [])].includes(id));
  if (match.status === "finished" || played || plannedWhileStarted) throw new Error("출전 기록이 있거나 시작한 쿼터에 배치된 용병은 삭제할 수 없습니다. 다음 쿼터의 참가 여부를 변경해 주세요.");
  const participants = { ...match.participants };
  delete participants[id];
  const clear = (lineups: Record<number, string[]>) => Object.fromEntries(Object.entries(lineups).map(([quarter, lineup]) => [quarter, lineup.map((playerId) => playerId === id ? "" : playerId)]));
  const internal = match.internal ? { ...match.internal, playerTeams: { ...match.internal.playerTeams }, lineupsB: clear(match.internal.lineupsB) } : undefined;
  if (internal) delete internal.playerTeams[id];
  return { ...match, guests: match.guests!.filter((guest) => guest.id !== id), participants, lineups: clear(match.lineups), internal, playerSnapshots: match.playerSnapshots?.filter((player) => player.id !== id) };
}

/** Profiles belong to the club; attendance and guests belong to one fixture. */
export function getMatchPlayers(roster: Player[], match: Match): Player[] {
  const profiles = new Map<string, Player>();
  const referenced = new Set([
    ...Object.values(match.lineups).flat(), ...Object.values(match.actualLineups).flat(),
    ...Object.values(match.internal?.lineupsB || {}).flat(), ...Object.values(match.internal?.actualLineupsB || {}).flat(),
    ...match.events.flatMap((event) => [event.scorerId, event.assistId || ""]),
    ...Object.keys(match.participants || {}),
    ...(match.substitutions || []).flatMap((entry) => [entry.outPlayerId, entry.inPlayerId]),
  ]);
  for (const player of match.playerSnapshots || []) if (match.status === "finished" || referenced.has(player.id)) profiles.set(player.id, player);
  for (const entry of match.substitutions || []) for (const player of [entry.outPlayer, entry.inPlayer]) if (!profiles.has(player.id)) profiles.set(player.id, player);
  for (const player of roster) {
    if (match.status === "finished" && match.playerSnapshots && !profiles.has(player.id)) continue;
    if (!player.guest || (!match.participants && !match.playerSnapshots)) profiles.set(player.id, player);
  }
  if (match.status === "finished") for (const player of match.playerSnapshots || []) profiles.set(player.id, player);
  for (const player of match.guests || []) profiles.set(player.id, { ...player, guest: true });
  return [...profiles.values()].map((player) => {
    const participation = match.participants?.[player.id];
    if (participation) return { ...player, ...participation };
    if (match.participants) return { ...player, attending: false, availableFrom: 1, availableUntil: match.quarters };
    return { ...player };
  });
}

/** New schedules deliberately start without selected participants. */
export function initializeMatchParticipants(roster: Player[], match: Match, attending = false): Match {
  if (match.participants) return match;
  const guests = match.guests || [];
  return { ...match, guests, participants: Object.fromEntries([...roster.filter((player) => !player.guest), ...guests].map((player) => [player.id, { attending, availableFrom: 1, availableUntil: match.quarters }])) };
}

/** Keep departed players and temporary guests available in their own records. */
export function snapshotMatchPlayers(roster: Player[], match: Match): Match {
  return { ...match, playerSnapshots: getMatchPlayers(roster, match) };
}

/** Backward-compatible migration of the original club-wide attendance fields. */
export function normalizeTeamParticipants(state: TeamState): TeamState {
  const permanent = state.players.filter((player) => !player.guest);
  // Freeze missing legacy rosters while the pre-deletion club profiles are
  // still present. Subsequent roster edits must not erase played identities.
  const freezeFinished = (match: Match): Match => match.status === "finished" && !match.playerSnapshots ? snapshotMatchPlayers(state.players, match) : match;
  const migrateCurrent = (match: Match): Match => {
    if (match.participants) return match;
    const legacyProfiles = getMatchPlayers(state.players, match);
    const guests = match.guests || legacyProfiles.filter((player) => player.guest);
    return { ...match, guests, participants: Object.fromEntries(legacyProfiles.map((player) => [player.id, { attending: player.attending, availableFrom: player.availableFrom, availableUntil: player.availableUntil }])) };
  };
  const history = state.history?.some((match) => match.status === "finished" && !match.playerSnapshots) ? state.history.map(freezeFinished) : state.history;
  return { ...state, players: permanent, match: migrateCurrent(freezeFinished(state.match)), history, scheduledMatches: state.scheduledMatches?.map((match) => initializeMatchParticipants(permanent, match)) };
}
