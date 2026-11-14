import test from "node:test";
import assert from "node:assert/strict";
import { createDemoState } from "../demo-data.ts";
import {
  FORMATIONS, generateLineups, getFormation, getQuarterFormation, getQuarterFormationId, getPlayerMinutes,
  inspectLineups, isPlayerAvailable, canPlaySlot, positionSuitability, getAllocationQuality, slotPosition,
  positionGroup, assignFormationPlayers, type Match, type Player, type Position,
} from "./football.ts";

function player(id: number, overrides: Partial<Player> = {}): Player {
  return { id: `p${id}`, name: `선수 ${id}`, number: id, position: "MF", guest: false, availableFrom: 1, availableUntil: 4, attending: true, ...overrides };
}

function match(overrides: Partial<Match> = {}): Match {
  return { id: "test-match", title: "테스트 경기", opponent: "상대팀", date: "2026-10-18", time: "08:00", location: "서울", quarters: 4, minutes: 20, formation: "4-3-3", status: "scheduled", currentQuarter: 1, completedQuarters: [], lineups: {}, actualLineups: {}, events: [], opponentGoals: {}, ...overrides };
}

function assertAvailabilityAndRest(players: Player[], fixture: Match) {
  for (let quarter = 1; quarter <= fixture.quarters; quarter++) {
    const formation = getQuarterFormation(fixture, quarter);
    const size = formation.players;
    const selected = fixture.lineups[quarter].filter(Boolean);
    assert.equal(selected.length, Math.min(size, players.filter((person) => isPlayerAvailable(person, quarter)).length));
    assert.equal(new Set(selected).size, selected.length);
    for (const id of selected) assert.ok(isPlayerAvailable(players.find((person) => person.id === id)!, quarter));
    fixture.lineups[quarter].forEach((id, index) => {
      if (id) assert.ok(positionSuitability(players.find((person) => person.id === id)!, formation.positions[index]) > 0, `${id} was assigned an unsuitable position`);
    });

  }
}

test("formations expose complete, unique pitch slots at the correct team size", () => {
  assert.equal(FORMATIONS.filter((formation) => formation.players === 11).length, 14);
  assert.equal(FORMATIONS.filter((formation) => formation.players === 7).length, 4);
  assert.equal(new Set(FORMATIONS.map((formation) => formation.id)).size, FORMATIONS.length);
  for (const formation of FORMATIONS) {
    assert.equal(formation.positions.length, formation.players);
    assert.equal(formation.positions[0].position, "GK");
    assert.equal(formation.positions.filter((slot) => slot.position === "GK").length, 1);
    assert.equal(new Set(formation.positions.map((slot) => slot.label)).size, formation.players);
    assert.equal(new Set(formation.positions.map((slot) => `${slot.x},${slot.y}`)).size, formation.players);
    for (const slot of formation.positions) assert.ok(slot.x > 0 && slot.x < 100 && slot.y > 0 && slot.y < 100);
  }
});

test("the demo contains numbered players and starts with an unplayed match", () => {
  const state = createDemoState();
  assert.equal(state.teamName, "데모 팀");
  assert.equal(state.players.length, 16);
  assert.equal(state.players.filter((person) => person.availableFrom === 2).length, 2);
  assert.equal(state.match.status, "scheduled");
  assert.deepEqual(state.match.events, []);
  assert.deepEqual(state.match.actualLineups, {});
  assert.equal(state.match.kind, "friendly");
  assert.deepEqual(inspectLineups(state.players, state.match), []);
  assertAvailabilityAndRest(state.players, state.match);
});

test("allocation respects late arrivals, early departures, absences, and temporary guests", () => {
  const players = Array.from({ length: 17 }, (_, index) => player(index, { position: index === 0 ? "GK" : (["DF", "MF", "FW"] as Position[])[index % 3], secondaryPosition: index === 0 ? null : (["MF", "FW", "DF"] as Position[])[index % 3] }));
  players[12].availableFrom = 2;
  players[13].availableFrom = 3;
  players[14].availableUntil = 2;
  players[15].attending = false;
  players[16].guest = true;
  const fixture = match();
  fixture.lineups = generateLineups(players, fixture).lineups;
  assertAvailabilityAndRest(players, fixture);
  assert.equal(Object.values(fixture.lineups).flat().includes(players[15].id), false);
  assert.ok(Object.values(fixture.lineups).flat().includes(players[16].id));
});

test("equal availability yields balanced playing time and valid two-quarter rotations", () => {
  const players = createDemoState().players.map((person) => ({ ...person, availableFrom: 1 }));
  const fixture = match();
  fixture.lineups = generateLineups(players, fixture).lineups;
  const minutes = players.map((person) => getPlayerMinutes(person.id, fixture));
  assert.ok(Math.max(...minutes) - Math.min(...minutes) <= fixture.minutes);
  assert.equal(minutes.reduce((sum, value) => sum + value, 0), 11 * 4 * 20);
  assertAvailabilityAndRest(players, fixture);
});

test("seven-player matches use seven slots and primary or secondary goalkeeper coverage", () => {
  for (const formation of ["2-3-1", "3-2-1"]) {
    const players = Array.from({ length: 10 }, (_, index) => player(index, { position: index % 2 ? "DF" : "MF", secondaryPosition: index < 2 ? "GK" : "FW" }));
    const fixture = match({ formation });
    const result = generateLineups(players, fixture);
    fixture.lineups = result.lineups;
    for (const selected of Object.values(result.lineups)) {
      assert.equal(selected.length, 7);
      assert.ok(selected[0] === "p0" || selected[0] === "p1");
    }
    assertAvailabilityAndRest(players, fixture);
    assert.equal(result.warnings.some((warning) => warning.includes("골키퍼")), false);
  }
});

test("position assignment uses an exact role match when the ideal eleven are present", () => {
  for (const formation of FORMATIONS) {
    const players = formation.positions.map((slot, index) => player(index, { position: slot.position }));
    const fixture = match({ formation: formation.id });
    fixture.lineups = generateLineups(players, fixture).lineups;
    for (const selected of Object.values(fixture.lineups)) {
      selected.forEach((id, index) => assert.equal(players.find((person) => person.id === id)?.position, formation.positions[index].position));
    }
  }
});

test("shortage preserves empty formation slots and never invents a player", () => {
  const players = Array.from({ length: 6 }, (_, index) => player(index, { position: index === 0 ? "GK" : "DF" }));
  const fixture = match();
  const result = generateLineups(players, fixture);
  for (const selected of Object.values(result.lineups)) {
    assert.equal(selected.length, 11);
    assert.equal(selected.filter(Boolean).length, 6);
    assert.equal(new Set(selected.filter(Boolean)).size, 6);
    assert.equal(selected[0], "p0");
    selected.forEach((id, index) => { if (id) assert.ok(positionSuitability(players.find((person) => person.id === id)!, getFormation(fixture.formation).positions[index]) > 0); });
  }
  assert.ok(result.warnings.some((warning) => warning.includes("부족")));
});

test("overcrowded rosters report mathematical infeasibility without ignoring availability", () => {
  const players = Array.from({ length: 23 }, (_, index) => player(index, { position: index === 0 ? "GK" : "MF" }));
  const fixture = match();
  const result = generateLineups(players, fixture);
  assert.ok(result.warnings.some((warning) => warning.includes("방지가 불가능")));
  assert.ok(result.warnings.some((warning) => warning.includes("연속 휴식")));
  for (const selected of Object.values(result.lineups)) {
    assert.equal(selected.length, 11);
    assert.equal(selected.filter(Boolean).length, 11);
    assert.equal(new Set(selected.filter(Boolean)).size, 11);
  }
});

test("manual edits are checked for duplicate players, unavailable players, missing keeper and consecutive rests", () => {
  const players = Array.from({ length: 12 }, (_, index) => player(index));
  players[0].availableFrom = 2;
  const fixture = match({ lineups: { 1: ["p0", "p1", "p1", "unknown"], 2: ["p1"] } });
  const warnings = inspectLineups(players, fixture);
  for (const message of ["중복", "참가할 수 없는", "명단에 없는", "골키퍼", "연속 휴식", "부족"]) assert.ok(warnings.some((warning) => warning.includes(message)), message);
});

test("actual minutes count completed snapshots only and remain stable when plans change", () => {
  const fixture = match({ completedQuarters: [1, 1, 2], actualLineups: { 1: ["p1"], 2: ["p2"], 3: ["p1"] }, lineups: { 1: ["p2"], 2: ["p1"], 3: ["p1"], 4: ["p1"] } });
  assert.equal(getPlayerMinutes("p1", fixture), 60);
  assert.equal(getPlayerMinutes("p1", fixture, true), 20);
  fixture.lineups[1] = ["p1"];
  assert.equal(getPlayerMinutes("p1", fixture, true), 20);
  delete fixture.actualLineups[1];
  assert.equal(getPlayerMinutes("p1", fixture, true), 0);
});

test("allocation is deterministic and does not mutate roster or match snapshots", () => {
  const state = createDemoState();
  const original = JSON.stringify(state);
  const first = generateLineups(state.players, state.match);
  const second = generateLineups(state.players, state.match);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(state), original);
});

test("a departure and arrival across tight quarter capacities still receive a feasible rotation", () => {
  const always = Array.from({ length: 12 }, (_, index) => player(index, { position: index < 2 ? "GK" : index < 4 ? "FW" : "MF", secondaryPosition: index < 4 ? null : "DF", availableUntil: 3 }));
  const players = [...always, player(12, { secondaryPosition: "DF", availableUntil: 2 }), player(13, { secondaryPosition: "DF", availableFrom: 2, availableUntil: 3 })];
  const fixture = match({ quarters: 3, formation: "2-3-1" });
  fixture.lineups = generateLineups(players, fixture).lineups;
  assertAvailabilityAndRest(players, fixture);
});

test("position-safe rotation handles tight overlapping arrival windows", () => {
  const windows = [[1, 4], [1, 4], [1, 4], [1, 4], [1, 4], [1, 4], [1, 4], [1, 4], [1, 4], [1, 4], [1, 4], [1, 3], [1, 1], [1, 2], [2, 4], [1, 3]];
  const players = windows.map(([availableFrom, availableUntil], index) => player(index, { position: index < 2 ? "GK" : index < 4 ? "FW" : "MF", secondaryPosition: index < 4 ? null : "DF", availableFrom, availableUntil }));
  const fixture = match({ formation: "2-3-1" });
  const result = generateLineups(players, fixture);
  fixture.lineups = result.lineups;
  assertAvailabilityAndRest(players, fixture);
  assert.equal(getAllocationQuality(players,fixture).zeroMinutes.length,0);
});

test("detailed positions distinguish fullbacks, centre backs, wings and midfield roles", () => {
  assert.equal(slotPosition("LCB"), "CB");
  assert.equal(slotPosition("LDM"), "DM");
  assert.equal(slotPosition("RCM"), "CM");
  assert.equal(slotPosition("CAM"), "AM");
  assert.equal(slotPosition("RS"), "ST");
  assert.equal(positionGroup("LWB"), "DF");
  assert.equal(positionGroup("DM"), "MF");
  assert.equal(positionGroup("RW"), "FW");
  assert.ok(canPlaySlot(player(1, { position: "LB", secondaryPosition: "LW" }), "LB"));
  assert.ok(canPlaySlot(player(1, { position: "LB", secondaryPosition: "LW" }), "LW"));
  assert.equal(canPlaySlot(player(1, { position: "LB", secondaryPosition: "LW" }), "RB"), false);
  assert.equal(canPlaySlot(player(1, { position: "CB" }), "LB"), false);
  assert.equal(canPlaySlot(player(1, { position: "DM" }), "AM"), false);
  assert.ok(canPlaySlot(player(1, { position: "DF" }), "RWB"));
});

test("a primary goalkeeper is never placed outfield even with an outfield secondary position", () => {
  const formation = getFormation("4-3-3");
  const players = formation.positions.slice(0, 8).map((slot, index) => player(index, { position: slot.position }));
  players.push(player(99, { position: "GK", secondaryPosition: "ST" }));
  const result = generateLineups(players, match());
  for (const lineup of Object.values(result.lineups)) {
    assert.equal(lineup[9], "");
    assert.equal(lineup.slice(1).includes("p99"), false);
    lineup.forEach((id, index) => { if (id) assert.ok(positionSuitability(players.find((person) => person.id === id)!, formation.positions[index]) > 0); });
  }
});

test("a missing goalkeeper leaves GK vacant and cannot be replaced by an unrelated position", () => {
  const players = getFormation("4-3-3").positions.slice(1).map((slot, index) => player(index, { position: slot.position }));
  const result = generateLineups(players, match());
  for (const lineup of Object.values(result.lineups)) {
    assert.equal(lineup[0], "");
    assert.equal(lineup.filter(Boolean).length, 10);
  }
  assert.ok(result.warnings.some((warning) => warning.includes("골키퍼")));
});

test("maximum matching uses a secondary position to avoid an unnecessary vacancy", () => {
  const formation = getFormation("4-3-3");
  const players = formation.positions.map((slot, index) => player(index, { position: slot.position }));
  // The first CB can also play LB. The existing LB can only play CB.
  players[1].position = "CB";
  players[2].secondaryPosition = "LB";
  const result = generateLineups(players, match());
  for (const lineup of Object.values(result.lineups)) {
    assert.equal(lineup.filter(Boolean).length, 11);
    assert.equal(lineup[1], players[2].id);
    assert.ok(lineup.slice(2, 4).includes(players[1].id));
  }
});

test("minute balance takes precedence over exact field roles without unnecessary vacancies", () => {
  const players = [player(0, { position: "GK" }), player(1, { position: "LB" }), ...Array.from({ length: 14 }, (_, index) => player(index + 2, { position: "CM" }))];
  const fixture=match();fixture.lineups=generateLineups(players,fixture).lineups;
  assertAvailabilityAndRest(players,fixture);
  const quality=getAllocationQuality(players,fixture);
  assert.equal(quality.zeroMinutes.length,0);
  assert.ok(quality.fieldMinuteSpread<=fixture.minutes);
  for(const ids of Object.values(fixture.lineups))assert.equal(ids[0],"p0");
});

test("all available players are considered before a large roster is reduced to eleven", () => {
  const formation = getFormation("4-3-3");
  const players = [...Array.from({ length: 89 }, (_, index) => player(index, { position: "CM", availableUntil: 12 })), ...formation.positions.map((slot, index) => player(index + 89, { position: slot.position, availableUntil: 12 }))];
  const result = generateLineups(players, match({ quarters: 12 }));
  for (const lineup of Object.values(result.lineups)) {
    assert.equal(lineup.filter(Boolean).length, 11);

    lineup.forEach((id, index) => assert.ok(positionSuitability(players.find((person) => person.id === id)!, formation.positions[index]) > 0));
  }
});

test("single-quarter matching honors boundary rest priority without displacing a required role", () => {
  const formation = getFormation("4-3-3");
  const players = formation.positions.map((slot, index) => player(index, { position: slot.position }));
  players.push(player(99, { position: "CM" }));
  const lineup = assignFormationPlayers(players, formation.id, ["p99"]);
  assert.equal(lineup.filter(Boolean).length, 11);
  assert.ok(lineup.includes("p99"));
  assert.equal(lineup[1], "p1");
});

test("actual minutes use stopped quarter clocks including added time with a legacy fallback", () => {
  const fixture = match({ completedQuarters: [1, 2], actualLineups: { 1: ["p1"], 2: ["p1"] }, clocks: { 1: { elapsedSeconds: 27 * 60 + 12, startedAt: null } } });
  assert.equal(getPlayerMinutes("p1", fixture, true), 47.2);
  assert.equal(getPlayerMinutes("p1", fixture), 0);
});


test("quarter formation lookup supports legacy defaults and independent actual snapshots on both sides", () => {
  const fixture = match({ formations: { 2: "4-4-2", 3: "3-5-2" }, actualFormations: { 2: "4-1-4-1" }, kind: "internal", internal: { teamAName: "청팀", teamBName: "백팀", formationB: "4-2-3-1", formationsB: { 2: "3-4-3" }, actualFormationsB: { 2: "5-3-2" }, playerTeams: {}, lineupsB: {}, actualLineupsB: {} } });
  assert.equal(getQuarterFormationId(fixture, 1), "4-3-3");
  assert.equal(getQuarterFormationId(fixture, 2), "4-4-2");
  assert.equal(getQuarterFormationId(fixture, 2, "A", true), "4-1-4-1");
  assert.equal(getQuarterFormationId(fixture, 3, "A", true), "3-5-2");
  assert.equal(getQuarterFormationId(fixture, 1, "B"), "4-2-3-1");
  assert.equal(getQuarterFormationId(fixture, 2, "B"), "3-4-3");
  assert.equal(getQuarterFormationId(fixture, 2, "B", true), "5-3-2");
  assert.equal(getQuarterFormationId(match(), 12), "4-3-3");
  assert.equal(getQuarterFormation(fixture, 2).positions[5].position, "LM");
});

test("mixed eleven-player formations preserve arrival windows, full lineups and rest-safe rotations", () => {
  const players = createDemoState().players;
  const fixture = match({ formations: { 1: "4-3-3", 2: "4-4-2", 3: "3-5-2", 4: "4-2-3-1" } });
  const saved = JSON.stringify({ players, fixture });
  const result = generateLineups(players, fixture);
  assert.equal(JSON.stringify({ players, fixture }), saved);
  assert.deepEqual(result.warnings, []);
  assertAvailabilityAndRest(players, { ...fixture, lineups: result.lineups });
  assert.deepEqual(result, generateLineups(players, fixture));
});

test("every quarter's detailed roles determine legal placement rather than the default formation", () => {
  const fixture = match({ formations: { 1: "4-3-3", 2: "4-4-2", 3: "3-5-2", 4: "4-2-3-1" } });
  const maximumCounts = new Map<Position, number>();
  for (let quarter = 1; quarter <= 4; quarter++) {
    const counts = new Map<Position, number>();
    for (const slot of getQuarterFormation(fixture, quarter).positions) counts.set(slot.position, (counts.get(slot.position) || 0) + 1);
    for (const [position, count] of counts) maximumCounts.set(position, Math.max(maximumCounts.get(position) || 0, count));
  }
  const players = [...maximumCounts].flatMap(([position, count]) => Array.from({ length: count }, () => ({ position }))).map(({ position }, index) => player(index, { position, secondaryPosition: position === "GK" ? "ST" : null }));
  const result = generateLineups(players, fixture);
  for (let quarter = 1; quarter <= 4; quarter++) {
    const formation = getQuarterFormation(fixture, quarter);
    assert.equal(result.lineups[quarter].filter(Boolean).length, 11);
    result.lineups[quarter].forEach((id, index) => assert.ok(positionSuitability(players.find((person) => person.id === id)!, formation.positions[index]) > 0));
  }
  const leftFullback = players.find((person) => person.position === "LB")!;
  assert.ok(Object.values(result.lineups).some(ids=>ids.includes(leftFullback.id)));
  assert.equal(result.warnings.some((warning) => warning.includes("주·부포지션")), false);
});

test("changing seven-player layouts handles detailed fullback and midfield secondary roles", () => {
  const roles: [Position, Position | null][] = [["GK", null], ["GK", "ST"], ["CB", null], ["CB", null], ["CB", null], ["CM", null], ["CM", null], ["LM", "LB"], ["RM", "RB"], ["ST", null], ["ST", null]];
  const players = roles.map(([position, secondaryPosition], index) => player(index, { position, secondaryPosition }));
  const fixture = match({ formation: "2-3-1", formations: { 1: "2-3-1", 2: "3-2-1", 3: "2-3-1", 4: "3-1-2" } });
  const result = generateLineups(players, fixture);
  assert.deepEqual(result.warnings, []);
  assertAvailabilityAndRest(players, { ...fixture, lineups: result.lineups });
  assert.ok(positionSuitability(players[7], "LB") >= 95);
  assert.ok(positionSuitability(players[8], "RB") >= 95);
});

test("the inspector validates slot eligibility against its own quarter's layout", () => {
  const formation = getFormation("4-4-2");
  const players = formation.positions.map((slot, index) => player(index, { position: slot.position }));
  const fixture = match({ quarters: 1, formations: { 1: "4-4-2" }, lineups: { 1: players.map((person) => person.id) } });
  assert.deepEqual(inspectLineups(players, fixture), []);
  fixture.formations = { 1: "4-3-3" };
  assert.equal(inspectLineups(players, fixture).some((warning) => warning.includes("주·부포지션")), false);
  fixture.formations = { 1: "2-3-1" };
  assert.ok(inspectLineups(players, fixture).some((warning) => warning.includes("경기 기본 정원")));
});
