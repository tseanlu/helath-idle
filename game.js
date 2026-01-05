const SAVE_KEY = "health_idle_mvp_v1";

const state = {
  points: 0,
  energy: 50,
  energyMax: 100,
  health: 0,

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
  return 0.8 + state.health * 0.01;
}

function pointsPerSec() {
  return 0.05 + state.health * 0.002;
}

function shoesPrice() {
  return Math.floor(
    state.shoesBasePrice * Math.pow(state.shoesGrowth, state.shoesLevel)
  );
}

function workoutGain() {
  return (1 + state.shoesLevel * 0.2) * efficiency();
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
  shoesPrice: document.getElementById("shoesPrice")
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

setInterval(save, 10000);
window.addEventListener("beforeunload", save);

requestAnimationFrame(tick);

// debug：在 console 輸入 resetGame() 可重來
window.resetGame = () => {
  localStorage.removeItem(SAVE_KEY);
  location.reload();
};
