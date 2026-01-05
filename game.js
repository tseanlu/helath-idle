const SAVE_KEY = "health_idle_mvp_v1";

const state = {
  points: 0,
  energy: 50,
  energyMax: 100,
  health: 0,
  mode: "balanced", // balanced | recovery | sprint

  workoutCost: 10,
  restGain: 10,

  shoesLevel: 0,
  shoesBasePrice: 20,
  shoesGrowth: 1.35,

  lastSeen: Date.now()
};

// ===== 計算公式 =====
function efficiency() {
  return 1 + state.health * 0.02;
}

function energyRegen() {
  const m = modeMultipliers();
  return (0.8 + state.health * 0.01) * m.regen;
}


function pointsPerSec() {
  const m = modeMultipliers();
  return (0.05 + state.health * 0.002) * m.points;
}

function workoutGain() {
  const m = modeMultipliers();
  return ((1 + state.shoesLevel * 0.2) * efficiency()) * m.workout;
}

function shoesPrice() {
  return Math.floor(
    state.shoesBasePrice * Math.pow(state.shoesGrowth, state.shoesLevel)
  );
}


function modeMultipliers() {
  // 你可以把這當成「生活節奏」
  switch (state.mode) {
    case "recovery":
      return { regen: 1.25, workout: 0.85, points: 1.15, name: "恢復派" };
    case "sprint":
      return { regen: 0.85, workout: 1.25, points: 0.95, name: "衝刺派" };
    default:
      return { regen: 1.0, workout: 1.0, points: 1.0, name: "平衡派" };
  }
}

// ===== DOM =====
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

  modeName: document.getElementById("modeName"),
  modeBalancedBtn: document.getElementById("modeBalancedBtn"),
  modeRecoveryBtn: document.getElementById("modeRecoveryBtn"),
  modeSprintBtn: document.getElementById("modeSprintBtn")
};

// ===== 存檔 =====
function save() {
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    ...state,
    lastSeen: Date.now()
  }));
}

function load() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return;
  Object.assign(state, JSON.parse(raw));
}

// ===== 離線收益 =====
function offlineProgress() {
  const now = Date.now();
  const sec = Math.min((now - state.lastSeen) / 1000, 12 * 3600);

  state.energy += energyRegen() * sec;
  state.points += pointsPerSec() * sec;

  clamp();
}

// ===== 行為 =====
function clamp() {
  state.energy = Math.max(0, Math.min(state.energy, state.energyMax));
  state.points = Math.max(0, state.points);
  state.health = Math.max(0, state.health);
}

function rest() {
  state.energy += state.restGain;
  clamp();
  el.hint.textContent = "休息了一下，體力恢復。";
  save();
}

function workout() {
  if (state.energy < state.workoutCost) {
    el.hint.textContent = "體力不足，先休息。";
    return;
  }
  state.energy -= state.workoutCost;
  state.health += workoutGain();
  clamp();
  el.hint.textContent = `完成運動，健康 +${workoutGain().toFixed(1)}`;
  save();
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
}

// ===== UI =====
function render() {
  el.points.textContent = Math.floor(state.points);
  el.energy.textContent = Math.floor(state.energy);
  el.energyMax.textContent = state.energyMax;
  el.health.textContent = Math.floor(state.health);
  el.eff.textContent = efficiency().toFixed(2);
  el.regen.textContent = energyRegen().toFixed(2);
  el.shoesPrice.textContent = `（${shoesPrice()} 點）`;

  el.workoutBtn.disabled = state.energy < state.workoutCost;
  el.buyShoesBtn.disabled = state.points < shoesPrice();
  el.modeName.textContent = modeMultipliers().name;
}

// ===== 主循環 =====
let last = performance.now();
function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;

  state.energy += energyRegen() * dt;
  state.points += pointsPerSec() * dt;

  clamp();
  render();
  requestAnimationFrame(tick);
}

// ===== 初始化 =====
load();
offlineProgress();
render();

el.restBtn.onclick = rest;
el.workoutBtn.onclick = workout;
el.buyShoesBtn.onclick = buyShoes;

el.modeBalancedBtn.onclick = () => { state.mode = "balanced"; el.hint.textContent = "切換：平衡派"; save(); render(); };
el.modeRecoveryBtn.onclick = () => { state.mode = "recovery"; el.hint.textContent = "切換：恢復派"; save(); render(); };
el.modeSprintBtn.onclick = () => { state.mode = "sprint"; el.hint.textContent = "切換：衝刺派"; save(); render(); };

setInterval(save, 10000);
window.addEventListener("beforeunload", save);

requestAnimationFrame(tick);

// debug：在 console 輸入 resetGame() 可重來
window.resetGame = () => {
  localStorage.removeItem(SAVE_KEY);
  location.reload();
};
