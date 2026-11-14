import { optimizeLineupSchedule } from "./lineup-optimizer.ts";
import { getQuarterPlayingIntervals } from "./substitutions.ts";

export type Position = "GK" | "DF" | "MF" | "FW" | "CB" | "LB" | "RB" | "LWB" | "RWB" | "DM" | "CM" | "AM" | "LM" | "RM" | "LW" | "RW" | "ST" | "SS";
export const POSITION_VALUES = ["GK", "DF", "MF", "FW", "CB", "LB", "RB", "LWB", "RWB", "DM", "CM", "AM", "LM", "RM", "LW", "RW", "ST", "SS"] as const;

export const POSITION_LABELS: Record<Position, string> = {
  GK: "GK", CB: "센터백", LB: "왼쪽 풀백", RB: "오른쪽 풀백", LWB: "왼쪽 윙백", RWB: "오른쪽 윙백",
  DM: "수비형 미드필더", CM: "중앙 미드필더", AM: "공격형 미드필더", LM: "왼쪽 미드필더", RM: "오른쪽 미드필더",
  LW: "왼쪽 윙어", RW: "오른쪽 윙어", ST: "스트라이커", SS: "세컨드 스트라이커",
  DF: "DF", MF: "MF", FW: "FW",
};
export const POSITION_OPTIONS = (Object.keys(POSITION_LABELS) as Position[]).map((value) => ({ value, label: POSITION_LABELS[value] === value ? value : `${value} · ${POSITION_LABELS[value]}` }));

/** Broad positions remain supported for rosters saved before detailed positions. */
export function positionGroup(position: Position): "GK" | "DF" | "MF" | "FW" {
  if (position === "GK") return "GK";
  if (["DF", "CB", "LB", "RB", "LWB", "RWB"].includes(position)) return "DF";
  if (["FW", "LW", "RW", "ST", "SS"].includes(position)) return "FW";
  return "MF";
}

/** Left/right centre variants share a personal position; fullbacks and wings do not. */
export function slotPosition(label: string): Position {
  const aliases: Record<string, Position> = { LCB: "CB", RCB: "CB", CDM: "DM", LDM: "DM", RDM: "DM", LCM: "CM", RCM: "CM", CAM: "AM", LAM: "AM", RAM: "AM", LS: "ST", RS: "ST" };
  return aliases[label] ?? (label in POSITION_LABELS ? label as Position : "CM");
}

function matchesPosition(personal: Position | null | undefined, target: Position): boolean {
  return personal === target || (personal === "DF" || personal === "MF" || personal === "FW") && positionGroup(target) === personal;
}

export function canPlaySlot(player: Player, target: FormationSlot | Position): boolean {
  const position = typeof target === "string" ? target : target.position;
  if (player.position === "GK") return position === "GK";
  return matchesPosition(player.position, position) || matchesPosition(player.secondaryPosition, position);
}

export interface Player {
  id: string;
  name: string;
  number: number;
  position: Position;
  secondaryPosition?: Position | null;
  guest: boolean;
  availableFrom: number;
  availableUntil: number;
  attending: boolean;
}

export interface OpponentGoal {
  id: string;
  quarter: number;
  elapsedSeconds?: number | null;
  /** Explicit historical attribution; absent means derive from playing intervals. */
  goalkeeperId?: string | null;
  createdAt: string;
}

export interface MatchEvent {
  id: string;
  quarter: number;
  scorerId: string;
  /** Conceding keeper in internal matches; absent means automatic attribution. */
  goalkeeperId?: string | null;
  assistId: string | null;
  createdAt: string;
  elapsedSeconds?: number | null;
}

/** Kickoff snapshots stay unchanged; substitutions describe the intervals after kickoff. */
export interface MatchSubstitution {
  id: string;
  quarter: number;
  side: "A" | "B";
  outPlayerId: string;
  inPlayerId: string;
  elapsedSeconds: number;
  slotIndex: number;
  position: Position;
  outPlayer: Player;
  inPlayer: Player;
  allowPositionOverride?: boolean;
}

export interface Match {
  id: string;
  /** Empty current slot after a fixture is moved to recoverable trash. */
  isPlaceholder?: boolean;
  /** Existing saved matches without a kind remain external friendlies. */
  kind?: "friendly" | "internal" | "tournament";
  title: string;
  opponent: string;
  date: string;
  time: string;
  location: string;
  quarters: number;
  minutes: number;
  formation: string;
  /** Planned layout for each quarter; legacy matches use formation as the default. */
  formations?: Record<number, string>;
  status: "scheduled" | "live" | "finished";
  currentQuarter: number;
  completedQuarters: number[];
  lineups: Record<number, string[]>;
  /** Explicit future manual placements survive automatic replanning; no DB migration. */
  manualLineups?: Record<number, Record<number, string>>;
  events: MatchEvent[];
  opponentGoals: Record<number, number>;
  opponentEvents?: OpponentGoal[];
  actualLineups: Record<number, string[]>;
  actualPositions?: Record<number, Record<string, Position>>;
  actualFormations?: Record<number, string>;
  playerSnapshots?: Player[];
  participants?: Record<string, { attending: boolean; availableFrom: number; availableUntil: number }>;
  guests?: Player[];
  clocks?: Record<number, { elapsedSeconds: number; startedAt: string | null }>;
  substitutions?: MatchSubstitution[];
  internal?: {
    teamAName: string;
    teamBName: string;
    formationB: string;
    formationsB?: Record<number, string>;
    playerTeams: Record<string, "A" | "B">;
    lineupsB: Record<number, string[]>;
    manualLineupsB?: Record<number, Record<number, string>>;
    actualLineupsB: Record<number, string[]>;
    actualPositionsB?: Record<number, Record<string, Position>>;
    actualFormationsB?: Record<number, string>;
  };
}

export interface TeamState {
  teamName: string;
  teamSettings?: { description: string; formation: string; quarters: number; minutes: number };
  players: Player[];
  match: Match;
  history?: Match[];
  scheduledMatches?: Match[];

}

export interface FormationSlot {
  label: string;
  position: Position;
  /** Coordinates expressed as percentages, with the attacking goal at the top. */
  x: number;
  y: number;
}

export interface Formation {
  id: string;
  name: string;
  players: number;
  positions: FormationSlot[];
}

const slot = (label: string, _position: Position, x: number, y: number): FormationSlot => ({ label, position: slotPosition(label), x, y });

export const FORMATIONS: Formation[] = [
  {
    id: "4-3-3", name: "4-3-3", players: 11,
    positions: [slot("GK", "GK", 50, 88), slot("LB", "DF", 15, 70), slot("LCB", "DF", 38, 74), slot("RCB", "DF", 62, 74), slot("RB", "DF", 85, 70), slot("LCM", "MF", 28, 49), slot("CDM", "MF", 50, 56), slot("RCM", "MF", 72, 49), slot("LW", "FW", 19, 25), slot("ST", "FW", 50, 19), slot("RW", "FW", 81, 25)],
  },
  {
    id: "4-4-2", name: "4-4-2", players: 11,
    positions: [slot("GK", "GK", 50, 88), slot("LB", "DF", 15, 70), slot("LCB", "DF", 38, 74), slot("RCB", "DF", 62, 74), slot("RB", "DF", 85, 70), slot("LM", "MF", 16, 45), slot("LCM", "MF", 39, 50), slot("RCM", "MF", 61, 50), slot("RM", "MF", 84, 45), slot("LS", "FW", 36, 22), slot("RS", "FW", 64, 22)],
  },
  {
    id: "3-5-2", name: "3-5-2", players: 11,
    positions: [slot("GK", "GK", 50, 88), slot("LCB", "DF", 25, 73), slot("CB", "DF", 50, 77), slot("RCB", "DF", 75, 73), slot("LWB", "MF", 12, 45), slot("LCM", "MF", 33, 49), slot("CDM", "MF", 50, 58), slot("RCM", "MF", 67, 49), slot("RWB", "MF", 88, 45), slot("LS", "FW", 36, 22), slot("RS", "FW", 64, 22)],
  },
  {
    id: "4-2-3-1", name: "4-2-3-1", players: 11,
    positions: [slot("GK", "GK", 50, 88), slot("LB", "DF", 15, 71), slot("LCB", "DF", 38, 75), slot("RCB", "DF", 62, 75), slot("RB", "DF", 85, 71), slot("LDM", "MF", 36, 57), slot("RDM", "MF", 64, 57), slot("LAM", "MF", 19, 37), slot("CAM", "MF", 50, 40), slot("RAM", "MF", 81, 37), slot("ST", "FW", 50, 19)],
  },
  {
    id: "4-1-4-1", name: "4-1-4-1", players: 11,
    positions: [slot("GK", "GK", 50, 88), slot("LB", "DF", 15, 71), slot("LCB", "DF", 38, 75), slot("RCB", "DF", 62, 75), slot("RB", "DF", 85, 71), slot("CDM", "MF", 50, 59), slot("LM", "MF", 15, 39), slot("LCM", "MF", 38, 43), slot("RCM", "MF", 62, 43), slot("RM", "MF", 85, 39), slot("ST", "FW", 50, 19)],
  },
  {
    id: "4-4-1-1", name: "4-4-1-1", players: 11,
    positions: [slot("GK", "GK", 50, 88), slot("LB", "DF", 15, 71), slot("LCB", "DF", 38, 75), slot("RCB", "DF", 62, 75), slot("RB", "DF", 85, 71), slot("LM", "MF", 15, 49), slot("LCM", "MF", 38, 53), slot("RCM", "MF", 62, 53), slot("RM", "MF", 85, 49), slot("SS", "FW", 50, 35), slot("ST", "FW", 50, 18)],
  },
  {
    id: "4-3-1-2", name: "4-3-1-2", players: 11,
    positions: [slot("GK", "GK", 50, 88), slot("LB", "DF", 15, 71), slot("LCB", "DF", 38, 75), slot("RCB", "DF", 62, 75), slot("RB", "DF", 85, 71), slot("LCM", "MF", 28, 53), slot("CM", "MF", 50, 57), slot("RCM", "MF", 72, 53), slot("CAM", "MF", 50, 36), slot("LS", "FW", 34, 19), slot("RS", "FW", 66, 19)],
  },
  {
    id: "4-1-2-1-2", name: "4-1-2-1-2", players: 11,
    positions: [slot("GK", "GK", 50, 88), slot("LB", "DF", 15, 71), slot("LCB", "DF", 38, 75), slot("RCB", "DF", 62, 75), slot("RB", "DF", 85, 71), slot("CDM", "MF", 50, 61), slot("LCM", "MF", 27, 48), slot("RCM", "MF", 73, 48), slot("CAM", "MF", 50, 34), slot("LS", "FW", 34, 18), slot("RS", "FW", 66, 18)],
  },
  {
    id: "3-4-3", name: "3-4-3", players: 11,
    positions: [slot("GK", "GK", 50, 88), slot("LCB", "DF", 25, 72), slot("CB", "DF", 50, 77), slot("RCB", "DF", 75, 72), slot("LWB", "MF", 12, 47), slot("LCM", "MF", 38, 53), slot("RCM", "MF", 62, 53), slot("RWB", "MF", 88, 47), slot("LW", "FW", 20, 25), slot("ST", "FW", 50, 18), slot("RW", "FW", 80, 25)],
  },
  {
    id: "3-4-2-1", name: "3-4-2-1", players: 11,
    positions: [slot("GK", "GK", 50, 88), slot("LCB", "DF", 25, 72), slot("CB", "DF", 50, 77), slot("RCB", "DF", 75, 72), slot("LWB", "MF", 12, 49), slot("LCM", "MF", 38, 57), slot("RCM", "MF", 62, 57), slot("RWB", "MF", 88, 49), slot("LAM", "MF", 32, 36), slot("RAM", "MF", 68, 36), slot("ST", "FW", 50, 18)],
  },
  {
    id: "3-4-1-2", name: "3-4-1-2", players: 11,
    positions: [slot("GK", "GK", 50, 88), slot("LCB", "DF", 25, 72), slot("CB", "DF", 50, 77), slot("RCB", "DF", 75, 72), slot("LWB", "MF", 12, 47), slot("LCM", "MF", 38, 56), slot("RCM", "MF", 62, 56), slot("RWB", "MF", 88, 47), slot("CAM", "MF", 50, 36), slot("LS", "FW", 34, 18), slot("RS", "FW", 66, 18)],
  },
  {
    id: "5-3-2", name: "5-3-2", players: 11,
    positions: [slot("GK", "GK", 50, 88), slot("LWB", "DF", 12, 61), slot("LCB", "DF", 30, 73), slot("CB", "DF", 50, 77), slot("RCB", "DF", 70, 73), slot("RWB", "DF", 88, 61), slot("LCM", "MF", 28, 47), slot("CM", "MF", 50, 52), slot("RCM", "MF", 72, 47), slot("LS", "FW", 34, 21), slot("RS", "FW", 66, 21)],
  },
  {
    id: "5-4-1", name: "5-4-1", players: 11,
    positions: [slot("GK", "GK", 50, 88), slot("LWB", "DF", 12, 64), slot("LCB", "DF", 30, 74), slot("CB", "DF", 50, 78), slot("RCB", "DF", 70, 74), slot("RWB", "DF", 88, 64), slot("LM", "MF", 16, 43), slot("LCM", "MF", 38, 49), slot("RCM", "MF", 62, 49), slot("RM", "MF", 84, 43), slot("ST", "FW", 50, 20)],
  },
  {
    id: "4-2-2-2", name: "4-2-2-2", players: 11,
    positions: [slot("GK", "GK", 50, 88), slot("LB", "DF", 15, 71), slot("LCB", "DF", 38, 75), slot("RCB", "DF", 62, 75), slot("RB", "DF", 85, 71), slot("LDM", "MF", 36, 59), slot("RDM", "MF", 64, 59), slot("LAM", "MF", 25, 39), slot("RAM", "MF", 75, 39), slot("LS", "FW", 36, 19), slot("RS", "FW", 64, 19)],
  },
  {
    id: "2-3-1", name: "2-3-1", players: 7,
    positions: [slot("GK", "GK", 50, 88), slot("LCB", "DF", 30, 70), slot("RCB", "DF", 70, 70), slot("LM", "MF", 20, 45), slot("CM", "MF", 50, 49), slot("RM", "MF", 80, 45), slot("ST", "FW", 50, 21)],
  },
  {
    id: "3-2-1", name: "3-2-1", players: 7,
    positions: [slot("GK", "GK", 50, 88), slot("LB", "DF", 22, 68), slot("CB", "DF", 50, 74), slot("RB", "DF", 78, 68), slot("LCM", "MF", 33, 45), slot("RCM", "MF", 67, 45), slot("ST", "FW", 50, 21)],
  },
  {
    id: "2-2-2", name: "2-2-2", players: 7,
    positions: [slot("GK", "GK", 50, 88), slot("LCB", "DF", 30, 71), slot("RCB", "DF", 70, 71), slot("LCM", "MF", 30, 47), slot("RCM", "MF", 70, 47), slot("LS", "FW", 33, 22), slot("RS", "FW", 67, 22)],
  },
  {
    id: "3-1-2", name: "3-1-2", players: 7,
    positions: [slot("GK", "GK", 50, 88), slot("LB", "DF", 22, 68), slot("CB", "DF", 50, 75), slot("RB", "DF", 78, 68), slot("CM", "MF", 50, 47), slot("LS", "FW", 33, 22), slot("RS", "FW", 67, 22)],
  },
];

export function getFormation(id: string): Formation {
  return FORMATIONS.find((formation) => formation.id === id) ?? FORMATIONS[0];
}

/** Actual snapshots take precedence only when the caller requests a played layout. */
export function getQuarterFormationId(match: Match, quarter: number, side: "A" | "B" = "A", actual = false): string {
  const internal = side === "B" ? match.internal : undefined;
  const base = internal ? internal.formationB : match.formation;
  const planned = internal ? internal.formationsB : match.formations;
  const snapshots = internal ? internal.actualFormationsB : match.actualFormations;
  return (actual ? snapshots?.[quarter] : undefined) ?? planned?.[quarter] ?? base;
}

export function getQuarterFormation(match: Match, quarter: number, side: "A" | "B" = "A", actual = false): Formation {
  return getFormation(getQuarterFormationId(match, quarter, side, actual));
}

export function isPlayerAvailable(player: Player, quarter: number): boolean {
  return player.attending && quarter >= player.availableFrom && quarter <= player.availableUntil;
}

const uniquePlayers = (players: Player[]) => players.filter((player, index) => players.findIndex((other) => other.id === player.id) === index);
const boundedQuarters = (match: Match) => Math.max(1, Math.min(12, Math.trunc(match.quarters) || 4));
const canKeep = (player: Player) => canPlaySlot(player, "GK");

/**
 * Rectangular Hungarian matching considers every available player. A vacant slot
 * costs more than every legal preference combined; an illegal assignment costs
 * more than a vacancy. Only keeper eligibility is a hard position constraint.
 */
function assignPositions(players: Player[], formation: Formation, preference: (player: Player, index: number) => number = () => 0): string[] {
  const rows = formation.positions.length;
  const columns = players.length + rows;
  const costs = formation.positions.map((target) => Array.from({ length: columns }, (_, index) => {
    if (index >= players.length) return 1_000_000_000 + index;
    const player = players[index];
    if (positionSuitability(player, target) === 0) return 1_000_000_000_000;
    const secondary = 100-positionSuitability(player,target);
    return preference(player, index) + secondary * 2 + index / 1000;
  }));
  const u = Array(rows + 1).fill(0) as number[];
  const v = Array(columns + 1).fill(0) as number[];
  const p = Array(columns + 1).fill(0) as number[];
  const way = Array(columns + 1).fill(0) as number[];
  for (let row = 1; row <= rows; row++) {
    p[0] = row;
    let column = 0;
    const min = Array(columns + 1).fill(Infinity) as number[];
    const used = Array(columns + 1).fill(false) as boolean[];
    do {
      used[column] = true;
      const currentRow = p[column];
      let delta = Infinity;
      let next = 0;
      for (let candidate = 1; candidate <= columns; candidate++) {
        if (used[candidate]) continue;
        const cost = costs[currentRow - 1][candidate - 1] - u[currentRow] - v[candidate];
        if (cost < min[candidate]) { min[candidate] = cost; way[candidate] = column; }
        if (min[candidate] < delta) { delta = min[candidate]; next = candidate; }
      }
      for (let candidate = 0; candidate <= columns; candidate++) {
        if (used[candidate]) { u[p[candidate]] += delta; v[candidate] -= delta; } else min[candidate] -= delta;
      }
      column = next;
    } while (p[column] !== 0);
    do {
      const previous = way[column];
      p[column] = p[previous];
      column = previous;
    } while (column !== 0);
  }
  const lineup = Array(rows).fill("") as string[];
  for (let column = 1; column <= columns; column++) {
    if (p[column] && column <= players.length && positionSuitability(players[column - 1], formation.positions[p[column] - 1]) > 0) lineup[p[column] - 1] = players[column - 1].id;
  }
  return lineup;
}

/** Caller supplies only players available in this quarter, ordered by minute priority. */
export function assignFormationPlayers(players: Player[], formationId: string, priorityIds: string[] = []): string[] {
  const priority = new Set(priorityIds);
  return assignPositions(uniquePlayers(players), getFormation(formationId), (player, index) => (priority.has(player.id) ? -100_000 : 0) + index * 10);
}

const NEAR_POSITIONS: Partial<Record<Position, Position[]>> = {
  CB:["LB","RB","DM"], LB:["LWB","LM"], RB:["RWB","RM"], LWB:["LB","LM","LW"], RWB:["RB","RM","RW"],
  DM:["CM","CB"], CM:["DM","AM","LM","RM"], AM:["CM","SS","LM","RM","LW","RW"],
  LM:["LB","LWB","LW","AM","CM"], RM:["RB","RWB","RW","AM","CM"], LW:["LM","AM","SS"], RW:["RM","AM","SS"], ST:["SS","LW","RW"], SS:["ST","AM","LW","RW"],
};
/** Normalized roles, not slot-label string equality. Only the automatic planner is flexible. */
export function positionSuitability(player: Player, target: FormationSlot | Position): number {
  const position=typeof target==="string"?target:target.position;
  if(position==="GK")return player.position==="GK"?100:player.secondaryPosition==="GK"?95:0;
  if(player.position==="GK")return 0;
  const score=(personal:Position|null|undefined,secondary=false)=>{
    if(!personal||personal==="GK")return 0;
    if(personal===position)return secondary?95:100;
    if(["DF","MF","FW"].includes(personal)&&positionGroup(position)===personal)return secondary?75:80;
    if(NEAR_POSITIONS[personal]?.includes(position)||NEAR_POSITIONS[position]?.includes(personal))return secondary?78:80;
    return positionGroup(personal)===positionGroup(position)?60:30;
  };
  return Math.max(score(player.position),score(player.secondaryPosition,true));
}

export function generateLineups(inputPlayers: Player[], match: Match): { lineups: Record<number, string[]>; warnings: string[] } {
  const players=uniquePlayers(inputPlayers).map(p=>match.participants?{...p,...(match.participants[p.id]??{attending:false,availableFrom:1,availableUntil:match.quarters})}:p);
  const formations=Array.from({length:boundedQuarters(match)},(_,i)=>getQuarterFormation(match,i+1));
  const lineups=optimizeLineupSchedule(players,match,formations,positionSuitability);
  return {lineups,warnings:inspectLineups(players,{...match,lineups})};
}

export function getAllocationQuality(players: Player[], match: Match) {
  players=uniquePlayers(players).map(p=>match.participants?{...p,...(match.participants[p.id]??{attending:false,availableFrom:1,availableUntil:match.quarters})}:p);
  const totals=players.filter(p=>p.attending && p.availableFrom<=match.quarters && p.availableUntil>=1).map(p=>({playerId:p.id,name:p.name,quarters:Object.values(match.lineups).filter(ids=>ids.includes(p.id)).length,minutes:getPlayerMinutes(p.id,match),keeper:p.position==="GK"}));
  const field=totals.filter(p=>!p.keeper).map(p=>p.minutes);
  return {players:totals,zeroMinutes:totals.filter(p=>p.minutes===0).map(p=>p.playerId),fieldMinuteSpread:field.length?Math.max(...field)-Math.min(...field):0,
    quarters:Array.from({length:boundedQuarters(match)},(_,i)=>{const q=i+1,f=getQuarterFormation(match,q),ids=match.lineups[q]||[],available=players.filter(p=>isPlayerAvailable(p,q));return {quarter:q,available:available.length,filled:ids.filter(Boolean).length,empty:f.positions.filter((_,j)=>!ids[j]).map(s=>s.label),duplicates:ids.filter((id,j)=>id&&ids.indexOf(id)!==j),unavailable:ids.filter(id=>id&&!available.some(p=>p.id===id)),positionScores:ids.map((id,j)=>{const p=players.find(p=>p.id===id);return p&&f.positions[j]?positionSuitability(p,f.positions[j]):null;}),manualViolations:Object.entries(match.manualLineups?.[q]||{}).filter(([index,id])=>ids[Number(index)]!==id).map(([index])=>Number(index))};})};
}

export function inspectLineups(inputPlayers: Player[], match: Match): string[] {
  const warnings: string[] = [];
  const players = uniquePlayers(inputPlayers);
  const playerById = new Map(players.map((player) => [player.id, player]));
  const baseFormation = getFormation(match.formation);
  if (!FORMATIONS.some((item) => item.id === match.formation)) warnings.push("선택한 포메이션이 없어 4-3-3 기준으로 배분했습니다.");
  if (players.length !== inputPlayers.length) warnings.push("선수 ID가 중복되어 있습니다. 중복된 선수는 한 명으로 계산합니다.");
  for (const player of players) {
    if (player.attending && (!Number.isInteger(player.availableFrom) || !Number.isInteger(player.availableUntil) || player.availableFrom < 1 || player.availableFrom > player.availableUntil)) warnings.push(`${player.name}: 참가 가능 쿼터를 확인해 주세요.`);
  }
  for (let quarter = 1; quarter <= boundedQuarters(match); quarter++) {
    const formationId = getQuarterFormationId(match, quarter);
    const formation = getQuarterFormation(match, quarter);
    if (!FORMATIONS.some((item) => item.id === formationId)) warnings.push(`${quarter}Q 포메이션을 확인해 주세요.`);
    if (formation.players !== baseFormation.players) warnings.push(`${quarter}Q 포메이션 인원수는 경기 기본 정원 ${baseFormation.players}명과 같아야 합니다.`);
    const ids = (match.lineups[quarter] ?? []).filter(Boolean);
    const selected = new Set(ids);
    const available = players.filter((player) => isPlayerAvailable(player, quarter));
    if (selected.size !== ids.length) warnings.push(`${quarter}Q에 중복으로 배치된 선수가 있습니다.`);
    if (ids.length < formation.players) warnings.push(`${quarter}Q 참가 가능 인원 ${available.length}명 · ${formation.players}인제 기준 ${Math.max(0,formation.players-available.length)}명 부족, 미배정 ${formation.players-ids.length}자리입니다.`);
    if (ids.length < formation.players && available.length >= formation.players) warnings.push(`${quarter}Q 참가 인원은 충분합니다. 골키퍼 전용 출전·수동 고정 조건과 빈 자리(${formation.positions.filter((_, index) => !match.lineups[quarter]?.[index]).map(slot=>slot.label).join(", ")})를 확인해 주세요.`);
    if (ids.length > formation.players) warnings.push(`${quarter}Q 출전 인원이 포메이션 정원 ${formation.players}명을 초과합니다.`);
    for (const id of selected) {
      const player = playerById.get(id);
      if (!player) warnings.push(`${quarter}Q에 명단에 없는 선수가 배치되어 있습니다.`);
      else if (!isPlayerAvailable(player, quarter)) warnings.push(`${player.name}: ${quarter}Q는 참가할 수 없는 시간입니다.`);
    }
    for (const [index, id] of (match.lineups[quarter] ?? []).entries()) {
      const player = playerById.get(id);
      const target = formation.positions[index];
      if (player && target?.position === "GK" && !canKeep(player) && match.manualLineups?.[quarter]?.[index] !== player.id) warnings.push(`${player.name}: ${quarter}Q 골키퍼 출전 허용을 확인해 주세요.`);

    }
    for (const [index,id] of Object.entries(match.manualLineups?.[quarter]||{})) {
      if(match.lineups[quarter]?.[Number(index)]!==id)warnings.push(`${quarter}Q ${formation.positions[Number(index)]?.label||index}: 수동 고정을 유지할 수 없습니다. 참가 여부·가능 시간·중복 고정을 확인해 주세요.`);
    }
    const goalkeeper = playerById.get(match.lineups[quarter]?.[0]);
    if (!goalkeeper || (!canKeep(goalkeeper) && match.manualLineups?.[quarter]?.[0] !== goalkeeper.id)) warnings.push(`${quarter}Q 골키퍼를 지정해 주세요${available.some(canKeep) ? "." : " · 참가 가능한 골키퍼가 없습니다."}`);
    if (quarter < boundedQuarters(match)) {
      const next = new Set(match.lineups[quarter + 1] ?? []);
      const consecutive = available.filter((player) => isPlayerAvailable(player, quarter + 1) && !selected.has(player.id) && !next.has(player.id));
      if (consecutive.length) warnings.push(`${consecutive.map((player) => player.name).join(", ")}: ${quarter}–${quarter + 1}Q 연속 휴식입니다.`);
      const shared = available.filter((player) => isPlayerAvailable(player, quarter + 1)).length;
      const pairCapacity = formation.players + getQuarterFormation(match, quarter + 1).players;
      if (shared > pairCapacity) warnings.push(`${quarter}–${quarter + 1}Q 모두 참가하는 선수가 ${shared}명이라 연속 휴식 방지가 불가능합니다. 정원 ${pairCapacity}명 이하로 조정해 주세요.`);
    }
  }
  return [...new Set(warnings)];
}

/** Actual minutes include completed quarters only, using the immutable quarter snapshots. */
export function getPlayerMinutes(playerId: string, match: Match, actual = false): number {
  const quarters = actual ? [...new Set(match.completedQuarters)] : Array.from({ length: boundedQuarters(match) }, (_, index) => index + 1);
  if (actual && match.substitutions?.length) {
    const elapsed = quarters.reduce((sum, quarter) => {
      // A damaged cross-team duplicate must not count the same interval twice.
      const intervals = (["A", ...(match.kind === "internal" ? ["B"] : [])] as ("A" | "B")[])
        .flatMap((side) => getQuarterPlayingIntervals(match, quarter, side))
        .filter((interval) => interval.playerId === playerId)
        .sort((a, b) => a.fromSeconds - b.fromSeconds);
      let end = 0;
      return sum + intervals.reduce((seconds, interval) => {
        const start = Math.max(end, interval.fromSeconds);
        end = Math.max(end, interval.toSeconds);
        return seconds + Math.max(0, interval.toSeconds - start);
      }, 0) / 60;
    }, 0);
    return Math.round(elapsed * 10) / 10;
  }
  const lineups = actual ? match.actualLineups : match.lineups;
  const otherLineups = match.kind === "internal" ? (actual ? match.internal?.actualLineupsB : match.internal?.lineupsB) : undefined;
  const elapsed = quarters.reduce((minutes, quarter) => {
    if (!(lineups[quarter] ?? []).includes(playerId) && !(otherLineups?.[quarter] ?? []).includes(playerId)) return minutes;
    const clock = actual ? match.clocks?.[quarter] : undefined;
    return minutes + (clock && clock.startedAt === null ? clock.elapsedSeconds / 60 : match.minutes);
  }, 0);
  return Math.round(elapsed * 10) / 10;
}
