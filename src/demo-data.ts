import { generateLineups, type Match, type Player, type Position, type TeamState } from "./engine/football.ts";

const roster: [number, Position, Position?, number?][] = [
  [1, "GK"], [3, "LB", "CB"], [4, "CB", "DM"], [5, "CB", "RB"],
  [2, "RB", "CB"], [6, "DM", "CM"], [8, "CM", "AM"], [10, "AM", "CM"],
  [7, "LW", "ST"], [9, "ST", "RW"], [11, "RW", "LW"], [12, "GK"],
  [14, "LB", "LM"], [16, "CM", "DM"], [17, "RW", "RM", 2], [22, "ST", "LW", 2],
];

export function createDemoState(): TeamState {
  const players: Player[] = roster.map(([number, position, secondaryPosition, availableFrom = 1]) => ({
    id: `demo-player-${number}`,
    name: `선수 ${String(number).padStart(2, "0")}`,
    number,
    position,
    secondaryPosition,
    guest: false,
    attending: true,
    availableFrom,
    availableUntil: 4,
  }));
  const match: Match = {
    id: "portfolio-friendly",
    title: "주말 친선 경기",
    opponent: "",
    date: "",
    time: "",
    location: "",
    kind: "friendly",
    formation: "4-3-3",
    quarters: 4,
    minutes: 20,
    status: "scheduled",
    currentQuarter: 1,
    completedQuarters: [],
    lineups: {},
    events: [],
    opponentGoals: {},
    actualLineups: {},
  };
  match.lineups = generateLineups(players, match).lineups;
  return { teamName: "데모 팀", players, match };
}
