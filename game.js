/* =========================================================
   Health Idle - Auto Run/Rest + Track Miles + Unlocks + Events
   - No duplicate function definitions
   - Health uses diminishing returns to prevent runaway numbers
   - Running auto-switches to resting at 0 energy, resumes at threshold
   - Track / lap progress bar + unlock milestones
   - Offline gains capped (2 hours)
   ========================================================= */

const SAVE_KEY = "health_idle_track_v3";

// ---------- State ----------
const state = {
  // Currency (你可以把 points 當作 money)
  points: 0,

  // Core stats
  energy: 60,
  energyMax: 100,
  health: 10,

  // Auto activity
  activity: "running", // "running" | "resting"
  runDrain: 6.0,       // energy per second while running
  restThreshold: 0.30, // resume running when energy >= 30% max

  // Track / miles
  totalMiles: 0,
  lapMiles: 0,
  lapTarget: 1.0,
  milesPerSecBase: 0.006, // mile/sec (0.36 mile/min) - safe default
  trackLevel: 0,

  // Simple upgrade
  shoesLevel: 0,
  shoesBasePrice: 30,
  shoesGrowth: 1.35,

  // Events
  event: null,            // active event object
  nextEventAt: Date.now() + 90_000,
  eventIntervalMin: 90,   // seconds
  eventIntervalMax: 150,  // seconds
  eventPeekUnlocked: false, // unlocked by miles
  nextEventSeed: null,

  // Offline
  lastSeen: Date.now()
};

// ---------- DOM (null-safe) ----------
const el = {
  // core
  points: document.getElementById("points"),
  energy: document.getElementById("energy"),
  energyMax: document.getElementById("energyMax"),
  health: document.getElementById("health"),
  hint: document.getElementById("hint"),

  // optional: show status
  activity: document.getElementById("activity"),

  // optional: "eff/regen" fields (if you still have them)
  eff: document.getElementById("eff"),
  regen: document.getElementById("regen"),

  // optional: buttons
  restBtn: document.getElementById("restBtn"),
  workoutBtn: document.getElementById("workoutBtn"),
  buyShoesBtn: document.getElementById("buyShoesBtn"),
  shoesLevel: document.getElementById("shoesLevel"),
  shoesPrice: document.getElementById("shoesPrice"),

  // track UI
  lapMiles: document.getElementById("lapMiles"),
  lapTarget: document.getElementById("lapTarget"),
  totalMiles: document.getElementById("totalMiles"),
  lapBar: document.getElementById("lapBar"),
  nextUnlockText: document.getElementById("nextUnlockText"),

  // events UI (optional)
  eventCountdown: document.getElementById("eventCountdown"),
  eventPeekText: document.getElementById("eventPeekText"),
  eventPeekHint: document.getElementById("eventPeekHint"),
  eventTitle: document.getElementById("eventTitle"),
  eventDesc: document.getElementById("eventDesc"),
  eventMeta: document.getElementById("eventMeta"),
  eventAcceptBtn: document.getElementById("eventAcceptBtn"),
  eventSkipBtn: document.getElementById("eventSkipBtn")
};

// ---------- Save / Load ----------
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, lastSeen: Date.now() }));
  } catch {}
}

function load() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return;
  try {
    const obj = JSON.parse(raw);
    Object.assign(state, obj);

    // defensive defaults
    if (!state.nextEventAt) state.nextEventAt = Date.now() + 90_000;
    if (state.nextEventSeed === undefined) state.nextEventSeed = null;
    if (!state.activity) state.activity = "running";
  } catch {}
}

// ---------- Math (Diminishing returns to avoid runaway) ----------
function healthPower() {
  // diminishing effect: sqrt prevents explosion
  return Math.sqrt(Math.max(0, state.health));
}

function efficiency() {
  // affects earnings and miles slightly
  return 1 + healthPower() * 0.05; // gentle
}

function energyRegen() {
  // resting regen base (not too high)
  return 1.2 + healthPower() * 0.10; // gentle
}

function runEarningPerSec() {
  // only earn while running (no passive points outside running)
  // shoes small boost + efficiency
  const shoe = 1 + state.shoesLevel * 0.05;
  return 0.25 * shoe * efficiency() * eventMultipliers().money;
}

function milesPerSec() {
  // running speed
  const shoe = 1 + state.shoesLevel * 0.03;
  return state.milesPerSecBase * shoe * (1 + healthPower() * 0.01) * eventMultipliers().speed;
}

function shoesPrice() {
  return Math.floor(state.shoesBasePrice * Math.pow(state.shoesGrowth, state.shoesLevel));
}

// ---------- Clamp ----------
function clamp() {
  state.energy = Math.max(0, Math.min(state.energy, state.energyMax));
  state.points = Math.max(0, state.points);
  state.health = Math.max(0, state.health);
  state.totalMiles = Math.max(0, state.totalMiles);
  state.lapMiles = Math.max(0, state.lapMiles);
  state.shoesLevel = Math.max(0, state.shoesLevel);
}

// ---------- Manual actions (optional) ----------
function restManual() {
  // manual rest gives a burst; also encourages intervention
  state.energy += 12;
  state.health += 0.3; // tiny, not runaway
  clamp();
  if (el.hint) el.hint.textContent = "你休息了一下，體力回復。";
  save();
  render();
}

function workoutManual() {
  // manual workout: spend energy to gain health (but with diminishing returns)
  const cost = 15;
  if (state.energy < cost) {
    if (el.hint) el.hint.textContent = "體力不足，先休息。";
    return;
  }
  state.energy -= cost;

  // gain is diminishing: more health => less gain
  const gain = 2.5 / (1 + healthPower() * 0.35);
  state.health += gain;

  clamp();
  if (el.hint) el.hint.textContent = `完成訓練，健康 +${gain.toFixed(2)}`;
  save();
  render();
}

function buyShoes() {
  const price = shoesPrice();
  if (state.points < price) {
    if (el.hint) el.hint.textContent = "錢不夠。";
    return;
  }
  state.points -= price;
  state.shoesLevel += 1;
  if (el.hint) el.hint.textContent = "👟 跑鞋升級！跑更久也賺更穩。";
  save();
  render();
}

// ---------- Events ----------
function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function scheduleNextEvent(fromNowMs = null) {
  const ms = fromNowMs ?? randInt(state.eventIntervalMin, state.eventIntervalMax) * 1000;
  state.nextEventAt = Date.now() + ms;
  state.nextEventSeed = pickEventType();
}

function pickEventType() {
  const r = Math.random();
  if (r < 0.35) return "tailwind";   // speed up
  if (r < 0.65) return "bonus_pay";  // money up
  if (r < 0.85) return "rain";       // speed down but regen up
  return "cramp";                    // speed down; if resting, resolves quicker (simple)
}

function eventMultipliers() {
  if (!state.event || !state.event.accepted) return { speed: 1, money: 1, regen: 1 };
  return state.event.mult;
}

function buildEvent(type) {
  const now = Date.now();

  if (type === "tailwind") {
    return {
      type,
      title: "🟢 順風日",
      desc: "跑步速度提升一段時間。",
      endsAt: now + 90_000,
      mult: { speed: 1.35, money: 1.00, regen: 1.00 },
      accepted: false
    };
  }

  if (type === "bonus_pay") {
    return {
      type,
      title: "🟡 打卡獎金",
      desc: "跑步收益提高，但休息回復稍微變慢。",
      endsAt: now + 90_000,
      mult: { speed: 1.00, money: 1.50, regen: 0.90 },
      accepted: false
    };
  }

  if (type === "rain") {
    return {
      type,
      title: "🔵 下雨天",
      desc: "跑不快，但休息回復變快，適合養狀態。",
      endsAt: now + 90_000,
      mult: { speed: 0.80, money: 1.00, regen: 1.35 },
      accepted: false
    };
  }

  // cramp
  return {
    type: "cramp",
    title: "🔴 抽筋警訊",
    desc: "跑步速度下降。若你選擇休息，會比較快恢復。",
    endsAt: now + 90_000,
    mult: { speed: 0.70, money: 1.00, regen: 1.05 },
    accepted: false
  };
}

function updateEventLifecycle() {
  const now = Date.now();

  // spawn prompt when time arrives
  if (!state.event && now >= state.nextEventAt) {
    state.event = buildEvent(state.nextEventSeed || pickEventType());
    // immediately schedule next seed/time (for peek)
    scheduleNextEvent();
    if (el.hint) el.hint.textContent = `事件出現：${state.event.title}`;
  }

  // end accepted event
  if (state.event && state.event.accepted && now >= state.event.endsAt) {
    if (el.hint) el.hint.textContent = `事件結束：${state.event.title}`;
    state.event = null;
  }

  // expire unaccepted prompt
  if (state.event && !state.event.accepted && now >= state.event.endsAt) {
    state.event = null;
  }
}

function acceptEvent() {
  if (!state.event) return;
  state.event.accepted = true;
  if (el.hint) el.hint.textContent = `已接受：${state.event.title}`;
  save();
  render();
}

function skipEvent() {
  if (!state.event) return;
  if (el.hint) el.hint.textContent = "你略過了這次事件。";
  state.event = null;
  save();
  render();
}

function formatMMSS(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function eventTypeToName(type) {
  switch (type) {
    case "tailwind": return "🟢 順風日";
    case "bonus_pay": return "🟡 打卡獎金";
    case "rain": return "🔵 下雨天";
    case "cramp": return "🔴 抽筋警訊";
    default: return "未知事件";
  }
}

// ---------- Track unlocks ----------
const TRACK_UNLOCKS = [
  { miles: 1,  text: "解鎖：跑鞋升級（若你已有按鈕就當作提示）", apply: () => {} },
  { miles: 5,  text: "解鎖：事件預告", apply: () => { state.eventPeekUnlocked = true; } },
  { miles: 12, text: "解鎖：跑步更省力（runDrain -10%）", apply: () => { state.runDrain *= 0.90; } },
  { miles: 20, text: "解鎖：跑步速度 +10%", apply: () => { state.milesPerSecBase *= 1.10; } },
  { miles: 35, text: "解鎖：休息更有效（energyRegen +10% via event mult baseline）", apply: () => { state.energyMax += 10; } }
];

function checkTrackUnlocks() {
  while (state.trackLevel < TRACK_UNLOCKS.length &&
         state.totalMiles >= TRACK_UNLOCKS[state.trackLevel].miles) {
    const u = TRACK_UNLOCKS[state.trackLevel];
    state.trackLevel += 1;
    if (typeof u.apply === "function") u.apply();
    if (el.hint) el.hint.textContent = `🔓 里程解鎖！${u.text}`;
    save();
  }
}

// ---------- Core activity loop ----------
function stepActivity(dt) {
  const mult = eventMultipliers();

  if (state.activity === "running") {
    // drain energy
    state.energy -= state.runDrain * dt;
    if (state.energy <= 0) {
      state.energy = 0;
      state.activity = "resting";
      if (el.hint) el.hint.textContent = "體力見底，自動休息中…";
      return;
    }

    // earn money + miles
    state.points += runEarningPerSec() * dt;
    const dm = milesPerSec() * dt;
    state.lapMiles += dm;
    state.totalMiles += dm;

    // lap completion = delayed reward moment (small bonus)
    while (state.lapMiles >= state.lapTarget) {
      state.lapMiles -= state.lapTarget;

      // small lap bonus; keep modest to avoid runaway
      const bonus = 8 + Math.floor(state.shoesLevel * 2);
      state.points += bonus;

      // tiny health gain per lap (diminishing)
      const hg = 0.6 / (1 + healthPower() * 0.25);
      state.health += hg;

      if (el.hint) el.hint.textContent = `🏁 完成 1 圈！獎勵 +${bonus}，健康 +${hg.toFixed(2)}`;
    }

    checkTrackUnlocks();
  } else {
    // resting
    state.energy += energyRegen() * mult.regen * dt;

    // special: if cramp event and you're resting, recover faster by shortening event
    if (state.event && state.event.accepted && state.event.type === "cramp") {
      // while resting, reduce remaining time slightly (simple feel-good mechanic)
      state.event.endsAt -= 250 * dt; // mild acceleration
    }

    if (state.energy >= state.energyMax * state.restThreshold) {
      state.activity = "running";
      if (el.hint) el.hint.textContent = "體力恢復，繼續跑步！";
    }
  }
}

// ---------- Offline progress ----------
function offlineProgress() {
  const now = Date.now();
  const sec = Math.min((now - state.lastSeen) / 1000, 2 * 3600); // cap 2h
  if (sec <= 0) return;

  // Simulate in coarse steps to keep stable
  // We do NOT simulate events offline (simple + prevents weird spikes)
  const step = 1.0; // 1 second step
  let t = 0;

  // Temporarily disable event multipliers offline (stable)
  const savedEvent = state.event;
  state.event = null;

  while (t < sec) {
    const dt = Math.min(step, sec - t);
    stepActivity(dt);
    clamp();
    t += dt;
  }

  state.event = savedEvent;
  // ensure nextEvent schedule sane
  if (!state.nextEventAt || typeof state.nextEventAt !== "number") scheduleNextEvent();

  if (el.hint) el.hint.textContent = `離線收益已結算（${Math.floor(sec / 60)} 分鐘）`;
}

// ---------- Render ----------
function render() {
  // core
  if (el.points) el.points.textContent = Math.floor(state.points);
  if (el.energy) el.energy.textContent = Math.floor(state.energy);
  if (el.energyMax) el.energyMax.textContent = state.energyMax;
  if (el.health) el.health.textContent = Math.floor(state.health);

  // optional stats
  if (el.eff) el.eff.textContent = efficiency().toFixed(2);
  if (el.regen) el.regen.textContent = energyRegen().toFixed(2);

  // activity
  if (el.activity) el.activity.textContent = (state.activity === "running" ? "🏃 跑步中" : "😴 休息中");

  // shoes UI
  if (el.shoesLevel) el.shoesLevel.textContent = state.shoesLevel;
  if (el.shoesPrice) el.shoesPrice.textContent = `（${shoesPrice()}）`;
  if (el.buyShoesBtn) el.buyShoesBtn.disabled = state.points < shoesPrice();

  // buttons
  if (el.workoutBtn) el.workoutBtn.disabled = state.energy < 15;
  if (el.restBtn) el.restBtn.disabled = false;

  // track UI
  if (el.lapMiles && el.lapTarget && el.totalMiles && el.lapBar && el.nextUnlockText) {
    el.lapMiles.textContent = state.lapMiles.toFixed(2);
    el.lapTarget.textContent = state.lapTarget.toFixed(2);
    el.totalMiles.textContent = state.totalMiles.toFixed(1);

    const pct = Math.max(0, Math.min(100, (state.lapMiles / state.lapTarget) * 100));
    el.lapBar.style.width = pct.toFixed(1) + "%";

    const next = TRACK_UNLOCKS[state.trackLevel];
    el.nextUnlockText.textContent = next
      ? `${next.miles} miles：${next.text}`
      : "已完成所有跑道解鎖 ✅";
  }

  // event countdown / box
  const now = Date.now();
  if (el.eventCountdown) el.eventCountdown.textContent = formatMMSS(state.nextEventAt - now);

  if (el.eventPeekText && el.eventPeekHint) {
    if (state.eventPeekUnlocked) {
      el.eventPeekText.textContent = eventTypeToName(state.nextEventSeed);
      el.eventPeekHint.textContent = "已解鎖：可提前規劃要不要休息/衝刺。";
    } else {
      el.eventPeekText.textContent = "未解鎖";
      el.eventPeekHint.textContent = "累積里程解鎖事件預告。";
    }
  }

  if (el.eventTitle && el.eventDesc && el.eventMeta && el.eventAcceptBtn && el.eventSkipBtn) {
    if (!state.event) {
      el.eventTitle.textContent = "目前沒有事件";
      el.eventDesc.textContent = "等待下一個事件…";
      el.eventMeta.textContent = "";
      el.eventAcceptBtn.disabled = true;
      el.eventSkipBtn.disabled = true;
    } else {
      el.eventTitle.textContent = state.event.title;
      el.eventDesc.textContent = state.event.desc;
      el.eventMeta.textContent = (state.event.accepted ? `進行中 · 剩餘 ${formatMMSS(state.event.endsAt - now)}` :
        `可決定 · 時窗 ${formatMMSS(state.event.endsAt - now)}`);

      el.eventAcceptBtn.disabled = !!state.event.accepted;
      el.eventSkipBtn.disabled = !!state.event.accepted;

      el.eventAcceptBtn.textContent = state.event.accepted ? "進行中" : "接受";
      el.eventSkipBtn.textContent = "略過";
    }
  }
}

// ---------- Main loop ----------
let last = performance.now();
function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;

  // events
  updateEventLifecycle();

  // core activity
  stepActivity(dt);

  // safety
  clamp();
  render();

  requestAnimationFrame(tick);
}

// ---------- Init ----------
function init() {
  // ensure event schedule
  if (!state.nextEventSeed) state.nextEventSeed = pickEventType();
  if (!state.nextEventAt || typeof state.nextEventAt !== "number") scheduleNextEvent();

  // wire buttons (if exist)
  if (el.restBtn) el.restBtn.onclick = restManual;
  if (el.workoutBtn) el.workoutBtn.onclick = workoutManual;
  if (el.buyShoesBtn) el.buyShoesBtn.onclick = buyShoes;

  if (el.eventAcceptBtn) el.eventAcceptBtn.onclick = acceptEvent;
  if (el.eventSkipBtn) el.eventSkipBtn.onclick = skipEvent;

  setInterval(save, 10_000);
  window.addEventListener("beforeunload", save);
}

// ---------- Boot ----------
load();
offlineProgress();
init();
render();
requestAnimationFrame(tick);

// Debug helpers
window.resetGame = () => {
  localStorage.removeItem(SAVE_KEY);
  location.reload();
};
window.state = state; // optional: inspect in console
