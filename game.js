const SAVE_KEY = "health_idle_mvp_v2_events";

/** ===== 狀態 ===== */
const state = {
  // account
  points: 0,
  prestigeLevel: 0,

  // character (固定一個人)
  energy: 50,
  energyMax: 100,
  health: 0,
  mode: "balanced", // balanced | recovery | sprint
  shoesLevel: 0,

  workoutCost: 10,
  restGain: 10,

  shoesBasePrice: 20,
  shoesGrowth: 1.35,

  // automation
  autoUnlocked: false,
  autoPrice: 60,
  autoInterval: 5,
  autoTimer: 0,

  // ===== Track (Miles) =====
  totalMiles: 0,
  lapMiles: 0,
  lapTarget: 1.0,        // 每圈 1 mile
  milesPerSecBase: 0.008, // 速度（mile/sec）先保守：0.48 mile/min
  trackLevel: 0,

  // planner (advance feature)
  plannerUnlocked: false,
  plannerPrice: 80,
  plannedDecision: "none", // none | accept | skip  (for next event)

  // events
  eventActive: null,   // { id, name, type, desc, apply() }
  nextEventAt: Date.now() + 60_000,
  nextEventId: null,

  lastSeen: Date.now()
};

/** ===== 事件池（先做少量就很好玩） ===== */
const EVENTS = [
  {
    id: "good_sleep",
    name: "睡得很好",
    type: "🟢 好狀態",
    desc: "短時間精神很好：回復更快、點數也更穩。",
    durationSec: 180,
    apply() {
      addTimedBuff({
        id: "good_sleep",
        name: "睡得很好",
        regenMul: 1.35,
        pointsMul: 1.20,
        workoutMul: 0.95,
        durationSec: 180
      });
    }
  },
  {
    id: "overtime",
    name: "臨時加班",
    type: "🟡 代價事件",
    desc: "點數變多，但更耗體力（運動更累）。",
    durationSec: 180,
    apply() {
      addTimedBuff({
        id: "overtime",
        name: "臨時加班",
        regenMul: 0.95,
        pointsMul: 1.60,
        workoutMul: 0.90,
        extraWorkoutCost: 5,
        durationSec: 180
      });
    }
  },
  {
    id: "burn_mode",
    name: "燃燒挑戰",
    type: "🔴 賭一把",
    desc: "3 分鐘內：運動收益大幅提高，但每次運動更耗體力。適合衝里程碑。",
    durationSec: 180,
    apply() {
      addTimedBuff({
        id: "burn_mode",
        name: "燃燒挑戰",
        regenMul: 0.85,
        pointsMul: 0.95,
        workoutMul: 1.90,
        extraWorkoutCost: 5,
        durationSec: 180
      });
    }
  },
  {
    id: "low_mood",
    name: "低潮來襲",
    type: "🔵 逆風事件",
    desc: "短時間整體變慢，但如果你願意撐過去，反而更有成就感（小補償）。",
    durationSec: 180,
    apply() {
      addTimedBuff({
        id: "low_mood",
        name: "低潮來襲",
        regenMul: 0.80,
        pointsMul: 0.85,
        workoutMul: 0.90,
        durationSec: 180,
        onEndBonusPoints: 25
      });
    }
  }
];

/** ===== timed buff（一次只保留一個，先簡化） ===== */
let activeBuff = null; // { id, name, regenMul, pointsMul, workoutMul, extraWorkoutCost, endsAt, onEndBonusPoints }
function addTimedBuff(buff) {
  const now = Date.now();
  activeBuff = {
    id: buff.id,
    name: buff.name,
    regenMul: buff.regenMul ?? 1,
    pointsMul: buff.pointsMul ?? 1,
    workoutMul: buff.workoutMul ?? 1,
    extraWorkoutCost: buff.extraWorkoutCost ?? 0,
    onEndBonusPoints: buff.onEndBonusPoints ?? 0,
    endsAt: now + (buff.durationSec ?? 180) * 1000
  };
  el.hint.textContent = `事件生效：${activeBuff.name}（約 ${(buff.durationSec ?? 180) / 60} 分鐘）`;
}

/** ===== 計算公式 ===== */
function prestigeMultipliers() {
  return {
    points: 1 + 0.10 * state.prestigeLevel,
    regen:  1 + 0.05 * state.prestigeLevel
  };
}

function modeMultipliers() {
  switch (state.mode) {
    case "recovery":
      return { regen: 1.25, workout: 0.85, points: 1.15, name: "恢復派" };
    case "sprint":
      return { regen: 0.85, workout: 1.25, points: 0.95, name: "衝刺派" };
    default:
      return { regen: 1.0, workout: 1.0, points: 1.0, name: "平衡派" };
  }
}

function buffMultipliers() {
  if (!activeBuff) return { regen: 1, points: 1, workout: 1, extraWorkoutCost: 0 };
  return {
    regen: activeBuff.regenMul ?? 1,
    points: activeBuff.pointsMul ?? 1,
    workout: activeBuff.workoutMul ?? 1,
    extraWorkoutCost: activeBuff.extraWorkoutCost ?? 0
  };
}

function efficiency() {
  return 1 + state.health * 0.02;
}

function energyRegen() {
  const m = modeMultipliers();
  const p = prestigeMultipliers();
  const b = buffMultipliers();
  return (0.8 + state.health * 0.01) * m.regen * p.regen * b.regen;
}

function pointsPerSec() {
  const m = modeMultipliers();
  const p = prestigeMultipliers();
  const b = buffMultipliers();
  return (0.05 + state.health * 0.002) * m.points * p.points * b.points;
}

function milesPerSec() {
  // 鞋等級小加成 + 健康小加成（可選）
  const shoe = 1 + state.shoesLevel * 0.03;
  const health = 1 + state.health * 0.001;
  return state.milesPerSecBase * shoe * health;
}

function milesPerSec() {
  // 鞋等級小加成 + 健康小加成（可選）
  const shoe = 1 + state.shoesLevel * 0.03;
  const health = 1 + state.health * 0.001;
  return state.milesPerSecBase * shoe * health;
}

function workoutGain() {
  const m = modeMultipliers();
  const b = buffMultipliers();
  return ((1 + state.shoesLevel * 0.2) * efficiency()) * m.workout * b.workout;
}

function currentWorkoutCost() {
  const b = buffMultipliers();
  return state.workoutCost + (b.extraWorkoutCost ?? 0);
}

function shoesPrice() {
  return Math.floor(state.shoesBasePrice * Math.pow(state.shoesGrowth, state.shoesLevel));
}

/** ===== DOM ===== */
const el = {
  points: document.getElementById("points"),
  energy: document.getElementById("energy"),
  energyMax: document.getElementById("energyMax"),
  health: document.getElementById("health"),
  eff: document.getElementById("eff"),
  regen: document.getElementById("regen"),
  hint: document.getElementById("hint"),

  restBtn: document.getElementById("restBtn"),
  workoutBtn: document.getElementById("workoutBtn"),
  buyShoesBtn: document.getElementById("buyShoesBtn"),
  shoesPrice: document.getElementById("shoesPrice"),
  shoesLevel: document.getElementById("shoesLevel"),

  modeName: document.getElementById("modeName"),
  modeBalancedBtn: document.getElementById("modeBalancedBtn"),
  modeRecoveryBtn: document.getElementById("modeRecoveryBtn"),
  modeSprintBtn: document.getElementById("modeSprintBtn"),

  autoStatus: document.getElementById("autoStatus"),
  buyAutoBtn: document.getElementById("buyAutoBtn"),
  autoPrice: document.getElementById("autoPrice"),

  plannerStatus: document.getElementById("plannerStatus"),
  buyPlannerBtn: document.getElementById("buyPlannerBtn"),
  plannerPrice: document.getElementById("plannerPrice"),

  nextEventName: document.getElementById("nextEventName"),
  nextEventCountdown: document.getElementById("nextEventCountdown"),
  nextEventPlan: document.getElementById("nextEventPlan"),

  lapMiles: document.getElementById("lapMiles"),
  lapTarget: document.getElementById("lapTarget"),
  totalMiles: document.getElementById("totalMiles"),
  lapBar: document.getElementById("lapBar"),
  nextUnlockText: document.getElementById("nextUnlockText"),

  eventPanel: document.getElementById("eventPanel"),
  eventTitle: document.getElementById("eventTitle"),
  eventType: document.getElementById("eventType"),
  eventDesc: document.getElementById("eventDesc"),
  acceptEventBtn: document.getElementById("acceptEventBtn"),
  skipEventBtn: document.getElementById("skipEventBtn"),
  eventFinePrint: document.getElementById("eventFinePrint"),

  prestigeLevel: document.getElementById("prestigeLevel"),
  prestigeBonus: document.getElementById("prestigeBonus"),
  prestigeBtn: document.getElementById("prestigeBtn"),
  prestigeHint: document.getElementById("prestigeHint")
};

/** ===== 存檔 ===== */
function save() {
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    ...state,
    lastSeen: Date.now(),
    activeBuff
  }));
}

function load() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return;
  try {
    const obj = JSON.parse(raw);
    Object.assign(state, obj);
    activeBuff = obj.activeBuff ?? null;
  } catch {
    // ignore
  }
}

/** ===== 離線收益 ===== */
function offlineProgress() {
  const now = Date.now();
  const sec = Math.min((now - state.lastSeen) / 1000, 12 * 3600);

  // energy + points
  state.energy += energyRegen() * sec;
  state.points += pointsPerSec() * sec;

  // offline auto workout (simple)
  if (state.autoUnlocked) {
    const possible = Math.floor(sec / state.autoInterval);
    const energyLimit = Math.floor(state.energy / currentWorkoutCost());
    const workouts = Math.min(possible, energyLimit, 2000);

    if (workouts > 0) {
      state.energy -= workouts * currentWorkoutCost();
      state.health += workouts * workoutGain();
    }
  }

  // buff expiration while offline (simple: if expired, grant end bonus once)
  handleBuffExpiration(now);

  // schedule event if time passed (if user was away)
  if (!state.eventActive && now >= state.nextEventAt) {
    spawnNextEvent(now);
  }

  clamp();
}

/** ===== 行為 ===== */
function clamp() {
  state.energy = Math.max(0, Math.min(state.energy, state.energyMax));
  state.points = Math.max(0, state.points);
  state.health = Math.max(0, state.health);
  state.shoesLevel = Math.max(0, state.shoesLevel);
  if (typeof state.prestigeLevel !== "number") state.prestigeLevel = 0;
}

function rest() {
  state.energy += state.restGain;
  clamp();
  el.hint.textContent = "休息了一下，體力恢復。";
  save();
  render();
}

function workout() {
  const cost = currentWorkoutCost();
  if (state.energy < cost) {
    el.hint.textContent = "體力不足，先休息。";
    return;
  }
  state.energy -= cost;
  const gain = workoutGain();
  state.health += gain;
  clamp();
  el.hint.textContent = `完成運動，健康 +${gain.toFixed(1)}（消耗 ${cost} 體力）`;
  save();
  render();
}

function buyShoes() {
  const price = shoesPrice();
  if (state.points < price) {
    el.hint.textContent = "點數不夠。";
    return;
  }
  state.points -= price;
  state.shoesLevel += 1;
  el.hint.textContent = "跑鞋升級，運動更有效率。";
  save();
  render();
}

function buyAuto() {
  if (state.autoUnlocked) {
    el.hint.textContent = "已解鎖自動運動。";
    return;
  }
  if (state.points < state.autoPrice) {
    el.hint.textContent = "點數不夠，先累積一下。";
    return;
  }
  state.points -= state.autoPrice;
  state.autoUnlocked = true;
  el.hint.textContent = "✅ 解鎖成功！自動運動已啟用。";
  save();
  render();
}

function buyPlanner() {
  if (state.plannerUnlocked) {
    el.hint.textContent = "已解鎖事件預覽。";
    return;
  }
  if (state.points < state.plannerPrice) {
    el.hint.textContent = "點數不夠，先累積一下。";
    return;
  }
  state.points -= state.plannerPrice;
  state.plannerUnlocked = true;
  el.hint.textContent = "✅ 解鎖成功！你可以提前預覽下一個事件了。";
  save();
  render();
}

/** ===== 自動運動（線上） ===== */
function autoWorkoutStep() {
  if (!state.autoUnlocked) return;
  const cost = currentWorkoutCost();
  if (state.energy < cost) return;
  state.energy -= cost;
  state.health += workoutGain();
  clamp();
}

/** ===== Buff 到期處理 ===== */
function handleBuffExpiration(now) {
  if (!activeBuff) return;
  if (now < activeBuff.endsAt) return;

  // end bonus once
  if (activeBuff.onEndBonusPoints && activeBuff.onEndBonusPoints > 0) {
    state.points += activeBuff.onEndBonusPoints;
    el.hint.textContent = `事件結束：${activeBuff.name}（補償 +${activeBuff.onEndBonusPoints} 點）`;
  } else {
    el.hint.textContent = `事件結束：${activeBuff.name}`;
  }
  activeBuff = null;
}

/** ===== 事件系統 ===== */
function pickRandomEventId() {
  const idx = Math.floor(Math.random() * EVENTS.length);
  return EVENTS[idx].id;
}

function eventById(id) {
  return EVENTS.find(e => e.id === id) || EVENTS[0];
}

function scheduleNextEvent(now) {
  // 2~4 分鐘之間（MVP）
  const delaySec = 120 + Math.floor(Math.random() * 120);
  state.nextEventAt = now + delaySec * 1000;

  // choose next event
  state.nextEventId = pickRandomEventId();

  // reset pre-decision if planner not unlocked
  if (!state.plannerUnlocked) state.plannedDecision = "none";
}

function spawnNextEvent(now) {
  const ev = eventById(state.nextEventId || pickRandomEventId());
  state.eventActive = { id: ev.id };
  // keep nextEventAt for countdown UI? we will reschedule after resolve
  renderEventPanel(ev);
}

function renderEventPanel(ev) {
  el.eventPanel.classList.remove("hidden");
  el.eventTitle.textContent = ev.name;
  el.eventType.textContent = ev.type;
  el.eventDesc.textContent = ev.desc;
  el.eventFinePrint.textContent = `效果：約 ${Math.round((ev.durationSec ?? 180)/60)} 分鐘。你可以接受或跳過。`;

  // If planner unlocked and user already chose for next event, show it in plan line
  // (Planning is for the upcoming event; once it is active, they still can click accept/skip normally)
}

function hideEventPanel() {
  el.eventPanel.classList.add("hidden");
}

function acceptEvent() {
  if (!state.eventActive) return;
  const ev = eventById(state.eventActive.id);

  // apply effect
  ev.apply();

  // clear active
  state.eventActive = null;

  // schedule next
  scheduleNextEvent(Date.now());

  hideEventPanel();
  save();
  render();
}

function skipEvent() {
  if (!state.eventActive) return;
  const ev = eventById(state.eventActive.id);
  state.eventActive = null;

  // small consolation for skipping? keep it neutral for MVP
  el.hint.textContent = `你跳過了事件：${ev.name}`;

  scheduleNextEvent(Date.now());
  hideEventPanel();
  save();
  render();
}

// ===== Track Unlocks =====
const TRACK_UNLOCKS = [
  { miles: 1,  text: "解鎖：事件系統（或事件更頻繁）", apply: () => {} },
  { miles: 5,  text: "解鎖：跑鞋升級（若已存在就當里程碑）", apply: () => {} },
  { miles: 10, text: "解鎖：事件預告", apply: () => { state.eventPeekUnlocked = true; } },
  { miles: 20, text: "解鎖：跑步速度 +10%", apply: () => { state.milesPerSecBase *= 1.10; } },
  { miles: 50, text: "解鎖：Prestige 門檻降低/永久加成（先留空）", apply: () => {} }
];

function milesPerSec() {
  // 跑鞋與健康給一點小加成（你也可以先全部拿掉）
  const shoe = 1 + (state.shoesLevel || 0) * 0.03;
  const health = 1 + (state.health || 0) * 0.001;
  return state.milesPerSecBase * shoe * health;
}

function checkTrackUnlocks() {
  while (
    state.trackLevel < TRACK_UNLOCKS.length &&
    state.totalMiles >= TRACK_UNLOCKS[state.trackLevel].miles
  ) {
    const u = TRACK_UNLOCKS[state.trackLevel];
    state.trackLevel += 1;
    if (typeof u.apply === "function") u.apply();
    if (el && el.hint) el.hint.textContent = `🔓 里程解鎖！${u.text}`;
    save?.();
  }
}

// 這個是你要在 tick() 呼叫的主函數
function trackStep(dt) {
  // 只在「跑步中」累積里程
  // 如果你沒有 activity 狀態機，就當作永遠在跑步（也可）
  const isRunning = (state.activity ? state.activity === "running" : true);
  if (!isRunning) return;

  const dm = milesPerSec() * dt;
  state.lapMiles += dm;
  state.totalMiles += dm;

  // 本圈完成：每 1 mile 結算一次（延遲回報爽點）
  while (state.lapMiles >= state.lapTarget) {
    state.lapMiles -= state.lapTarget;

    // 這裡是你「每圈結算」的獎勵，先給點數/錢都行
    // 如果你後面把 points 改成 money，這行也改即可
    state.points += 10;

    if (el && el.hint) el.hint.textContent = `🏁 完成 1 圈！獲得獎勵 +10`;
  }

  checkTrackUnlocks();
}

/** ===== Planner：提前預覽與預先決策 ===== */
function setPlannedDecision(decision) {
  // decision for the next event (before it happens)
  if (!state.plannerUnlocked) return;
  if (!["none", "accept", "skip"].includes(decision)) return;
  state.plannedDecision = decision;
  save();
  render();
}

/** ===== Prestige ===== */
function canPrestige() {
  return state.health >= 60;
}

function doPrestige() {
  if (!canPrestige()) return;

  state.prestigeLevel += 1;

  // reset run progress
  state.energy = 50;
  state.health = 0;
  state.shoesLevel = 0;

  // keep: points (you can decide to reset points too; MVP keep points to reduce frustration)
  // keep: auto/planner unlocks
  // clear: buff & event active
  activeBuff = null;
  state.eventActive = null;
  scheduleNextEvent(Date.now());
  state.autoTimer = 0;

  el.hint.textContent = `🌟 Prestige 成功！等級提升到 ${state.prestigeLevel}。`;
  save();
  render();
}

/** ===== UI ===== */
function formatCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}分${r}秒` : `${r}秒`;
}

function renderTimeline(now) {
  // show next event name
  if (!state.nextEventId) state.nextEventId = pickRandomEventId();
  const nextEv = eventById(state.nextEventId);

  if (state.plannerUnlocked) {
    el.nextEventName.textContent = nextEv.name;
  } else {
    el.nextEventName.textContent = "？？？（解鎖預覽可查看）";
  }

  el.nextEventCountdown.textContent = formatCountdown(state.nextEventAt - now);

  if (!state.plannerUnlocked) {
    el.nextEventPlan.textContent = "（未解鎖預先選擇）";
  } else {
    const map = { none: "未選擇", accept: "將接受", skip: "將跳過" };
    el.nextEventPlan.textContent = map[state.plannedDecision] || "未選擇";
  }
}

function render() {
  const now = Date.now();

  // top stats
  el.points.textContent = Math.floor(state.points);
  el.energy.textContent = Math.floor(state.energy);
  el.energyMax.textContent = state.energyMax;
  el.health.textContent = Math.floor(state.health);
  el.eff.textContent = efficiency().toFixed(2);
  el.regen.textContent = energyRegen().toFixed(2);
  el.modeName.textContent = modeMultipliers().name;

  // shoes
  el.shoesLevel.textContent = state.shoesLevel;
  el.shoesPrice.textContent = `（${shoesPrice()} 點）`;

  // buttons enabled
  el.workoutBtn.disabled = state.energy < currentWorkoutCost();
  el.buyShoesBtn.disabled = state.points < shoesPrice();

  // auto
  el.autoStatus.textContent = state.autoUnlocked ? "已解鎖" : "未解鎖";
  el.autoPrice.textContent = `（${state.autoPrice} 點）`;
  el.buyAutoBtn.disabled = state.autoUnlocked || state.points < state.autoPrice;

  // planner
  el.plannerStatus.textContent = state.plannerUnlocked ? "已解鎖" : "未解鎖";
  el.plannerPrice.textContent = `（${state.plannerPrice} 點）`;
  el.buyPlannerBtn.disabled = state.plannerUnlocked || state.points < state.plannerPrice;

  // prestige
  const p = prestigeMultipliers();
  el.prestigeLevel.textContent = state.prestigeLevel;
  el.prestigeBonus.textContent = `點數 x${p.points.toFixed(2)}、回復 x${p.regen.toFixed(2)}`;
  el.prestigeBtn.disabled = !canPrestige();
  el.prestigeHint.textContent = canPrestige()
    ? "✅ 你已達成條件，可以進行 Prestige。"
    : `需要健康 ≥ 60（目前 ${Math.floor(state.health)}）`;

  // event panel
  if (state.eventActive) {
    const ev = eventById(state.eventActive.id);
    renderEventPanel(ev);
  } else {
    hideEventPanel();
  }
  
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

  // timeline
  renderTimeline(now);
}

/** ===== 主循環 ===== */
let last = performance.now();
function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;

  // buff expiration
  handleBuffExpiration(Date.now());

  // base regen & points
  state.energy += energyRegen() * dt;
  state.points += pointsPerSec() * dt;

  // auto workout timer
  if (state.autoUnlocked) {
    state.autoTimer += dt;
    while (state.autoTimer >= state.autoInterval) {
      state.autoTimer -= state.autoInterval;
      autoWorkoutStep();
    }
  }

  // event scheduler
  const n = Date.now();
  if (!state.eventActive && n >= state.nextEventAt) {
    // spawn
    spawnNextEvent(n);

    // if planner has a pre-decision, auto resolve immediately
    if (state.plannerUnlocked && state.plannedDecision !== "none") {
      const decision = state.plannedDecision;
      state.plannedDecision = "none";
      if (decision === "accept") acceptEvent();
      if (decision === "skip") skipEvent();
    }
  }
  trackStep(dt);  
  clamp();
  render();
  requestAnimationFrame(tick);
}

/** ===== 初始化 ===== */
load();

// if no nextEvent scheduled (old save)
if (!state.nextEventAt || !state.nextEventId) {
  scheduleNextEvent(Date.now());
}

offlineProgress();
render();

// actions
el.restBtn.onclick = rest;
el.workoutBtn.onclick = workout;
el.buyShoesBtn.onclick = buyShoes;

el.buyAutoBtn.onclick = buyAuto;
el.buyPlannerBtn.onclick = buyPlanner;

el.modeBalancedBtn.onclick = () => { state.mode = "balanced"; el.hint.textContent = "切換：平衡派"; save(); render(); };
el.modeRecoveryBtn.onclick = () => { state.mode = "recovery"; el.hint.textContent = "切換：恢復派"; save(); render(); };
el.modeSprintBtn.onclick = () => { state.mode = "sprint"; el.hint.textContent = "切換：衝刺派"; save(); render(); };

// event
el.acceptEventBtn.onclick = acceptEvent;
el.skipEventBtn.onclick = skipEvent;

// prestige
el.prestigeBtn.onclick = doPrestige;

// autosave
setInterval(save, 10_000);
window.addEventListener("beforeunload", save);

requestAnimationFrame(tick);

// debug helpers
window.resetGame = () => {
  localStorage.removeItem(SAVE_KEY);
  location.reload();
};
window.peek = () => ({ state, activeBuff });
window.planAccept = () => setPlannedDecision("accept");
window.planSkip = () => setPlannedDecision("skip");
