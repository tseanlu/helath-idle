const SAVE_KEY="training_idle_v2_3";
const TRACKS=[{id:"run",name:"Run",icon:"🏃",main:"vo2",alt:"endurance"},{id:"bike",name:"Bike",icon:"🚴",main:"endurance",alt:"technique"},{id:"swim",name:"Swim",icon:"🏊",main:"recovery",alt:"endurance"},{id:"hike",name:"Hike",icon:"⛰️",main:"strength",alt:"endurance"}];
const RACES={"5k":{name:"5K",km:5,focus:"speed"},"10k":{name:"10K",km:10,focus:"steady"},"hm":{name:"Half",km:21.1,focus:"endurance"},"fm":{name:"Marathon",km:42.2,focus:"endurance"}};
const FORM=[{emoji:"😫",mult:.90,color:"bad"},{emoji:"😐",mult:1.00,color:"warn"},{emoji:"🙂",mult:1.06,color:"good"},{emoji:"🔥",mult:1.12,color:"good"}];

const state={money:0,rankPoints:0,energy:70,energyMax:100,fitness:1,formIdx:2,
  vo2:25,endurance:8,strength:6,recovery:8,technique:5,
  unlocked:{run:1,bike:1,swim:1,hike:1},
  queue:[],lastGains:null,gear:{shoes:0,goggles:0,towel:0,windbreaker:0},
  autoRepeat:true,training:null,lastOutcome:null,overlayUntil:0,lastSeen:Date.now()
};

const $=id=>document.getElementById(id);
const el={
  energyBar:$("energyBar"),energyText:$("energyText"),fitnessText:$("fitnessText"),formText:$("formText"),moneyText:$("moneyText"),rankText:$("rankText"),
  trackFill:$("trackFill"),runner:$("runner"),stageMode:$("stageMode"),stageNow:$("stageNow"),stagePct:$("stagePct"),
  stageOverlay:$("stageOverlay"),confetti:$("confetti"),
  fxLayer:$("fxLayer"),
  lane:document.querySelector(".lane"),
  tabs:[...document.querySelectorAll(".tabBtn")],
  panels:{training:$("tab-training"),race:$("tab-race"),shop:$("tab-shop"),settings:$("tab-settings")},
  tracks:$("tracks"),levels:$("levels"),selectedText:$("selectedText"),startBtn:$("startBtn"),clearQueueBtn:$("clearQueueBtn"),queueList:$("queueList"),queueHint:$("queueHint"),gainMoney:$("gainMoney"),gainMain:$("gainMain"),gainAlt:$("gainAlt"),gainRank:$("gainRank"),gainMainName:$("gainMainName"),gainAltName:$("gainAltName"),hint:$("hint"),
  autoRepeatToggle:$("autoRepeatToggle"),
  raceCards:[...document.querySelectorAll(".raceCard")],raceBtn:$("raceBtn"),raceResult:$("raceResult"),
  shopGrid:$("shopGrid"),
  exportBtn:$("exportBtn"),importBtn:$("importBtn"),resetBtn:$("resetBtn"),debug:$("debug"),
};

let selected={trackId:"run",level:1};
let selectedRace="5k";

const now=()=>Date.now();
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const rand01=()=>Math.random();
const fmt0=n=>Math.floor(n).toString();
const msToClock=ms=>{const s=Math.max(0,Math.floor(ms/1000));const m=Math.floor(s/60);const r=s%60;return m>0?`${m}m ${r}s`:`${r}s`;};

function energyRegenPerSec(){const gear=1+state.gear.towel*.03+state.gear.windbreaker*.01;return(.45+state.recovery*.018)*gear;}
function trainingCostEnergy(lv){
  // 成本也要有坡度：Lv7+ 明顯更累
  // 鞋子：最多 -12% 體力消耗（避免裝備爆炸）
  const shoesLvl = (state.gear && typeof state.gear.shoes==="number") ? state.gear.shoes : 0;
  const gearMul = 1 - Math.min(0.12, shoesLvl * 0.01);
  const base = 10 + lv*3 + Math.max(0, lv-6)*2;
  return Math.max(8, Math.floor(base * gearMul));
}
function levelDurationMs(lv){
  // 時間也有坡度：後期明顯更長（逼玩家做取捨）
  const sec = 22 + lv*7 + Math.max(0, lv-6)*6;
  return sec * 1000;
}
function baseMoneyReward(lv){return Math.floor(6+lv*4.5);}
function trainingSuccessProb(trackId,lv){
  // 曲線需求：前期好過、後期陡升（需要綜合能力）
  const t=TRACKS.find(x=>x.id===trackId);
  const main=state[t.main], alt=state[t.alt];
  const form=FORM[state.formIdx].mult;

  // requirement curve (front-flat, back-steep)
  const req = 22 + lv*12 + Math.pow(Math.max(0, lv-5), 2) * 2;

  // effective power: main matters most, alt supports; fitness acts as global "base"
  const power = (main*0.92 + alt*0.55 + state.fitness*0.22) * form;

  // Map power vs req into probability band
  const ratio = power / Math.max(1, req);
  // center ~0.65 at ratio=1; steeper around threshold
  const p = clamp(0.08 + 0.92*(1/(1+Math.exp(-7*(ratio-1)))), 0.02, 0.98);
  return p;
}
function computeFitness(){
  const base=state.vo2*1.2+state.endurance*1.0+state.strength*.8+state.recovery*.7+state.technique*.6;
  const gearMul=1+state.gear.shoes*.03+state.gear.goggles*.02+state.gear.windbreaker*.015;
  return Math.max(1,Math.floor(base*.55*gearMul));
}
function updateForm(){
  const r=state.energy/state.energyMax;
  let idx=r<.25?0:r<.50?1:r<.78?2:3;
  if(state.recovery>=14 && idx<3) idx+=1;
  state.formIdx=clamp(idx,0,3);
}

function save(){localStorage.setItem(SAVE_KEY,JSON.stringify({...state,lastSeen:now()}));}
function load(){const raw=localStorage.getItem(SAVE_KEY);if(!raw) return false; try{Object.assign(state,JSON.parse(raw));return true;}catch{ return false;}}
function offlineProgress(){const sec=clamp((now()-state.lastSeen)/1000,0,12*3600);state.energy=clamp(state.energy+energyRegenPerSec()*sec,0,state.energyMax);updateForm();}

function tabTo(id){
  for(const b of el.tabs) b.classList.toggle("active",b.dataset.tab===id);
  for(const k of Object.keys(el.panels)) el.panels[k].classList.toggle("active",k===id);
}


function ensureFX(kind){
  if(!el.fxLayer) return;
  el.fxLayer.innerHTML = kind ? `<div class="fx ${kind} show"></div>` : "";
}
function runnerEmojiFor(kind){
  switch(kind){
    case "swim": return "🏊";
    case "bike": return "🚴";
    case "hike": return "🥾";
    default: return "🏃";
  }
}
function applyFormPose(){
  el.runner.classList.remove("fire","good","neutral","tired");
  if(state.formIdx===3) el.runner.classList.add("fire");
  else if(state.formIdx===2) el.runner.classList.add("good");
  else if(state.formIdx===1) el.runner.classList.add("neutral");
  else el.runner.classList.add("tired");
}

function pctClass(p){return p>=.70?"good":p>=.45?"warn":"bad";}

function renderTracks(){
  el.tracks.innerHTML="";
  for(const t of TRACKS){
    const div=document.createElement("div");
    div.className="trackCard"+(selected.trackId===t.id?" active":"");
    const unlocked=state.unlocked[t.id]||1;
    div.innerHTML=`<div class="trackName">${t.icon} ${t.name}</div><div class="trackMeta">Cleared: Lv${unlocked} • Focus: ${t.main.toUpperCase()}</div>`;
    div.onclick=()=>{selected.trackId=t.id; selected.level=clamp(selected.level,1,unlocked+1); renderTracks(); renderLevels(); renderSelected();};
    el.tracks.appendChild(div);
  }
}
function renderLevels(){
  el.levels.innerHTML="";
  const unlocked=state.unlocked[selected.trackId]||1;
  for(let lv=1;lv<=10;lv++){
    const p=trainingSuccessProb(selected.trackId,lv);
    const dur=levelDurationMs(lv);
    const cost=trainingCostEnergy(lv);
    const money=baseMoneyReward(lv);
    const locked=(lv>unlocked+1);
    const btn=document.createElement("button");
    btn.className="levelBtn"+(locked?" locked":"")+(lv===selected.level?" active":"");
    btn.disabled=locked;
    btn.innerHTML=`<div class="levelRow"><b>Lv${lv}</b><span class="pct ${pctClass(p)}">${Math.floor(p*100)}%</span></div>
      <div class="muted small">⏱ ${msToClock(dur)} • ⚡ -${cost}</div><div class="muted small">+$${money}</div>`;
    btn.onclick=()=>{selected.level=lv; renderLevels(); renderSelected();};
    el.levels.appendChild(btn);
  }
}
function renderSelected(){
  const t=TRACKS.find(x=>x.id===selected.trackId);
  const p=trainingSuccessProb(selected.trackId,selected.level);
  const dur=levelDurationMs(selected.level);
  const cost=trainingCostEnergy(selected.level);
  el.selectedText.textContent=`${t.icon} ${t.name} • Lv${selected.level} • ${Math.floor(p*100)}% • ⏱ ${msToClock(dur)} • ⚡ -${cost}`;
  el.startBtn.disabled=!!state.training || state.energy<cost;
}
function renderShop(){
  const items=[
    {id:"shoes",name:"Shoes",icon:"👟",desc:"Cheaper training energy cost.",base:40,growth:1.45,max:10},
    {id:"towel",name:"Towel",icon:"🧻",desc:"Faster energy recovery.",base:35,growth:1.40,max:10},
    {id:"goggles",name:"Goggles",icon:"🥽",desc:"Boost race stability.",base:55,growth:1.55,max:10},
    {id:"windbreaker",name:"Windbreaker",icon:"🧥",desc:"Small overall bonus.",base:60,growth:1.55,max:10},
  ];
  el.shopGrid.innerHTML="";
  for(const it of items){
    const level=state.gear[it.id]||0;
    const price=Math.floor(it.base*Math.pow(it.growth,level));
    const canBuy=state.money>=price && level<it.max;
    const card=document.createElement("div");
    card.className="shopItem";
    card.innerHTML=`<div class="shopTop"><div class="shopName">${it.icon} ${it.name} <span class="muted small">Lv${level}</span></div><div class="muted"><b>$${price}</b></div></div>
      <div class="shopDesc">${it.desc}</div>
      <div class="shopBottom"><button class="btn ${canBuy?"primary":""}" ${canBuy?"":"disabled"}>Buy</button><span class="muted small">${level>=it.max?"Maxed":""}</span></div>`;
    card.querySelector("button").onclick=()=>{if(!canBuy) return; state.money-=price; state.gear[it.id]=level+1; state.fitness=computeFitness(); save(); renderAll(); toast(`Bought ${it.name} Lv${state.gear[it.id]}`);};
    el.shopGrid.appendChild(card);
  }
}
function renderDebug(){
  el.debug.textContent=JSON.stringify({
    vo2:+state.vo2.toFixed(2),endurance:+state.endurance.toFixed(2),strength:+state.strength.toFixed(2),
    recovery:+state.recovery.toFixed(2),technique:+state.technique.toFixed(2),
    unlocked:state.unlocked,gear:state.gear
  },null,2);
}

function setOverlay(text,grade){
  // grade: perfect | success | barely | fail
  el.stageOverlay.classList.remove("hidden");
  el.stageOverlay.classList.add("show");
  el.stageOverlay.textContent=text;

  el.stageOverlay.classList.remove("perfect","success","barely","fail");
  if(grade) el.stageOverlay.classList.add(grade);

  const color = grade==="perfect" ? "rgba(251,191,36,.98)"
              : grade==="success" ? "rgba(34,197,94,.95)"
              : grade==="barely"  ? "rgba(251,191,36,.98)"
              : "rgba(248,113,113,.98)";
  el.stageOverlay.style.color=color;

  el.runner.classList.remove("jump","fall");
  el.lane?.classList.remove("shake");
  if(grade==="perfect") el.runner.classList.add("jump");
  if(grade==="barely") el.lane?.classList.add("shake");
  if(grade==="fail") el.runner.classList.add("fall");

  state.overlayUntil=now()+1050;
}
function spawnConfetti(intensity=1){
  el.confetti.innerHTML="";
  const colors=["#60a5fa","#34d399","#fbbf24","#a78bfa","#fb7185"];
  const count = intensity>=2 ? 24 : 14;
  for(let i=0;i<count;i++){
    const d=document.createElement("div");
    d.className="confettiPiece";
    d.style.left=`${Math.floor(rand01()*96)+2}%`;
    d.style.animationDelay=`${Math.floor(rand01()*220)}ms`;
    d.style.background=colors[i%colors.length];
    el.confetti.appendChild(d);
  }
}
function renderStage(){
  let pct=0;
  if(state.training){
    pct=clamp((now()-state.training.startedAt)/(state.training.endAt-state.training.startedAt),0,1);
  }
  el.trackFill.style.width=`${Math.floor(pct*100)}%`;
  el.stagePct.textContent=`${Math.floor(pct*100)}%`;

  const leftPct=state.training?(pct*92):6;
  el.runner.style.left=`calc(${leftPct}% - 8px)`;

  // alive feel
  el.runner.classList.add("run");
  applyFormPose();

  if(!state.training){
    el.stageMode.textContent="Idle";
    el.stageNow.textContent="Pick a training below.";
    ensureFX(null);
    el.runner.textContent="🏃";
  }else if(state.training.kind==="training"){
    const t=TRACKS.find(x=>x.id===state.training.id);
    el.stageMode.textContent=`${t.icon} Training`;
    el.stageNow.textContent=`${t.name} Lv${state.training.level}`;
    const fxMap={run:"speed",swim:"splash",bike:"gear",hike:"dust"};
    ensureFX(fxMap[t.id]||"speed");
    el.runner.textContent=runnerEmojiFor(t.id);
  }else{
    el.stageMode.textContent="🏁 Race";
    el.stageNow.textContent=RACES[state.training.id].name;
    ensureFX("speed");
    el.runner.textContent="🏃";
  }

  if(state.overlayUntil && now()>state.overlayUntil){
    el.stageOverlay.className="stageOverlay hidden";
    el.confetti.innerHTML="";
    state.overlayUntil=0;
    el.runner.classList.remove("jump","fall");
    el.lane?.classList.remove("shake");
  }
}
function renderHUD(){
  updateForm();
  state.fitness=computeFitness();
  const e=clamp(state.energy,0,state.energyMax);
  el.energyText.textContent=fmt0(e);
  el.energyBar.style.width=`${Math.floor((e/state.energyMax)*100)}%`;
  el.moneyText.textContent=Math.floor(state.money); if(el.rankText) el.rankText.textContent=Math.floor(state.rankPoints);
  el.fitnessText.textContent=fmt0(state.fitness);
  el.formText.textContent=FORM[state.formIdx].emoji;
}

function startTraining(trackId,lv){
  const cost=trainingCostEnergy(lv);
  if(state.training || state.energy<cost) return;
  state.energy-=cost;
  updateForm();
  state.training={kind:"training",id:trackId,level:lv,startedAt:now(),endAt:now()+levelDurationMs(lv)};
  save(); renderAll();
}
function resolveTraining(){
  if(!state.training || state.training.kind!=="training") return false;
  if(now()<state.training.endAt) return false;

  const trackId=state.training.id,lv=state.training.level;
  const p=trainingSuccessProb(trackId,lv);
  const roll=rand01();

  // 4-tier outcome
  let grade="fail";
  const perfectGate = clamp(p*0.18*(state.formIdx>=2?1.12:0.88),0.02,0.20);
  const barelyGate  = clamp(p + 0.10,0.05,0.98);

  if(roll < perfectGate) grade="perfect";
  else if(roll < p) grade="success";
  else if(roll < barelyGate) grade="barely";
  else grade="fail";

  const t=TRACKS.find(x=>x.id===trackId);

  // Money reward (keep motivating, but not runaway)
  const moneyBase = baseMoneyReward(lv);
  const moneyMul = grade==="perfect"?0.55 : grade==="success"?0.40 : grade==="barely"?0.25 : 0.05;
  const moneyGain = Math.max(1, Math.floor(moneyBase * moneyMul));
  state.money += moneyGain;

  // Growth: front-fast, later still meaningful but slower; FAIL gives very little
  const gainBase = 0.45 + lv*0.16;
  const gainMul  = grade==="perfect"?1.30 : grade==="success"?1.00 : grade==="barely"?0.70 : 0.15;

  state[t.main] += gainBase*1.00*gainMul;
  state[t.alt]  += gainBase*0.55*gainMul;

  // Unlock progression: require SUCCESS+; PERFECT feels great but doesn't skip levels
  if(grade==="perfect" || grade==="success"){
    const cleared=state.unlocked[trackId]||1;
    if(lv===cleared+1) state.unlocked[trackId]=cleared+1;
  }

  state.fitness = computeFitness();
  // record last gains (for UI)
  state.lastGains={
    type:"training",
    trackId:trackId,level:lv,grade:grade,
    money:moneyGain,
    mainKey:t.main,altKey:t.alt,
    mainDelta:gainBase*1.00*gainMul,
    altDelta:gainBase*0.55*gainMul,
    rank:0
  };


  // Feedback
  if(grade==="perfect"){
    setOverlay("PERFECT!!","perfect"); spawnConfetti(2);
    toast(`PERFECT! +$${moneyGain}`);
  }else if(grade==="success"){
    setOverlay("SUCCESS","success"); spawnConfetti(1);
    toast(`Success +$${moneyGain}`);
  }else if(grade==="barely"){
    setOverlay("BARELY","barely");
    toast(`Barely made it… +$${moneyGain}`);
  }else{
    setOverlay("FAIL","fail");
    toast("Failed. Rest & try again.");
  }

  state.training=null;

  // auto repeat
  if(state.autoRepeat){
    const nextLv=Math.min(lv,(state.unlocked[trackId]||1)+1);
    if(state.energy>=trainingCostEnergy(nextLv)) startTraining(trackId,nextLv);
  }

  tryStartNextFromQueue(); save(); renderAll(); return true;
}

function raceDurationMs(raceId){const km=RACES[raceId].km; return Math.floor((14+km*2.2)*1000);}
function canRace(){return !state.training && state.energy>=18;}
function startRace(raceId){
  if(!canRace()) return;
  state.energy-=18; updateForm();
  state.training={kind:"race",id:raceId,level:1,startedAt:now(),endAt:now()+raceDurationMs(raceId)};
  save(); renderAll();
}
function resolveRace(){
  if(!state.training || state.training.kind!=="race") return false;
  if(now()<state.training.endAt) return false;

  const raceId=state.training.id;
  const r=RACES[raceId];
  const form=FORM[state.formIdx].mult;

  const enduranceBias=(r.focus==="endurance")?1.0:0.55;
  const score=(state.fitness*.90+state.vo2*.8+state.endurance*.9*enduranceBias+state.technique*.25)*form;

  const field=2500+r.km*80;
  const rank=clamp(Math.floor(field-score*6.2+rand01()*120),1,field);
  const placePct=1-(rank/field);
  const prize=Math.max(10,Math.floor(25+placePct*140+r.km*2));

  state.money += prize;
  // Rank points: main reason to race (unlocks better events / items)
  const rp = Math.max(1, Math.floor(4 + placePct*22 + r.km*0.6));
  state.rankPoints += rp;

  state.technique += 0.4 + placePct*0.8;
  state.fitness = computeFitness();
  // record last gains (for UI)
  state.lastGains={
    type:"training",
    trackId:trackId,level:lv,grade:grade,
    money:moneyGain,
    mainKey:t.main,altKey:t.alt,
    mainDelta:gainBase*1.00*gainMul,
    altDelta:gainBase*0.55*gainMul,
    rank:0
  };


  let grade="fail";
  let text="SURVIVED";
  if(rank<=field*0.03){grade="perfect"; text="PODIUM!!";}
  else if(rank<=field*0.18){grade="success"; text="GREAT!";}
  else if(rank<=field*0.60){grade="barely"; text="FINISH";}
  else {grade="fail"; text="DNF";}

  setOverlay(text, grade);
  if(grade==="perfect") spawnConfetti(2);
  else if(grade==="success") spawnConfetti(1);

  el.raceResult.textContent=`${r.name}: Rank #${rank} / ${field} • Prize +$${prize}`;
  state.training=null;

  tryStartNextFromQueue(); save(); renderAll(); return true;
}

function renderRace(){
  for(const c of el.raceCards) c.classList.toggle("active",c.dataset.race===selectedRace);
  el.raceBtn.disabled=!canRace();
}

let toastTimer=null;
function toast(msg){
  el.hint.textContent=msg;
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{el.hint.textContent="Tip: Lv1-3 easy. Lv7+ needs balanced stats. Aim for PERFECT!!";},2600);
}

function renderAll(){
  renderHUD();
  renderQueue();
  renderGains(); renderStage();
  renderTracks(); renderLevels(); renderSelected();
  renderShop(); renderRace(); renderDebug();
}

let last=performance.now();
function tick(ts){
  const dt=clamp((ts-last)/1000,0,0.25); last=ts;
  const regen=energyRegenPerSec();
  state.energy=clamp(state.energy+regen*(state.training?.kind?0.18:1.0)*dt,0,state.energyMax);
  resolveTraining(); resolveRace();
  renderHUD(); renderStage();
  requestAnimationFrame(tick);
}

// bindings
for(const b of el.tabs) b.onclick=()=>tabTo(b.dataset.tab);
el.autoRepeatToggle.onchange=()=>{state.autoRepeat=!!el.autoRepeatToggle.checked; save();};
el.startBtn.onclick=()=>startTraining(selected.trackId,selected.level);

for(const c of el.raceCards){
  c.onclick=()=>{selectedRace=c.dataset.race; renderRace(); el.raceResult.textContent=`Selected: ${RACES[selectedRace].name}`;};
}
el.raceBtn.onclick=()=>startRace(selectedRace);

el.exportBtn.onclick=()=>{
  const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download="training-idle-save.json"; a.click();
  URL.revokeObjectURL(url);
};
el.importBtn.onclick=()=>{
  const input=document.createElement("input"); input.type="file"; input.accept="application/json";
  input.onchange=async()=>{const file=input.files?.[0]; if(!file) return;
    try{const txt=await file.text(); Object.assign(state,JSON.parse(txt)); save(); renderAll(); toast("Imported save.");}
    catch{toast("Import failed.");}
  };
  input.click();
};
el.resetBtn.onclick=()=>{if(!confirm("Reset your save?")) return; localStorage.removeItem(SAVE_KEY); location.reload();};

// init
const hasSave=load();
offlineProgress();
state.fitness=computeFitness(); updateForm();
el.autoRepeatToggle.checked=!!state.autoRepeat;

if(!hasSave){
  state.money=20; state.energy=75;
  state.vo2=25; state.endurance=8; state.strength=6; state.recovery=8; state.technique=5;
  state.fitness=computeFitness(); updateForm(); save();
}
renderAll();
requestAnimationFrame(tick);
