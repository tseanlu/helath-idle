/* =========================================================
   Health Idle - Sport UI + Tabs + Runner + Sponsor + Shop
   - Auto run/rest loop
   - Sponsor (cooldown grows)
   - Shop (equipment boosts cardio/recovery)
   - Events (timeline + accept/skip)
   - Save/load + offline progress cap
   ========================================================= */

const SAVE_KEY = "health_idle_sport_v1";
const BUILD = "2026-01-08a";

/** ---------------- State ---------------- */
const state = {
  money: 0,

  energy: 70,
  energyMax: 100,

  // "Health" is a long-term quality metric (keep bounded-ish)
  health: 12,         // starts small
  healthCapUI: 120,   // only for progress bar visualization

  // Base abilities (training adds small permanent increments)
  baseCardio: 1.0,
  baseRecovery: 1.0,

  // Auto activity
  activity: "running",     // running | resting
  runDrainPerSec: 6.2,     // energy drain while running
  restThreshold: 0.30,     // start running when energy >= threshold

  // Track
  lapTarget: 1.0,
  lapMiles: 0,
  totalMiles: 0,
  milesPerSecBase: 0.0065, // 0.39 mile/min baseline
  trackLevel: 0,

  // Sponsor (main money)
  sponsor: {
    tier: 0,               // increases each claim
    nextAt: Date.now(),    // when claim available
    lastResult: null
  },

  // Equipment ownership
  owned: {
    shoes: null,
    clothes: null,
    towel: null,
    goggles: null
  },

  // Active event
  event: null,              // {type,title,desc,endsAt,accepted,mult:{speed,money,regen}}
  nextEventAt: Date.now() + 90_000,
  nextEventType: null,

  // Offline
  lastSeen: Date.now()
};

/** ---------------- Data: Shop ---------------- */
const SHOP_ITEMS = [
  // shoes
  { id: "shoe_basic",   slot: "shoes",  name: "👟 基礎跑鞋", price: 60,  stats: { cardio: 1.05 }, desc: "跑步更輕快：心肺 +5%" },
  { id: "shoe_pro",     slot: "shoes",  name: "👟 競速跑鞋", price: 180, stats: { cardio: 1.12 }, desc: "更快配速：心肺 +12%" },
  { id: "shoe_elite",   slot: "shoes",  name: "👟 菁英碳板鞋", price: 420, stats: { cardio: 1.20 }, desc: "穩定輸出：心肺 +20%" },

  // clothes
  { id: "cloth_basic",  slot: "clothes", name: "👕 排汗上衣", price: 80,  stats: { recovery: 1.06 }, desc: "更舒適：恢復 +6%" },
  { id: "cloth_pro",    slot: "clothes", name: "👕 壓縮衣",   price: 220, stats: { recovery: 1.12 }, desc: "更快回復：恢復 +12%" },

  // towel
  { id: "towel_basic",  slot: "towel",  name: "🧣 冰感毛巾", price: 90,  stats: { recovery: 1.05 }, desc: "降溫補給：恢復 +5%" },
  { id: "towel_pro",    slot: "towel",  name: "🧣 快乾毛巾", price: 240, stats: { recovery: 1.10 }, desc: "效率補給：恢復 +10%" },

  // goggles
  { id: "goggle_basic", slot: "goggles", name: "🕶️ 防風鏡",  price: 110, stats: { cardio: 1.04 }, desc: "視野更穩：心肺 +4%" },
  { id: "goggle_pro",   slot: "goggles", name: "🕶️ 運動太陽眼鏡", price: 260, stats: { cardio: 1.08 }, desc: "更專注：心肺 +8%" }
];

const TRACK_UNLOCKS = [
  { miles: 2,  text: "解鎖：贊助可能出現「大成功」", apply: () => {} },
  { miles: 6,  text: "解鎖：事件更常出現", apply: () => { /* handled in scheduling */ } },
  { miles: 12, text: "解鎖：跑步更省力（耗體力 -8%）", apply: () => { state.runDrainPerSec *= 0.92; } },
  { miles: 20, text: "解鎖：基礎跑速 +10%", apply: () => { state.milesPerSecBase *= 1.10; } }
];

/** ---------------- DOM ---------------- */
const el = {
  // tabs
  tabHome: document.getElementById("tabHome"),
  tabShop: document.getElementById("tabShop"),
  pageHome: document.getElementById("pageHome"),
  pageShop: document.getElementById("pageShop"),

  points: document.getElementById("points"),

  // track
  lapMiles: document.getElementById("lapMiles"),
  lapTarget: document.getElementById("lapTarget"),
  totalMiles: document.getElementById("totalMiles"),
  lapBar: document.getElementById("lapBar"),
  runner: document.getElementById("runner"),
  nextUnlockText: document.getElementById("nextUnlockText"),
  activity: document.getElementById("activity"),

  // status
  energy: document.getElementById("energy"),
  energyMax: document.getElementById("energyMax"),
  health: document.getElementById("health"),
  energyBar: document.getElementById("energyBar"),
  healthBar: document.getElementById("healthBar"),
  cardio: document.getElementById("cardio"),
  recovery: document.getElementById("recovery"),
  speed: document.getElementById("speed"),
  regen: document.getElementById("regen"),
  hint: document.getElementById("hint"),

  // actions
  workoutBtn: document.getElementById("workoutBtn"),
  restBtn: document.getElementById("restBtn"),

  // sponsor
  sponsorBtn: document.getElementById("sponsorBtn"),
  sponsorCountdown: document.getElementById("sponsorCountdown"),
  sponsorNextCd: document.getElementById("sponsorNextCd"),
  sponsorStatus: document.getElementById("sponsorStatus"),
  equipSummary: document.getElementById("equipSummary"),

  // events
  nextEventName: document.getElementById("nextEventName"),
  nextEventCountdown: document.getElementById("nextEventCountdown"),
  nextEventPlan: document.getElementById("nextEventPlan"),

  eventPanel: document.getElementById("eventPanel"),
  eventTitle: document.getElementById("eventTitle"),
  eventType: document.getElementById("eventType"),
  eventDesc: document.getElementById("eventDesc"),
  acceptEventBtn: document.getElementById("acceptEventBtn"),
  skipEventBtn: document.getElementById("skipEventBtn"),
  eventFinePrint: document.getElementById("eventFinePrint"),

  // shop
  shopList: document.getElementById("shopList"),
  ownedList: document.getElementById("ownedList")
};

/** ---------------- Utils ---------------- */
function clamp() {
  state.energy = Math.max(0, Math.min(state.energy, state.energyMax));
  state.money = Math.max(0, state.money);
  state.health = Math.max(0, state.health);
  state.lapMiles = Math.max(0, state.lapMiles);
  state.totalMiles = Math.max(0, state.totalMiles);
}

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
    if (!state.sponsor) state.sponsor = { tier: 0, nextAt: Date.now(), lastResult: null };
    if (!state.owned) state.owned = { shoes: null, clothes: null, towel: null, goggles: null };
    if (!state.nextEventAt) state.nextEventAt = Date.now() + 90_000;
    if (!state.activity) state.activity = "running";
  } catch {}
}

function fmtMMSS(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** ---------------- Abilities (base + equipment + diminishing health effect) ---------------- */
function healthPower() {
  // diminishing return to avoid runaway
  return Math.sqrt(Math.max(0, state.health));
}

function equipmentMultiplier(key) {
  // key: cardio or recovery
  let mult = 1.0;
  for (const slot of ["shoes", "clothes", "towel", "goggles"]) {
    const id = state.owned[slot];
    if (!id) continue;
    const item = SHOP_ITEMS.find(x => x.id === id);
    if (!item) continue;
    if (item.stats && item.stats[key]) mult *= item.stats[key];
  }
  return mult;
}

function cardioMult() {
  // cardio influenced by baseCardio * equipment * small health factor
  return state.baseCardio * equipmentMultiplier("cardio") * (1 + healthPower() * 0.01);
}

function recoveryMult() {
  return state.baseRecovery * equipmentMultiplier("recovery") * (1 + healthPower() * 0.008);
}

/** ---------------- Economy / movement ---------------- */
function milesPerSec() {
  // speed affected by cardio & events
  return state.milesPerSecBase * cardioMult() * eventMultipliers().speed;
}

function energyRegenPerSec() {
  // resting regen affected by recovery & events
  return (1.25 * recoveryMult()) * eventMultipliers().regen;
}

/** small passive money so player never fully stuck */
function passiveMoneyPerSec() {
  return 0.005; // tiny
}

function lapRewardMoney() {
  // lap reward: moderate, based on cardio
  return Math.floor(10 + 6 * (cardioMult() - 1));
}

/** ---------------- Sponsor system ---------------- */
const SPONSOR_CD_STEPS_MIN = [2, 5, 10, 30, 60, 120]; // minutes
function sponsorCooldownMinutes(tier) {
  if (tier < SPONSOR_CD_STEPS_MIN.length) return SPONSOR_CD_STEPS_MIN[tier];
  return 120; // cap at 2h
}

function sponsorNextCooldownMinutes() {
  return sponsorCooldownMinutes(state.sponsor.tier + 1);
}

function canClaimSponsor() {
  return Date.now() >= state.sponsor.nextAt;
}

function sponsorPayout() {
  // base payout scales with total miles a bit; also unlock at 2 miles: big success possible
  const base = 35 + state.totalMiles * 3;
  const allowBig = state.totalMiles >= 2;

  // probabilities
  const r = Math.random();
  if (allowBig && r < 0.10) {
    // big success
    return { kind: "大成功", money: Math.floor(base * 3.2), healthDelta: +0.6 };
  }
  if (r < 0.80) {
    // normal success
    return { kind: "成功", money: Math.floor(base * 1.2), healthDelta: +0.2 };
  }
  // fail
  return { kind: "失敗", money: Math.floor(base * 0.2), healthDelta: -0.3 };
}

function claimSponsor() {
  if (!canClaimSponsor()) return;

  const result = sponsorPayout();
  state.money += result.money;
  state.health += result.healthDelta;

  state.sponsor.lastResult = result;
  const cdMin = sponsorCooldownMinutes(state.sponsor.tier);
  state.sponsor.nextAt = Date.now() + cdMin * 60 * 1000;
  state.sponsor.tier += 1;

  clamp();
  el.hint.textContent = `📣 贊助${result.kind}：+$${result.money}，健康 ${result.healthDelta >= 0 ? "+" : ""}${result.healthDelta.toFixed(1)}`;
  save();
  render();
}

/** ---------------- Events ---------------- */
function scheduleNextEvent() {
  // base interval, gets a bit more frequent after 6 miles unlock
  const frequent = state.totalMiles >= 6;
  const min = frequent ? 60 : 90;
  const max = frequent ? 110 : 150;
  const ms = (min + Math.random() * (max - min)) * 1000;

  state.nextEventAt = Date.now() + ms;
  state.nextEventType = pickEventType();
}

function pickEventType() {
  const types = ["tailwind", "bonus", "rain", "cramp"];
  return randChoice(types);
}

function buildEvent(type) {
  const now = Date.now();
  const endsAt = now + 90_000;

  if (type === "tailwind") {
    return {
      type, title: "🟢 順風日", desc: "跑得更快一點。",
      accepted: false, endsAt,
      mult: { speed: 1.30, money: 1.00, regen: 1.00 },
      tip: "建議：維持跑步，趁 buff 推進里程。"
    };
  }
  if (type === "bonus") {
    return {
      type, title: "🟡 商業合作", desc: "跑步結算更賺，但恢復稍慢。",
      accepted: false, endsAt,
      mult: { speed: 1.00, money: 1.00, regen: 0.88 },
      tip: "建議：如果你體力還夠，就接受；太累就跳過。"
    };
  }
  if (type === "rain") {
    return {
      type, title: "🔵 下雨天", desc: "跑不快，但休息回復更好。",
      accepted: false, endsAt,
      mult: { speed: 0.85, money: 1.00, regen: 1.35 },
      tip: "建議：接受後更適合休息回血。"
    };
  }
  // cramp
  return {
    type: "cramp", title: "🔴 抽筋警訊", desc: "跑步效率下降。休息會更快緩解。",
    accepted: false, endsAt,
    mult: { speed: 0.75, money: 1.00, regen: 1.08 },
    tip: "建議：如果正在跑到很累，接受後轉休息。"
  };
}

function eventMultipliers() {
  if (!state.event || !state.event.accepted) return { speed: 1, money: 1, regen: 1 };
  return state.event.mult;
}

function updateEventLifecycle() {
  const now = Date.now();

  if (!state.nextEventType) state.nextEventType = pickEventType();
  if (!state.nextEventAt) scheduleNextEvent();

  // spawn prompt
  if (!state.event && now >= state.nextEventAt) {
    state.event = buildEvent(state.nextEventType);
    scheduleNextEvent();
    el.hint.textContent = `事件出現：${state.event.title}`;
    save();
  }

  // expire prompt (not accepted)
  if (state.event && !state.event.accepted && now >= state.event.endsAt) {
    state.event = null;
    save();
  }

  // end accepted event
  if (state.event && state.event.accepted && now >= state.event.endsAt) {
    el.hint.textContent = `事件結束：${state.event.title}`;
    state.event = null;
    save();
  }
}

function acceptEvent() {
  if (!state.event) return;
  state.event.accepted = true;
  el.hint.textContent = `✅ 已接受：${state.event.title}`;
  save();
  render();
}

function skipEvent() {
  if (!state.event) return;
  el.hint.textContent = "你跳過了事件。";
  state.event = null;
  save();
  render();
}

/** ---------------- Track unlocks ---------------- */
function checkTrackUnlocks() {
  while (state.trackLevel < TRACK_UNLOCKS.length &&
         state.totalMiles >= TRACK_UNLOCKS[state.trackLevel].miles) {
    const u = TRACK_UNLOCKS[state.trackLevel];
    state.trackLevel += 1;
    u.apply?.();
    el.hint.textContent = `🔓 里程解鎖！${u.text}`;
    save();
  }
}

/** ---------------- Activity loop ---------------- */
function stepActivity(dt) {
  // always get tiny passive money
  state.money += passiveMoneyPerSec() * dt;

  if (state.activity === "running") {
    // drain energy
    state.energy -= state.runDrainPerSec * dt;
    if (state.energy <= 0) {
      state.energy = 0;
      state.activity = "resting";
      // subtle hint only if needed
    }

    // earn miles
    const dm = milesPerSec() * dt;
    state.lapMiles += dm;
    state.totalMiles += dm;

    // lap completion -> money + tiny health (diminishing)
    while (state.lapMiles >= state.lapTarget) {
      state.lapMiles -= state.lapTarget;

      const m = lapRewardMoney();
      state.money += m;

      const hg = 0.55 / (1 + healthPower() * 0.25);
      state.health += hg;

      el.hint.textContent = `🏁 完成一圈！+$${m}，健康 +${hg.toFixed(2)}`;
      checkTrackUnlocks();
    }

  } else {
    // resting
    state.energy += energyRegenPerSec() * dt;
    if (state.energy >= state.energyMax * state.restThreshold) {
      state.activity = "running";
    }
  }
}

/** ---------------- Manual actions ---------------- */
function workout() {
  const cost = 18;
  if (state.energy < cost) {
    el.hint.textContent = "體力不足，先休息。";
    return;
  }
  state.energy -= cost;

  // training improves base abilities slightly (long-term)
  const gainH = 2.2 / (1 + healthPower() * 0.35);
  state.health += gainH;

  // small permanent ability increments
  state.baseCardio += 0.0025;
  state.baseRecovery += 0.0020;

  clamp();
  el.hint.textContent = `🏋️ 訓練完成：健康 +${gainH.toFixed(2)}（心肺/恢復小幅永久提升）`;
  save();
  render();
}

function restNap() {
  state.energy += 14;
  state.health += 0.12;
  clamp();
  el.hint.textContent = "😴 小睡一下：體力回來了。";
  save();
  render();
}

/** ---------------- Shop ---------------- */
function buyItem(id) {
  const item = SHOP_ITEMS.find(x => x.id === id);
  if (!item) return;

  if (state.money < item.price) {
    el.hint.textContent = "金錢不夠。";
    return;
  }

  // equip rule: same slot replace if better; we just replace directly
  state.money -= item.price;
  state.owned[item.slot] = item.id;

  el.hint.textContent = `🛒 已購買並裝備：${item.name}`;
  save();
  renderShop();
  render();
}

function slotLabel(slot) {
  switch(slot){
    case "shoes": return "鞋子";
    case "clothes": return "衣服";
    case "towel": return "毛巾";
    case "goggles": return "眼鏡";
    default: return slot;
  }
}

function equippedSummaryText() {
  const parts = [];
  for (const slot of ["shoes", "clothes", "towel", "goggles"]) {
    const id = state.owned[slot];
    if (!id) continue;
    const item = SHOP_ITEMS.find(x => x.id === id);
    if (!item) continue;
    parts.push(`${slotLabel(slot)}：${item.name}`);
  }
  return parts.length ? parts.join(" / ") : "尚未裝備任何東西。";
}

function renderShop() {
  if (!el.shopList) return;

  el.shopList.innerHTML = "";
  for (const item of SHOP_ITEMS) {
    const owned = state.owned[item.slot] === item.id;

    const card = document.createElement("div");
    card.className = "shopItem";

    const top = document.createElement("div");
    top.className = "shopTop";

    const name = document.createElement("div");
    name.className = "shopName";
    name.textContent = item.name;

    const badge = document.createElement("span");
    badge.className = "badge subtle";
    badge.textContent = owned ? "已裝備" : slotLabel(item.slot);

    top.appendChild(name);
    top.appendChild(badge);

    const meta = document.createElement("div");
    meta.className = "shopMeta";
    meta.textContent = item.desc;

    const buyRow = document.createElement("div");
    buyRow.className = "shopBuyRow";

    const price = document.createElement("div");
    price.className = "price";
    price.textContent = `$${item.price}`;

    const btn = document.createElement("button");
    btn.textContent = owned ? "✅ 使用中" : "購買";
    btn.disabled = owned || state.money < item.price;
    btn.onclick = () => buyItem(item.id);

    buyRow.appendChild(price);
    buyRow.appendChild(btn);

    card.appendChild(top);
    card.appendChild(meta);
    card.appendChild(buyRow);

    el.shopList.appendChild(card);
  }

  // owned list
  if (el.ownedList) {
    const lines = [];
    for (const slot of ["shoes","clothes","towel","goggles"]) {
      const id = state.owned[slot];
      if (!id) continue;
      const item = SHOP_ITEMS.find(x => x.id === id);
      if (!item) continue;
      lines.push(`• ${slotLabel(slot)}：${item.name}（${item.desc}）`);
    }
    el.ownedList.textContent = lines.length ? lines.join("\n") : "（尚未購買任何裝備）";
  }
}

/** ---------------- Tabs ---------------- */
function setTab(tab) {
  const isHome = tab === "home";
  el.pageHome.classList.toggle("hidden", !isHome);
  el.pageShop.classList.toggle("hidden", isHome);

  el.tabHome.classList.toggle("active", isHome);
  el.tabShop.classList.toggle("active", !isHome);

  if (!isHome) renderShop();
}

/** ---------------- Offline ---------------- */
function offlineProgress() {
  const now = Date.now();
  const sec = Math.min((now - state.lastSeen) / 1000, 2 * 3600); // cap 2h
  if (sec <= 0) return;

  // simulate in small steps, without spawning new events offline (stability)
  const savedEvent = state.event;
  const savedNextEventAt = state.nextEventAt;
  const savedNextEventType = state.nextEventType;

  // lock events offline
  state.event = null;
  state.nextEventAt = now + 999999999;
  state.nextEventType = null;

  const step = 1.0;
  let t = 0;
  while (t < sec) {
    const dt = Math.min(step, sec - t);
    stepActivity(dt);
    clamp();
    t += dt;
  }

  // restore event schedule
  state.event = savedEvent;
  state.nextEventAt = savedNextEventAt || (Date.now() + 90_000);
  state.nextEventType = savedNextEventType || pickEventType();

  el.hint.textContent = `離線收益已結算（${Math.floor(sec/60)} 分鐘）`;
}

/** ---------------- Render ---------------- */
function render() {
  // money
  el.points.textContent = Math.floor(state.money);

  // track
  el.lapMiles.textContent = state.lapMiles.toFixed(2);
  el.lapTarget.textContent = state.lapTarget.toFixed(2);
  el.totalMiles.textContent = state.totalMiles.toFixed(1);

  const lapPct = Math.max(0, Math.min(1, state.lapMiles / state.lapTarget));
  el.lapBar.style.width = (lapPct * 100).toFixed(1) + "%";

  // runner position along track (0..100%)
  // runner is absolutely positioned in trackLine; we map to %
  el.runner.style.left = (lapPct * 100).toFixed(2) + "%";

  // runner animation state (requires CSS .runner.running / .runner.resting)
  if (el.runner) {
    el.runner.classList.toggle("running", state.activity === "running");
    el.runner.classList.toggle("resting", state.activity !== "running");
  }
  if (el.activity) {
    el.activity.textContent = state.activity === "running" ? "🏃 跑步中" : "😴 休息中";
  }

  // activity badge
  el.activity.textContent = state.activity === "running" ? "🏃 跑步中" : "😴 休息中";

  // stats
  el.energy.textContent = Math.floor(state.energy);
  el.energyMax.textContent = state.energyMax;
  el.health.textContent = Math.floor(state.health);

  const ePct = state.energyMax > 0 ? (state.energy / state.energyMax) : 0;
  el.energyBar.style.width = Math.max(0, Math.min(100, ePct * 100)).toFixed(1) + "%";

  const hPct = Math.max(0, Math.min(1, state.health / state.healthCapUI));
  el.healthBar.style.width = (hPct * 100).toFixed(1) + "%";

  const c = cardioMult();
  const r = recoveryMult();
  el.cardio.textContent = c.toFixed(2);
  el.recovery.textContent = r.toFixed(2);

  el.speed.textContent = (milesPerSec() * 60).toFixed(2);
  el.regen.textContent = energyRegenPerSec().toFixed(2);

  // next unlock
  const next = TRACK_UNLOCKS[state.trackLevel];
  el.nextUnlockText.textContent = next ? `${next.miles} miles：${next.text}` : "已完成目前所有解鎖 ✅";

  // sponsor
  const now = Date.now();
  const sLeft = state.sponsor.nextAt - now;
  el.sponsorCountdown.textContent = fmtMMSS(sLeft);
  el.sponsorNextCd.textContent = `${sponsorNextCooldownMinutes()} 分鐘`;
  el.sponsorBtn.disabled = !canClaimSponsor();
  el.sponsorStatus.textContent = canClaimSponsor() ? "可領取" : "冷卻中";

  // equip summary
  el.equipSummary.textContent = equippedSummaryText();

  // events timeline + panel
  el.nextEventName.textContent = state.nextEventType ? ({
    tailwind: "🟢 順風日", bonus: "🟡 商業合作", rain: "🔵 下雨天", cramp: "🔴 抽筋警訊"
  }[state.nextEventType] || "—") : "—";
  el.nextEventCountdown.textContent = fmtMMSS(state.nextEventAt - now);
  el.nextEventPlan.textContent = planText();

  if (!state.event) {
    el.eventPanel.classList.add("hidden");
  } else {
    el.eventPanel.classList.remove("hidden");
    el.eventTitle.textContent = state.event.title;
    el.eventType.textContent = state.event.accepted ? "進行中" : "可選擇";
    el.eventDesc.textContent = state.event.desc;
    el.eventFinePrint.textContent = state.event.tip + `（剩餘 ${fmtMMSS(state.event.endsAt - now)}）`;

    el.acceptEventBtn.disabled = !!state.event.accepted;
    el.skipEventBtn.disabled = !!state.event.accepted;
  }

  // buttons
  el.workoutBtn.disabled = state.energy < 18;
}

/** small planner suggestion */
function planText() {
  // simple heuristic based on next event type + current energy
  const e = state.energy / state.energyMax;
  const type = state.nextEventType;

  if (!type) return "—";
  if (type === "rain") return e < 0.35 ? "先休息，等雨天buff回血" : "接受後更適合休息回血";
  if (type === "tailwind") return e < 0.25 ? "先補體力，別浪費順風" : "保持跑步，推進里程";
  if (type === "cramp") return e > 0.60 ? "可接受但注意疲勞" : "偏向休息避免拖慢";
  return e > 0.45 ? "可考慮接受" : "太累可跳過";
}

/** ---------------- Main loop ---------------- */
let last = performance.now();
function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;

  updateEventLifecycle();
  stepActivity(dt);

  clamp();
  render();

  requestAnimationFrame(tick);
}

/** ---------------- Wire ---------------- */
function init() {
  // tabs
  el.tabHome.onclick = () => setTab("home");
  el.tabShop.onclick = () => setTab("shop");

  // actions
  el.workoutBtn.onclick = workout;
  el.restBtn.onclick = restNap;

  // sponsor
  el.sponsorBtn.onclick = claimSponsor;

  // events
  el.acceptEventBtn.onclick = acceptEvent;
  el.skipEventBtn.onclick = skipEvent;

  // initial schedule
  if (!state.nextEventType) state.nextEventType = pickEventType();
  if (!state.nextEventAt) scheduleNextEvent();
  if (!state.sponsor.nextAt) state.sponsor.nextAt = Date.now();

  // autosave
  setInterval(save, 10_000);
  window.addEventListener("beforeunload", save);
}

/** ---------------- Boot ---------------- */
load();
offlineProgress();
init();
render();
requestAnimationFrame(tick);

// debug helper
window.resetGame = () => { localStorage.removeItem(SAVE_KEY); location.reload(); };
window.state = state;
window.BUILD = BUILD;
