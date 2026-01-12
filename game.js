const SAVE_KEY="training_idle_v2_0";
const TRACKS=[{id:"run",name:"Run",icon:"🏃",main:"vo2",alt:"endurance"},{id:"bike",name:"Bike",icon:"🚴",main:"endurance",alt:"technique"},{id:"swim",name:"Swim",icon:"🏊",main:"recovery",alt:"endurance"},{id:"hike",name:"Hike",icon:"⛰️",main:"strength",alt:"endurance"}];
const RACES={"5k":{name:"5K",km:5,focus:"speed"},"10k":{name:"10K",km:10,focus:"steady"},"hm":{name:"Half",km:21.1,focus:"endurance"},"fm":{name:"Marathon",km:42.2,focus:"endurance"}};
const FORM=[{emoji:"😫",mult:.90,color:"bad"},{emoji:"😐",mult:1.00,color:"warn"},{emoji:"🙂",mult:1.06,color:"good"},{emoji:"🔥",mult:1.12,color:"good"}];

const state={money:0,energy:70,energyMax:100,fitness:1,formIdx:2,
  vo2:25,endurance:8,strength:6,recovery:8,technique:5,
  unlocked:{run:1,bike:1,swim:1,hike:1},gear:{shoes:0,goggles:0,towel:0,windbreaker:0},
  autoRepeat:true,training:null,lastOutcome:null,overlayUntil:0,lastSeen:Date.now()
};

const $=id=>document.getElementById(id);
const el={
  energyBar:$("energyBar"),energyText:$("energyText"),fitnessText:$("fitnessText"),formText:$("formText"),moneyText:$("moneyText"),
  trackFill:$("trackFill"),runner:$("runner"),stageMode:$("stageMode"),stageNow:$("stageNow"),stagePct:$("stagePct"),
  stageOverlay:$("stageOverlay"),confetti:$("confetti"),
  tabs:[...document.querySelectorAll(".tabBtn")],
  panels:{training:$("tab-training"),race:$("tab-race"),shop:$("tab-shop"),settings:$("tab-settings")},
  tracks:$("tracks"),levels:$("levels"),selectedText:$("selectedText"),startBtn:$("startBtn"),hint:$("hint"),
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
function trainingCostEnergy(lv){const gear=1-state.gear.shoes*.02;return Math.max(6,Math.floor((8+lv*3)*gear));}
function levelDurationMs(lv){return(18+lv*7)*1000;}
function baseMoneyReward(lv){return Math.floor(6+lv*4.5);}
function trainingSuccessProb(trackId,lv){
  const t=TRACKS.find(x=>x.id===trackId);
  const main=state[t.main],alt=state[t.alt],fit=state.fitness;
  const skill=main*.85+alt*.45+fit*.25;
  const req=20+lv*9;
  let p=1/(1+Math.exp(-(skill-req)/6.5));
  p=clamp(p,.05,.95);
  p*=FORM[state.formIdx].mult;
  return clamp(p,.03,.97);
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

function setOverlay(text,kind){
  el.stageOverlay.classList.remove("hidden");
  el.stageOverlay.classList.add("show");
  el.stageOverlay.textContent=text;
  el.stageOverlay.style.color=kind==="good"?"rgba(34,197,94,.95)":kind==="warn"?"rgba(251,191,36,.98)":"rgba(248,113,113,.98)";
  state.overlayUntil=now()+900;
}
function spawnConfetti(){
  el.confetti.innerHTML="";
  const colors=["#60a5fa","#34d399","#fbbf24","#a78bfa","#fb7185"];
  for(let i=0;i<14;i++){
    const d=document.createElement("div");
    d.className="confettiPiece";
    d.style.left=`${Math.floor(rand01()*96)+2}%`;
    d.style.animationDelay=`${Math.floor(rand01()*180)}ms`;
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
  el.runner.classList.toggle("run",!!state.training);
  el.runner.classList.toggle("good",state.formIdx>=2);
  el.runner.classList.toggle("bad",state.formIdx<=0);

  if(!state.training){el.stageMode.textContent="Idle"; el.stageNow.textContent="Pick a training below.";}
  else if(state.training.kind==="training"){
    const t=TRACKS.find(x=>x.id===state.training.id);
    el.stageMode.textContent=`${t.icon} Training`;
    el.stageNow.textContent=`${t.name} Lv${state.training.level}`;
  }else{
    el.stageMode.textContent="🏁 Race";
    el.stageNow.textContent=RACES[state.training.id].name;
  }

  if(state.overlayUntil && now()>state.overlayUntil){
    el.stageOverlay.classList.remove("show"); el.stageOverlay.classList.add("hidden");
    el.confetti.innerHTML=""; state.overlayUntil=0;
  }
}
function renderHUD(){
  updateForm();
  state.fitness=computeFitness();
  const e=clamp(state.energy,0,state.energyMax);
  el.energyText.textContent=fmt0(e);
  el.energyBar.style.width=`${Math.floor((e/state.energyMax)*100)}%`;
  el.moneyText.textContent=fmt0(state.money);
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
  let outcome="fail";
  if(roll<p*.18) outcome="great";
  else if(roll<p) outcome="success";
  else if(roll<clamp(p+.10,0,.98)) outcome="struggle";
  const t=TRACKS.find(x=>x.id===trackId);
  const moneyGain=Math.floor(baseMoneyReward(lv)* (outcome==="great"?1.25:outcome==="success"?1.0:outcome==="struggle"?0.65:0.25));
  state.money+=moneyGain;
  const gainBase=.55+lv*.22;
  const gainMul=outcome==="great"?1.25:outcome==="success"?1.0:outcome==="struggle"?0.70:0.35;
  state[t.main]+=gainBase*1.00*gainMul;
  state[t.alt]+=gainBase*0.55*gainMul;

  if(outcome!=="fail"){
    const cleared=state.unlocked[trackId]||1;
    if(lv===cleared+1) state.unlocked[trackId]=cleared+1;
  }
  state.fitness=computeFitness();

  if(outcome==="great"||outcome==="success"){setOverlay("SUCCESS", "good"); spawnConfetti();}
  else if(outcome==="struggle"){setOverlay("BARELY","warn");}
  else setOverlay("FAIL","bad");

  state.training=null;

  if(state.autoRepeat){
    const nextLv=Math.min(lv,(state.unlocked[trackId]||1)+1);
    if(state.energy>=trainingCostEnergy(nextLv)) startTraining(trackId,nextLv);
    else toast("Too tired. Rest or buy recovery gear.");
  }
  save(); renderAll(); return true;
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
  const raceId=state.training.id; const r=RACES[raceId];
  const form=FORM[state.formIdx].mult;
  const enduranceBias=(r.focus==="endurance")?1.0:0.55;
  const score=(state.fitness*.90+state.vo2*.8+state.endurance*.9*enduranceBias+state.technique*.25)*form;
  const field=2500+r.km*80;
  const rank=clamp(Math.floor(field-score*6.2+rand01()*120),1,field);
  const placePct=1-(rank/field);
  const prize=Math.max(10,Math.floor(25+placePct*140+r.km*2));
  state.money+=prize;
  state.technique+=0.4+placePct*0.8;
  state.fitness=computeFitness();
  const text=(rank<=field*.06)?"PODIUM!":(rank<=field*.25)?"GREAT!":(rank<=field*.60)?"FINISH":"SURVIVED";
  setOverlay(text, rank<=field*.25?"good":rank<=field*.60?"warn":"bad");
  if(rank<=field*.25) spawnConfetti();
  state.training=null;
  el.raceResult.textContent=`${r.name}: Rank #${rank} / ${field} • Prize +$${prize}`;
  save(); renderAll(); return true;
}

function renderRace(){
  for(const c of el.raceCards) c.classList.toggle("active",c.dataset.race===selectedRace);
  el.raceBtn.disabled=!canRace();
}

let toastTimer=null;
function toast(msg){
  el.hint.textContent=msg;
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{el.hint.textContent="Tip: Clear higher levels for faster growth and better races.";},2600);
}

function renderAll(){
  renderHUD(); renderStage();
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
