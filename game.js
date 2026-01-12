/* Training Idle v3 (full) – no prestige
   - Stats: VO2 (25..75), Endurance/Strength/Recovery (0..100)
   - Short-term: Fatigue (0..160), Condition (-0.15..+0.15)
   - Training tracks: Run/Bike/Swim/Hike with Lv1..Lv10
   - Races: 5K/10K/Half/Marathon (validate build; fatigue hit)
   - Shop: equipment multipliers by slot
   - Sponsor button: cooldown grows each use (2m, 5m, 10m, 30m, ...)
   - Save/load + offline resolution + daily modifiers roll
*/

const SAVE_KEY = "training_idle_v3_full";
const BUILD = "2026-01-12";

const DAY_MS = 6 * 60 * 60 * 1000;      // 6 hours per in-game day (real-time)
const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fmt1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const fmt2 = (x) => (Math.round(x * 100) / 100).toFixed(2);
const now = () => Date.now();

function rand01() { return Math.random(); }
function pick(arr){ return arr[Math.floor(Math.random() * arr.length)]; }
function msToClock(ms){
  if (ms <= 0) return "0s";
  const s = Math.floor(ms/1000);
  const hh = Math.floor(s/3600);
  const mm = Math.floor((s%3600)/60);
  const ss = s%60;
  if (hh>0) return `${hh}h ${mm}m`;
  if (mm>0) return `${mm}m ${ss}s`;
  return `${ss}s`;
}

/** ---------------- State ---------------- */
const state = {
  money: 0,

  // long-term
  vo2: 25,          // 25..75
  endurance: 8,     // 0..100
  strength: 6,
  recovery: 8,

  // short-term
  fatigue: 18,      // 0..160
  condition: 0.00,  // -0.15..+0.15

  day: 1,
  nextDailyAt: now() + DAY_MS,
  dailyMods: [],

  // training progression
  track: {
    run:  { unlockedLevel: 1, clears: Array(10).fill(0) },
    bike: { unlockedLevel: 1, clears: Array(10).fill(0) },
    swim: { unlockedLevel: 1, clears: Array(10).fill(0) },
    hike: { unlockedLevel: 1, clears: Array(10).fill(0) },
  },

  training: null, // {trackId, level, startedAt, endAt}

  // shop
  owned: {}, // itemId: true
  equipped: { shoes:null, top:null, towel:null, poles:null },

  // sponsor
  sponsorStep: 0,
  sponsorReadyAt: 0,

  lastSeen: now(),
};

/** ---------------- Content ---------------- */
const TRACKS = [
  { id:"run",  name:"Run",  icon:"🏃", main:"vo2",  alt:"endurance" },
  { id:"bike", name:"Bike", icon:"🚴", main:"endurance", alt:"strength" },
  { id:"swim", name:"Swim", icon:"🏊", main:"recovery", alt:"vo2" },
  { id:"hike", name:"Hike", icon:"⛰️", main:"strength", alt:"endurance" },
];

function levelReq(level){
  // required readiness increases gently
  // L1 ~ 0.22, L10 ~ 0.72
  return 0.18 + level * 0.055;
}

function levelDurationMs(level){
  // L1 25s -> L10 90s
  return Math.floor((20 + level*7) * 1000);
}

function levelRewardBase(level){
  // money reward baseline
  return 6 + level * 3;
}

const SHOP_ITEMS = [
  // shoes (VO2)
  { id:"shoes_1", slot:"shoes", name:"Trainer Shoes", price:60,  mult:{vo2:1.05}, desc:"+5% VO₂ (eff)" },
  { id:"shoes_2", slot:"shoes", name:"Carbon Shoes",  price:180, mult:{vo2:1.10}, desc:"+10% VO₂ (eff)" },
  { id:"shoes_3", slot:"shoes", name:"Elite Spikes",  price:420, mult:{vo2:1.16}, desc:"+16% VO₂ (eff)" },

  // top (Endurance)
  { id:"top_1", slot:"top", name:"Breathable Top", price:70,  mult:{endurance:1.06}, desc:"+6% Endurance (eff)" },
  { id:"top_2", slot:"top", name:"Aero Singlet",    price:210, mult:{endurance:1.12}, desc:"+12% Endurance (eff)" },
  { id:"top_3", slot:"top", name:"Pro Kit",         price:480, mult:{endurance:1.18}, desc:"+18% Endurance (eff)" },

  // towel (Recovery)
  { id:"towel_1", slot:"towel", name:"Cooling Towel", price:80,  mult:{recovery:1.08}, desc:"+8% Recovery (eff)" },
  { id:"towel_2", slot:"towel", name:"Foam Roller",   price:240, mult:{recovery:1.15}, desc:"+15% Recovery (eff)" },
  { id:"towel_3", slot:"towel", name:"Massage Gun",   price:520, mult:{recovery:1.22}, desc:"+22% Recovery (eff)" },

  // poles (Strength)
  { id:"poles_1", slot:"poles", name:"Grip Trainer",  price:65,  mult:{strength:1.07}, desc:"+7% Strength (eff)" },
  { id:"poles_2", slot:"poles", name:"Hill Poles",    price:200, mult:{strength:1.13}, desc:"+13% Strength (eff)" },
  { id:"poles_3", slot:"poles", name:"Weighted Vest", price:460, mult:{strength:1.20}, desc:"+20% Strength (eff)" },
];

const DAILY_POOL = [
  { id:"cool_air", title:"Cool air",      text:"Run fatigue cost -12%",   eff:{ fatigueMult:{run:0.88} } },
  { id:"headwind", title:"Headwind",      text:"Bike success -10%",       eff:{ successAdd:{bike:-0.10} } },
  { id:"pool_open",title:"Pool open",     text:"Swim gains +15%",         eff:{ gainMult:{swim:1.15} } },
  { id:"trail_day",title:"Trail day",     text:"Hike gains +12%",         eff:{ gainMult:{hike:1.12} } },
  { id:"good_sleep",title:"Good sleep",   text:"Condition +0.05 today",   eff:{ conditionAdd:0.05 } },
  { id:"stiff_body",title:"Stiff body",   text:"Condition -0.05 today",   eff:{ conditionAdd:-0.05 } },
  { id:"recovery_focus",title:"Recovery", text:"Fatigue recovery +18%",   eff:{ fatigueRegenMult:1.18 } },
];

/** ---------------- Derived values ---------------- */
function equippedMult(){
  const mult = { vo2:1, endurance:1, strength:1, recovery:1 };
  for (const slot of Object.keys(state.equipped)){
    const id = state.equipped[slot];
    if (!id) continue;
    const item = SHOP_ITEMS.find(x=>x.id===id);
    if (!item) continue;
    for (const k of Object.keys(item.mult)){
      mult[k] *= item.mult[k];
    }
  }
  return mult;
}

function effStats(){
  const m = equippedMult();
  return {
    vo2: state.vo2 * m.vo2,
    endurance: state.endurance * m.endurance,
    strength: state.strength * m.strength,
    recovery: state.recovery * m.recovery,
  };
}

function readiness(){
  const s = effStats();
  const vo2n = clamp((s.vo2 - 25) / 50, 0, 1); // 0..1
  const endn = clamp(s.endurance / 100, 0, 1);
  const strn = clamp(s.strength / 100, 0, 1);
  const recn = clamp(s.recovery / 100, 0, 1);
  const base = 0.40*vo2n + 0.25*endn + 0.15*strn + 0.20*recn;

  // fatigue penalty scales
  const fatPen = clamp(state.fatigue / 220, 0, 0.65);
  const cond = clamp(state.condition, -0.20, 0.20);

  const adj = clamp(base * (1 + cond) * (1 - fatPen), 0, 1);
  return adj;
}

function fatigueMax(){ return 160; }

function fatigueRegenPerSec(){
  // base + recovery-driven; daily mods can boost
  const s = effStats();
  const base = 0.010;              // per sec (36 per hour) – noticeable
  const extra = s.recovery * 0.00006; // + ~0.006 at 100
  let mult = 1.0;
  for (const d of state.dailyMods){
    if (d.eff.fatigueRegenMult) mult *= d.eff.fatigueRegenMult;
  }
  return (base + extra) * mult;
}

function appliedDaily(trackId){
  let gainMult = 1.0;
  let fatMult = 1.0;
  let successAdd = 0.0;
  let condAdd = 0.0;

  for (const d of state.dailyMods){
    if (d.eff.gainMult && d.eff.gainMult[trackId]) gainMult *= d.eff.gainMult[trackId];
    if (d.eff.fatigueMult && d.eff.fatigueMult[trackId]) fatMult *= d.eff.fatigueMult[trackId];
    if (d.eff.successAdd && d.eff.successAdd[trackId]) successAdd += d.eff.successAdd[trackId];
    if (d.eff.conditionAdd) condAdd += d.eff.conditionAdd;
  }
  return { gainMult, fatMult, successAdd, condAdd };
}

/** ---------------- UI ---------------- */
const el = Object.fromEntries([
  "money","money2",
  "readiness","readiness2","day","nextDaily",
  "trackFill","trackRunner","nowState","trainingETA",
  "fatigue","fatigueBar","condition","conditionBar",
  "vo2","endurance","strength","recovery",
  "vo2Eff","endEff","strEff","recEff",
  "equippedSummary",
  "dailyMods",
  "trainingCountdown","trainingCards",
  "raceCards","raceResult",
  "stopTrainingBtn","restBtn","quickCashBtn","hint",
  "exportBtn","importBtn","resetBtn","saveBox",
].map(id=>[id, document.getElementById(id)]).filter(([_,v])=>v));

function setActiveTab(tabId){
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active", b.dataset.tab===tabId));
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active", p.id===tabId));
}
document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click", ()=>setActiveTab(btn.dataset.tab));
});

/** ---------------- Save/Load ---------------- */
function save(){
  state.lastSeen = now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}
function load(){
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return;
  try{
    const parsed = JSON.parse(raw);
    // merge cautiously
    Object.assign(state, parsed);
    // backfill new keys if missing
    state.owned ||= {};
    state.equipped ||= { shoes:null, top:null, towel:null, poles:null };
    state.track ||= {
      run:{unlockedLevel:1, clears:Array(10).fill(0)},
      bike:{unlockedLevel:1, clears:Array(10).fill(0)},
      swim:{unlockedLevel:1, clears:Array(10).fill(0)},
      hike:{unlockedLevel:1, clears:Array(10).fill(0)},
    };
    if (!Array.isArray(state.dailyMods)) state.dailyMods = [];
  }catch(e){
    console.warn("Failed to load save:", e);
  }
}

function exportSave(){
  el.saveBox.value = JSON.stringify(state);
  el.saveBox.focus();
  el.saveBox.select();
}
function importSave(){
  const txt = el.saveBox.value.trim();
  if (!txt) return;
  try{
    const parsed = JSON.parse(txt);
    localStorage.setItem(SAVE_KEY, JSON.stringify(parsed));
    location.reload();
  }catch(e){
    alert("Import failed: invalid JSON");
  }
}
function resetSave(){
  if (!confirm("Reset all progress?")) return;
  localStorage.removeItem(SAVE_KEY);
  location.reload();
}

/** ---------------- Daily roll ---------------- */
function rollDaily(){
  const picks = [];
  const pool = [...DAILY_POOL];
  // pick 2 distinct
  for (let i=0;i<2;i++){
    const p = pool.splice(Math.floor(Math.random()*pool.length), 1)[0];
    picks.push(p);
  }
  state.dailyMods = picks;
  // base daily condition roll + mod add
  let cond = (Math.random()*0.30 - 0.15); // -0.15..+0.15
  const add = picks.reduce((a,d)=>a + (d.eff.conditionAdd || 0), 0);
  cond = clamp(cond + add, -0.20, 0.20);
  state.condition = cond;
  state.nextDailyAt = now() + DAY_MS;
  state.day = (state.day || 1) + 1;
}

function ensureDaily(){
  if (!state.nextDailyAt) state.nextDailyAt = now() + DAY_MS;
  if (!Array.isArray(state.dailyMods) || state.dailyMods.length === 0){
    // init day 1 modifiers without increment day
    state.dailyMods = [pick(DAILY_POOL), pick(DAILY_POOL.filter(x=>x.id!==state.dailyMods?.[0]?.id))];
    let cond = (Math.random()*0.30 - 0.15);
    const add = state.dailyMods.reduce((a,d)=>a + (d.eff.conditionAdd || 0), 0);
    state.condition = clamp(cond + add, -0.20, 0.20);
  }
}

/** ---------------- Training logic ---------------- */
function trainingInProgress(){
  return state.training && state.training.endAt > now();
}

function trainingRemainingMs(){
  if (!state.training) return 0;
  return state.training.endAt - now();
}

function stopTraining(){
  if (!state.training) return;
  state.training = null;
  el.hint.textContent = "Training stopped.";
  save();
}

function restBreak(){
  // immediate fatigue drop with a small time penalty (no gating)
  const s = effStats();
  const drop = 10 + s.recovery * 0.06;
  state.fatigue = clamp(state.fatigue - drop, 0, fatigueMax());
  el.hint.textContent = `Recovery break: Fatigue -${Math.floor(drop)}.`;
  save();
}

function startTraining(trackId, level){
  if (trainingInProgress()){
    el.hint.textContent = "Already training. Stop it first if you want to switch.";
    return;
  }
  const info = state.track[trackId];
  if (level > info.unlockedLevel){
    el.hint.textContent = "Locked level. Clear previous level to unlock.";
    return;
  }
  const dur = levelDurationMs(level);
  state.training = { trackId, level, startedAt: now(), endAt: now() + dur };
  el.hint.textContent = `Started ${trackId.toUpperCase()} Lv${level} (${msToClock(dur)})`;
  save();
}

function resolveTrainingIfDone(){
  if (!state.training) return false;
  if (state.training.endAt > now()) return false;

  const { trackId, level } = state.training;
  state.training = null;

  const { gainMult, fatMult, successAdd } = appliedDaily(trackId);

  // success probability based on readiness vs requirement
  const req = levelReq(level);
  const r = readiness();
  let p = 0.15 + (r - req) * 1.25;
  p = clamp(p + successAdd, 0.05, 0.92);

  const roll = rand01();
  let outcome = "fail";
  if (roll < p*0.55) outcome = "great";
  else if (roll < p) outcome = "success";
  else if (roll < clamp(p + 0.18, 0, 1)) outcome = "struggle";
  else outcome = "fail";

  // fatigue cost and rewards
  const baseFat = (10 + level*3) * fatMult;
  const baseMoney = levelRewardBase(level);

  // growth baselines
  const growthMain = 0.35 + level*0.08;
  const growthAlt  = 0.18 + level*0.05;
  const growthRec  = 0.10 + level*0.03;

  const track = TRACKS.find(t=>t.id===trackId);

  let moneyMul = 1.0;
  let gainMul2 = gainMult;
  let fatMul2  = 1.0;

  if (outcome === "great"){ moneyMul = 1.25; gainMul2 *= 1.25; fatMul2 = 1.05; }
  if (outcome === "success"){ moneyMul = 1.00; gainMul2 *= 1.00; fatMul2 = 1.00; }
  if (outcome === "struggle"){ moneyMul = 0.70; gainMul2 *= 0.60; fatMul2 = 1.10; }
  if (outcome === "fail"){ moneyMul = 0.25; gainMul2 *= 0.25; fatMul2 = 1.20; }

  const moneyGain = Math.floor(baseMoney * moneyMul);
  state.money += moneyGain;

  const addStat = (key, val) => { state[key] = clamp(state[key] + val, 0, key==="vo2" ? 75 : 100); };

  addStat(track.main, growthMain * gainMul2);
  addStat(track.alt,  growthAlt  * gainMul2);
  addStat("recovery", growthRec  * gainMul2 * (trackId==="swim" ? 1.15 : 1.0)); // swim slightly recovery-friendly

  state.fatigue = clamp(state.fatigue + baseFat * fatMul2, 0, fatigueMax());

  // track clears / unlock
  const info = state.track[trackId];
  if (outcome === "great" || outcome === "success"){
    info.clears[level-1] = (info.clears[level-1] || 0) + 1;
    if (level === info.unlockedLevel && level < 10 && info.clears[level-1] >= 1){
      info.unlockedLevel = level + 1;
      el.hint.textContent = `${track.icon} ${track.name} Lv${level} cleared! Unlocked Lv${level+1}. +$${moneyGain}`;
    }else{
      el.hint.textContent = `${track.icon} ${track.name} Lv${level} ${outcome}. +$${moneyGain}`;
    }
  }else{
    el.hint.textContent = `${track.icon} ${track.name} Lv${level} ${outcome}. +$${moneyGain}`;
  }

  save();
  return true;
}

/** ---------------- Sponsor ---------------- */
const SPONSOR_STEPS = [
  2*60*1000,
  5*60*1000,
  10*60*1000,
  30*60*1000,
  60*60*1000,
];

function sponsorCooldownMs(){
  return SPONSOR_STEPS[Math.min(state.sponsorStep, SPONSOR_STEPS.length-1)];
}
function sponsorReward(){
  // mild reward that scales with readiness a bit
  const r = readiness();
  return Math.floor(25 + r*60 + state.day*0.6);
}
function doSponsor(){
  const t = now();
  if (t < (state.sponsorReadyAt || 0)){
    el.hint.textContent = "Sponsor not ready yet.";
    return;
  }
  const gain = sponsorReward();
  state.money += gain;
  state.sponsorStep = (state.sponsorStep || 0) + 1;
  state.sponsorReadyAt = t + sponsorCooldownMs();
  el.hint.textContent = `Sponsor secured: +$${gain}. Next cooldown longer.`;
  save();
}

/** ---------------- Races ---------------- */
const RACES = [
  { id:"5k",  name:"5K",  icon:"🏁", km:5,    req:{vo2:26, endurance:8},  fatigue:28, prize:70 },
  { id:"10k", name:"10K", icon:"🏁", km:10,   req:{vo2:28, endurance:12}, fatigue:40, prize:110 },
  { id:"hm",  name:"Half Marathon", icon:"🏁", km:21.097, req:{vo2:32, endurance:22}, fatigue:58, prize:180 },
  { id:"fm",  name:"Marathon", icon:"🏁", km:42.195, req:{vo2:36, endurance:35, recovery:18}, fatigue:78, prize:280 },
];

function canRace(race){
  const s = effStats();
  for (const k of Object.keys(race.req)){
    if (s[k] < race.req[k]) return false;
  }
  return true;
}

function paceMinPerKm(){
  const s = effStats();
  // base pace: worst ~7.5, best ~3.4
  const vo2Boost = (s.vo2 - 25) / 12; // ~0..4.2
  const endBoost = s.endurance / 55;  // ~0..1.8
  let pace = 7.6 - vo2Boost - endBoost;

  // fatigue + condition
  pace *= (1 + clamp(state.fatigue/240, 0, 0.55));
  pace *= (1 - clamp(state.condition, -0.2, 0.2)*0.25);

  return clamp(pace, 3.2, 9.0);
}

function startRace(raceId){
  if (trainingInProgress()){
    el.raceResult.textContent = "Stop training before racing.";
    return;
  }
  const race = RACES.find(r=>r.id===raceId);
  if (!race) return;

  if (!canRace(race)){
    el.raceResult.textContent = "Not ready: meet minimum stat requirements first.";
    return;
  }

  const r = readiness();
  const p = clamp(0.35 + (r - 0.45) * 1.6, 0.10, 0.95); // chance of strong result
  const roll = rand01();

  // time estimation
  const pace = paceMinPerKm();
  let timeMin = pace * race.km;

  // performance noise
  const perf = (roll < p ? 1 - rand01()*0.04 : 1 + rand01()*0.08);
  timeMin *= perf;

  // rank by time thresholds relative to a "par" time from readiness
  const par = (8.6 - r*4.5) * race.km; // lower is better
  const ratio = timeMin / par;

  let grade = "C";
  if (ratio < 0.88) grade = "S";
  else if (ratio < 0.96) grade = "A";
  else if (ratio < 1.04) grade = "B";
  else if (ratio < 1.12) grade = "C";
  else grade = "D";

  // prize scaling
  const prizeMul = ({S:1.35,A:1.20,B:1.05,C:0.85,D:0.60})[grade];
  const moneyGain = Math.floor(race.prize * prizeMul);
  state.money += moneyGain;

  // fatigue hit big
  state.fatigue = clamp(state.fatigue + race.fatigue, 0, fatigueMax());

  // small stat gains
  const add = (k,v)=> state[k] = clamp(state[k]+v, 0, k==="vo2"?75:100);
  add("vo2", 0.12 + race.km*0.006);
  add("endurance", 0.18 + race.km*0.010);
  add("recovery", 0.10 + race.km*0.004);

  const hh = Math.floor(timeMin/60);
  const mm = Math.floor(timeMin%60);
  const timeStr = hh>0 ? `${hh}h ${mm}m` : `${mm}m ${Math.round((timeMin-mm)*60)}s`;

  el.raceResult.textContent =
    `${race.name} result: Grade ${grade}. Time ~ ${timeStr}. +$${moneyGain}. Fatigue +${race.fatigue}.`;

  save();
}

/** ---------------- Shop ---------------- */
function buyItem(itemId){
  const item = SHOP_ITEMS.find(x=>x.id===itemId);
  if (!item) return;
  if (state.owned[itemId]){
    el.hint.textContent = "Already owned.";
    return;
  }
  if (state.money < item.price){
    el.hint.textContent = "Not enough money.";
    return;
  }
  state.money -= item.price;
  state.owned[itemId] = true;
  el.hint.textContent = `Bought: ${item.name}.`;
  save();
}
function equipItem(itemId){
  const item = SHOP_ITEMS.find(x=>x.id===itemId);
  if (!item) return;
  if (!state.owned[itemId]){
    el.hint.textContent = "Buy it first.";
    return;
  }
  state.equipped[item.slot] = itemId;
  el.hint.textContent = `Equipped: ${item.name}.`;
  save();
}
function unequip(slot){
  state.equipped[slot] = null;
  el.hint.textContent = `Unequipped ${slot}.`;
  save();
}

/** ---------------- Offline progress ---------------- */
function offlineProgress(){
  const t = now();
  const dt = clamp(t - (state.lastSeen || t), 0, OFFLINE_CAP_MS);
  if (dt <= 0) return;

  // fatigue recovery during offline
  const dec = fatigueRegenPerSec() * (dt/1000);
  state.fatigue = clamp(state.fatigue - dec, 0, fatigueMax());

  // if training finished while offline, resolve once
  if (state.training && state.training.endAt <= t){
    resolveTrainingIfDone(); // uses current now; ok
  }

  state.lastSeen = t;
}

/** ---------------- Rendering ---------------- */
function tagForProb(p){
  if (p >= 0.75) return { cls:"good", text:`High ${Math.round(p*100)}%` };
  if (p >= 0.45) return { cls:"mid",  text:`Mid ${Math.round(p*100)}%` };
  return { cls:"bad", text:`Low ${Math.round(p*100)}%` };
}

function trainingProb(trackId, level){
  const req = levelReq(level);
  const { successAdd } = appliedDaily(trackId);
  const r = readiness();
  let p = 0.15 + (r - req) * 1.25;
  p = clamp(p + successAdd, 0.05, 0.92);
  return p;
}

function renderDaily(){
  el.dailyMods.innerHTML = "";
  for (const d of state.dailyMods){
    const li = document.createElement("li");
    li.className = "modItem";
    li.innerHTML = `<b>${d.title}</b><div class="muted">${d.text}</div>`;
    el.dailyMods.appendChild(li);
  }
  el.nextDaily.textContent = msToClock(state.nextDailyAt - now());
}

function renderStats(){
  const s = effStats();
  el.money.textContent = Math.floor(state.money);
  if (el.money2) el.money2.textContent = Math.floor(state.money);

  el.day.textContent = state.day;

  el.vo2.textContent = fmt1(state.vo2);
  el.endurance.textContent = fmt1(state.endurance);
  el.strength.textContent = fmt1(state.strength);
  el.recovery.textContent = fmt1(state.recovery);

  el.vo2Eff.textContent = fmt1(s.vo2);
  el.endEff.textContent = fmt1(s.endurance);
  el.strEff.textContent = fmt1(s.strength);
  el.recEff.textContent = fmt1(s.recovery);

  el.readiness.textContent = fmt2(readiness());
  if (el.readiness2) el.readiness2.textContent = fmt2(readiness());

  el.fatigue.textContent = Math.floor(state.fatigue);
  const fatPct = clamp(state.fatigue / fatigueMax(), 0, 1) * 100;
  el.fatigueBar.style.width = `${fatPct}%`;

  // condition displayed as -15..+15
  const condPct = clamp((state.condition + 0.20) / 0.40, 0, 1) * 100;
  el.condition.textContent = fmt2(state.condition);
  el.conditionBar.style.width = `${condPct}%`;

  // equipped summary
  const sum = [];
  for (const slot of ["shoes","top","towel","poles"]){
    const id = state.equipped[slot];
    if (!id) continue;
    const item = SHOP_ITEMS.find(x=>x.id===id);
    if (item) sum.push(item.name);
  }
  el.equippedSummary.textContent = sum.length ? sum.join(" • ") : "—";
}

function renderTrack(){
  const runner = el.trackRunner;
  const fill = el.trackFill;

  if (state.training){
    const total = state.training.endAt - state.training.startedAt;
    const done = clamp((now() - state.training.startedAt) / total, 0, 1);
    const pct = done * 100;
    fill.style.width = `${pct}%`;
    runner.style.left = `calc(${pct}% - 6px)`;
    runner.classList.toggle("running", true);

    const track = TRACKS.find(t=>t.id===state.training.trackId);
    el.nowState.textContent = `${track.icon} ${track.name} Lv${state.training.level}`;
    el.trainingETA.textContent = msToClock(trainingRemainingMs());
  }else{
    fill.style.width = "0%";
    runner.style.left = "0%";
    runner.classList.toggle("running", false);
    el.nowState.textContent = "Idle";
    el.trainingETA.textContent = "—";
  }
}

function renderTraining(){
  const remaining = trainingRemainingMs();
  el.trainingCountdown.textContent = state.training ? msToClock(remaining) : "—";

  el.trainingCards.innerHTML = "";
  for (const t of TRACKS){
    const info = state.track[t.id];
    const card = document.createElement("div");
    card.className = "trainCard";

    const lockedNote = `Unlocked: Lv${info.unlockedLevel}/10`;
    card.innerHTML = `
      <div class="trainTop">
        <div>
          <div class="trainName">${t.icon} ${t.name}</div>
          <div class="small">${lockedNote}</div>
        </div>
      </div>
      <div class="trainMeta">
        <div><span class="muted">Main</span><div><b>${t.main}</b></div></div>
        <div><span class="muted">Alt</span><div><b>${t.alt}</b></div></div>
      </div>
      <div class="divider"></div>
      <div class="trainActions" id="btns_${t.id}"></div>
    `;
    el.trainingCards.appendChild(card);

    const btns = card.querySelector(`#btns_${t.id}`);
    for (let lv=1; lv<=10; lv++){
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = `Lv${lv}`;
      const locked = lv > info.unlockedLevel;
      if (locked) b.disabled = true;

      // add a tag-like title for probability
      const p = trainingProb(t.id, lv);
      const tag = tagForProb(p);
      b.title = `Chance ${Math.round(p*100)}% • Dur ${msToClock(levelDurationMs(lv))}`;

      b.addEventListener("click", ()=>startTraining(t.id, lv));
      btns.appendChild(b);
    }

    // add summary line
    const sum = document.createElement("div");
    sum.className = "small";
    sum.style.marginTop = "10px";
    const lastClear = info.clears.map((c,i)=>c>0?`Lv${i+1}✓`:null).filter(Boolean).slice(-3).join(" ");
    sum.innerHTML = `<span class="muted">Clears:</span> ${lastClear || "—"}`;
    card.appendChild(sum);
  }
}

function renderRaces(){
  el.raceCards.innerHTML = "";
  for (const r of RACES){
    const card = document.createElement("div");
    card.className = "raceCard";

    const ok = canRace(r);
    const reqLines = Object.entries(r.req).map(([k,v])=>`${k} ≥ ${v}`).join(", ");

    card.innerHTML = `
      <div class="raceTitle">
        <div class="raceName">${r.icon} ${r.name}</div>
        <span class="tag ${ok ? "good":"bad"}">${ok ? "Eligible":"Locked"}</span>
      </div>
      <div class="raceMeta">
        <div><span class="muted">Distance</span><div><b>${fmt1(r.km)} km</b></div></div>
        <div><span class="muted">Prize</span><div><b>$${r.prize}</b></div></div>
        <div><span class="muted">Req</span><div><b>${reqLines}</b></div></div>
        <div><span class="muted">Fatigue</span><div><b>+${r.fatigue}</b></div></div>
      </div>
      <div class="raceActions">
        <button class="btn primary" id="race_${r.id}">Race</button>
      </div>
    `;
    el.raceCards.appendChild(card);
    const btn = card.querySelector(`#race_${r.id}`);
    btn.disabled = !ok || trainingInProgress();
    btn.addEventListener("click", ()=>startRace(r.id));
  }
}

function renderShop(){
  el.shopGrid.innerHTML = "";
  for (const item of SHOP_ITEMS){
    const card = document.createElement("div");
    card.className = "shopItem";

    const owned = !!state.owned[item.id];
    const equipped = state.equipped[item.slot] === item.id;

    card.innerHTML = `
      <div class="shopTop">
        <div>
          <div class="shopName">${item.name}</div>
          <div class="small">${item.slot.toUpperCase()} • $${item.price}</div>
        </div>
        <span class="tag ${equipped ? "good" : owned ? "mid" : ""}">${equipped ? "Equipped" : owned ? "Owned" : "—"}</span>
      </div>
      <div class="shopDesc">${item.desc}</div>
      <div class="shopActions">
        <button class="btn secondary" id="buy_${item.id}">Buy</button>
        <button class="btn primary" id="eq_${item.id}">Equip</button>
      </div>
    `;
    el.shopGrid.appendChild(card);

    const buyBtn = card.querySelector(`#buy_${item.id}`);
    const eqBtn  = card.querySelector(`#eq_${item.id}`);
    buyBtn.disabled = owned || state.money < item.price;
    eqBtn.disabled = !owned || equipped;

    buyBtn.addEventListener("click", ()=>buyItem(item.id));
    eqBtn.addEventListener("click", ()=>equipItem(item.id));
  }

  // quick unequip row
  const extra = document.createElement("div");
  extra.className = "shopItem";
  extra.innerHTML = `
    <div class="shopTop">
      <div>
        <div class="shopName">Unequip</div>
        <div class="small">Remove equipment</div>
      </div>
    </div>
    <div class="shopActions">
      <button class="btn secondary" id="un_shoes">Shoes</button>
      <button class="btn secondary" id="un_top">Top</button>
      <button class="btn secondary" id="un_towel">Towel</button>
      <button class="btn secondary" id="un_poles">Poles</button>
    </div>
  `;
  el.shopGrid.appendChild(extra);
  extra.querySelector("#un_shoes").onclick = ()=>unequip("shoes");
  extra.querySelector("#un_top").onclick = ()=>unequip("top");
  extra.querySelector("#un_towel").onclick = ()=>unequip("towel");
  extra.querySelector("#un_poles").onclick = ()=>unequip("poles");
}

function renderSponsor(){
  const t = now();
  const readyAt = state.sponsorReadyAt || 0;
  const disabled = t < readyAt;
  el.quickCashBtn.disabled = disabled;
  if (disabled){
    el.quickCashBtn.textContent = `Get Sponsor (${msToClock(readyAt - t)})`;
  }else{
    el.quickCashBtn.textContent = "Get Sponsor";
  }
}

function renderAll(){
  renderStats();
  renderDaily();
  renderTrack();
  renderTraining();
  renderRaces();
  renderShop();
  renderSponsor();

  // buttons
  el.stopTrainingBtn.disabled = !state.training;
}

/** ---------------- Main loop ---------------- */
let last = performance.now();
function tick(ts){
  const dt = clamp((ts - last)/1000, 0, 0.25);
  last = ts;

  // fatigue recovery over time
  state.fatigue = clamp(state.fatigue - fatigueRegenPerSec()*dt, 0, fatigueMax());

  // daily rollover
  if (now() >= state.nextDailyAt){
    rollDaily();
    el.hint.textContent = `New day rolled. Condition is now ${fmt2(state.condition)}.`;
  }

  // training resolution
  resolveTrainingIfDone();

  renderAll();
  requestAnimationFrame(tick);
}

/** ---------------- Init & bindings ---------------- */
load();
ensureDaily();
offlineProgress();

// default: own first-tier items? (starter pack) – cheap, optional
// state.owned["shoes_1"] = true;

el.stopTrainingBtn.onclick = stopTraining;
el.restBtn.onclick = restBreak;
el.quickCashBtn.onclick = doSponsor;

el.exportBtn.onclick = exportSave;
el.importBtn.onclick = importSave;
el.resetBtn.onclick = resetSave;

setInterval(save, 10000);
window.addEventListener("beforeunload", save);

renderAll();
requestAnimationFrame(tick);

// debug helpers
window.resetGame = resetSave;
window.state = state;
