import type { Formation, FormationSlot, Match, Player } from "./football";

type Cost = [number, number, number];
type Edge = { to: number; reverse: number; capacity: number; cost: Cost };
const plus = (a: Cost, b: Cost): Cost => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const less = (a: Cost, b: Cost) => a[0] < b[0] || a[0] === b[0] && (a[1] < b[1] || a[1] === b[1] && a[2] < b[2]);
const available = (p: Player, q: number) => p.attending && q >= p.availableFrom && q <= p.availableUntil;
const legal = (p: Player, slot: FormationSlot) => slot.position === "GK" ? p.position === "GK" || p.secondaryPosition === "GK" : p.position !== "GK";
const hash = (s: string) => { let value=2166136261; for (const letter of s) value=Math.imul(value^letter.charCodeAt(0),16777619); return value>>>0; };
export const isAllocationQuarterLocked = (match: Match, q: number) => match.status === "finished" || match.completedQuarters.includes(q) || !!match.clocks?.[q] || match.actualLineups[q] !== undefined || (match.status === "live" && !Object.keys(match.clocks || {}).length && match.currentQuarter === q);

/**
 * Maximum flow fills every feasible slot. Path costs are compared lexicographically:
 * 1) convex appearance cost (sum of squared total quarters), 2) position mismatch,
 * 3) retaining an existing position. No position score can buy an unfair extra quarter.
 * Player-quarter capacity one prevents duplicates, including through residual reroutes.
 */
export function optimizeLineupSchedule(input: Player[], match: Match, formations: Formation[], fitness: (player: Player, slot: FormationSlot) => number): Record<number, string[]> {
  const players=[...input].sort((a,b)=>hash(`${match.id}:${a.id}`)-hash(`${match.id}:${b.id}`)||a.id.localeCompare(b.id));
  const byId=new Map(players.map(p=>[p.id,p]));
  const lineups: Record<number,string[]>={};
  const fixed=new Map<number,Set<number>>();
  const counts=new Map(players.map(p=>[p.id,0]));
  for (let q=1;q<=formations.length;q++) {
    const locked=isAllocationQuarterLocked(match,q);
    lineups[q]=locked?[...(match.lineups[q]??match.actualLineups[q]??[])]:formations[q-1].positions.map(()=>"");
    const selected=new Set<string>(); const slots=new Set<number>();
    if (locked) {
      for(const id of new Set(match.actualLineups[q]??lineups[q])) if(counts.has(id)) counts.set(id,counts.get(id)!+1);
      lineups[q].forEach((id,i)=>{if(id)slots.add(i);});
    } else {
      for(const [key,id] of Object.entries(match.manualLineups?.[q]||{}).sort(([a],[b])=>Number(a)-Number(b))) {
        const i=Number(key), player=byId.get(id);
        // Explicit manual position overrides are allowed, but attendance never is.
        if(!formations[q-1].positions[i]||!player||!available(player,q)||selected.has(id)) continue;
        lineups[q][i]=id;selected.add(id);slots.add(i);counts.set(id,counts.get(id)!+1);
      }
    }
    fixed.set(q,slots);
  }
  const graph: Edge[][]=[];
  const node=()=>{graph.push([]);return graph.length-1;};
  const source=node(),sink=node();
  const edge=(from:number,to:number,capacity:number,cost:Cost)=>{
    const forward: Edge={to,reverse:graph[to].length,capacity,cost};
    graph[from].push(forward);graph[to].push({to:from,reverse:graph[from].length-1,capacity:0,cost:cost.map(n=>-n) as Cost});return forward;
  };
  const slotNodes=new Map<string,number>();
  for(let q=1;q<=formations.length;q++) if(!isAllocationQuarterLocked(match,q)) for(let i=0;i<formations[q-1].positions.length;i++) if(!fixed.get(q)!.has(i)) {
    const n=node();slotNodes.set(`${q}:${i}`,n);edge(n,sink,1,[0,0,0]);
  }
  const assignments: {q:number;i:number;id:string;edge:Edge}[]=[];
  for(const player of players) {
    const quarters=formations.map((_,i)=>i+1).filter(q=>!isAllocationQuarterLocked(match,q)&&available(player,q)&&!lineups[q].includes(player.id));
    const pn=node(),base=counts.get(player.id)!;
    for(let k=1;k<=quarters.length;k++) edge(source,pn,1,[2*(base+k)-1,0,0]);
    for(const q of quarters) {
      const pq=node();edge(pn,pq,1,[0,0,0]);
      formations[q-1].positions.forEach((slot,i)=>{
        const sn=slotNodes.get(`${q}:${i}`);if(sn===undefined||!legal(player,slot))return;
        const oldIndex=match.lineups[q]?.indexOf(player.id)??-1;
        const stability=oldIndex<0?0:Number(formations[q-1].positions[oldIndex]?.position!==slot.position);
        const assignment=edge(pq,sn,1,[0,100-fitness(player,slot),stability]);assignments.push({q,i,id:player.id,edge:assignment});
      });
    }
  }
  // Successive shortest augmenting paths with residual reverse edges and tuple costs.
  for(;;) {
    const distance: (Cost|null)[]=graph.map(()=>null), previousNode=graph.map(()=>-1),previousEdge=graph.map(()=>-1),queued=graph.map(()=>false);
    distance[source]=[0,0,0];const queue=[source];queued[source]=true;
    for(let head=0;head<queue.length;head++) {
      const from=queue[head];queued[from]=false;
      graph[from].forEach((e,i)=>{
        if(!e.capacity)return;const next=plus(distance[from]!,e.cost);
        if(distance[e.to]===null||less(next,distance[e.to]!)) {distance[e.to]=next;previousNode[e.to]=from;previousEdge[e.to]=i;if(!queued[e.to]){queued[e.to]=true;queue.push(e.to);}}
      });
    }
    if(distance[sink]===null)break;
    for(let n=sink;n!==source;n=previousNode[n]) {const e=graph[previousNode[n]][previousEdge[n]];e.capacity--;graph[n][e.reverse].capacity++;}
  }
  for(const a of assignments) if(a.edge.capacity===0)lineups[a.q][a.i]=a.id;
  // Equal-minute, equal-or-better-position reciprocal exchanges smooth rotations.
  const natural=(id:string):Cost=>{
    const p=byId.get(id)!;let rests=0,moves=0;
    for(let q=1;q<formations.length;q++) {
      const a=lineups[q].indexOf(id),b=lineups[q+1].indexOf(id);
      if(available(p,q)&&available(p,q+1)&&a<0&&b<0)rests++;
      if(a>=0&&b>=0&&formations[q-1].positions[a]?.position!==formations[q].positions[b]?.position)moves++;
    }
    return [rests,moves,0];
  };
  let budget=40_000;
  for(let pass=0;pass<8&&budget>0;pass++) {
    let changed=false;
    for(let q=1;q<formations.length;q++) for(let r=q+1;r<=formations.length;r++) {
      if(isAllocationQuarterLocked(match,q)||isAllocationQuarterLocked(match,r))continue;
      for(let i=0;i<lineups[q].length;i++) for(let j=0;j<lineups[r].length;j++) {
        if(--budget<0)break;
        const a=lineups[q][i],b=lineups[r][j],pa=byId.get(a),pb=byId.get(b);
        if(!pa||!pb||a===b||fixed.get(q)!.has(i)||fixed.get(r)!.has(j)||lineups[q].includes(b)||lineups[r].includes(a)||!available(pb,q)||!available(pa,r))continue;
        const sq=formations[q-1].positions[i],sr=formations[r-1].positions[j];if(!legal(pb,sq)||!legal(pa,sr))continue;
        const beforeFitness=fitness(pa,sq)+fitness(pb,sr),afterFitness=fitness(pb,sq)+fitness(pa,sr);
        if(afterFitness<beforeFitness)continue;
        const before=plus(natural(a),natural(b));lineups[q][i]=b;lineups[r][j]=a;
        if(afterFitness>beforeFitness||less(plus(natural(a),natural(b)),before))changed=true;
        else {lineups[q][i]=a;lineups[r][j]=b;}
      }
    }
    if(!changed)break;
  }
  return lineups;
}
