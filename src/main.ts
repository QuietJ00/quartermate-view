import "./style.css";
import { createDemoState } from "./demo-data.ts";
import {
  FORMATIONS,
  generateLineups,
  getPlayerMinutes,
  getQuarterFormation,
  isPlayerAvailable,
} from "./engine/football.ts";

const formationInput = document.querySelector<HTMLSelectElement>("#formation")!;
const durationInput = document.querySelector<HTMLSelectElement>("#duration")!;
const quarterList = document.querySelector<HTMLDivElement>("#quarters")!;
const lineupList = document.querySelector<HTMLOListElement>("#lineup")!;
const rosterBody = document.querySelector<HTMLTableSectionElement>("#roster")!;
const warning = document.querySelector<HTMLParagraphElement>("#warning")!;
const benchText = document.querySelector<HTMLParagraphElement>("#bench")!;
const coverage = document.querySelector<HTMLSpanElement>("#coverage")!;
const attendance = document.querySelector<HTMLSpanElement>("#attendance")!;
const summary = document.querySelector<HTMLParagraphElement>("#summary")!;

let { match, players } = createDemoState();
let selectedQuarter = 1;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, className = "") {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}

for (const size of [11, 7]) {
  const group = document.createElement("optgroup");
  group.label = `${size}인제`;
  for (const formation of FORMATIONS.filter((item) => item.players === size)) {
    group.append(new Option(formation.name, formation.id));
  }
  formationInput.append(group);
}
formationInput.value = match.formation;

const quarterButtons = Array.from({ length: match.quarters }, (_, index) => {
  const quarter = index + 1;
  const button = element("button", `${quarter}Q`);
  button.type = "button";
  button.setAttribute("aria-label", `${quarter}쿼터`);
  button.addEventListener("click", () => {
    selectedQuarter = quarter;
    renderQuarter();
  });
  quarterList.append(button);
  return button;
});

const minutesCells = new Map<string, HTMLTableCellElement>();
const attendanceInputs = new Map<string, HTMLInputElement>();
for (const player of players) {
  const row = document.createElement("tr");
  const name = element("th", player.name, "player-name");
  name.scope = "row";
  if (player.availableFrom > 1) name.append(element("small", `${player.availableFrom}Q부터`));
  const position = element("td", player.position, "position");
  const attendanceCell = document.createElement("td");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = player.attending;
  checkbox.setAttribute("aria-label", `${player.name} 참석`);
  checkbox.addEventListener("change", () => {
    players = players.map((entry) => entry.id === player.id ? { ...entry, attending: checkbox.checked } : entry);
    replan();
  });
  attendanceCell.append(checkbox);
  attendanceInputs.set(player.id, checkbox);
  const minutes = element("td", "", "minutes");
  minutesCells.set(player.id, minutes);
  row.append(name, position, attendanceCell, minutes);
  rosterBody.append(row);
}

function renderQuarter() {
  quarterButtons.forEach((button, index) => {
    button.setAttribute("aria-pressed", String(index + 1 === selectedQuarter));
  });
  const formation = getQuarterFormation(match, selectedQuarter);
  const ids = match.lineups[selectedQuarter] ?? [];
  const filled = ids.filter(Boolean).length;
  coverage.textContent = `${filled} / ${formation.players} 배치`;
  lineupList.setAttribute("aria-label", `${selectedQuarter}쿼터 출전 선수`);
  lineupList.replaceChildren(...formation.positions.map((slot, index) => {
    const player = players.find((entry) => entry.id === ids[index]);
    const marker = element("li", "", player ? "marker" : "marker empty");
    marker.style.left = `${slot.x}%`;
    marker.style.top = `${slot.y}%`;
    marker.append(element("span", player ? String(player.number).padStart(2, "0") : "—", "jersey"));
    marker.append(element("span", slot.label, "slot"));
    marker.append(element("span", player ? ` ${player.name}` : " 미배치", "sr-only"));
    return marker;
  }));
  const bench = players.filter((player) => isPlayerAvailable(player, selectedQuarter) && !ids.includes(player.id));
  benchText.textContent = bench.length ? `대기 ${bench.map((player) => player.name).join(" · ")}` : "대기 선수 없음";
  warning.hidden = filled === formation.players;
  warning.textContent = `빈 포지션 ${formation.positions.filter((_, index) => !ids[index]).map((slot) => slot.label).join(", ")}`;
  summary.textContent = `${selectedQuarter}쿼터, ${formation.players}자리 중 ${filled}자리 배치. 참석 ${players.filter((player) => player.attending).length}명.`;
}

function replan() {
  const { lineups } = generateLineups(players, { ...match, lineups: {} });
  match = { ...match, lineups };
  attendance.textContent = `${players.filter((player) => player.attending).length} / ${players.length}명 참석`;
  for (const player of players) {
    minutesCells.get(player.id)!.textContent = `${getPlayerMinutes(player.id, match)}분`;
  }
  renderQuarter();
}

formationInput.addEventListener("change", () => {
  match = { ...match, formation: formationInput.value };
  replan();
});
durationInput.addEventListener("change", () => {
  match = { ...match, minutes: Number(durationInput.value) };
  replan();
});
document.querySelector<HTMLButtonElement>("#reset")!.addEventListener("click", () => {
  ({ match, players } = createDemoState());
  selectedQuarter = 1;
  formationInput.value = match.formation;
  durationInput.value = String(match.minutes);
  for (const player of players) attendanceInputs.get(player.id)!.checked = player.attending;
  replan();
});

replan();
