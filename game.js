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

  milestones: {
    autoUnlocked: false,   // 健康 20
    modeBoostUnlocked: false // 健康 40
  },

  autoUnlocked: false,
  autoPrice: 60,          // 解鎖價格（習慣點數）
  autoInterval: 5,        // 每幾秒嘗試一次自動運動
  autoTimer: 0,           // 計時器（不用動）

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

function checkMilestones() {
  // Milestone 1：健康 ≥ 20 → 自動運動
  if (!state.milestones.autoUnlocked && state.health >= 20) {
    state.milestones.autoUnlocked = true;
    state.autoUnlocked = true; // 直接啟用你原本的自動運動系統
    el.hint.textContent = "🎉 里程碑達成！你已經養成習慣，自動運動已解鎖。";
    save();
  }

  // Milestone 2：健康 ≥ 40 → 生活型態強化
  if (!state.milestones.modeBoostUnlocked && state.health >= 40) {
    state.milestones.modeBoostUnlocked = true;
    el.hint.textContent = "💪 里程碑達成！你的生活型態獲得強化。";
    save();
  }
}

function nextMilestone() {
  // 你目前的里程碑：20 自動運動、40 模式強化、60 Prestige 預告
  if (!state.milestones.autoUnlocked) {
    return { target: 20, title: "健康 ≥ 20：解鎖自動運動" };
  }
  if (!state.milestones.modeBoostUnlocked) {
    return { target: 40, title: "健康 ≥ 40：強化生活型態" };
  }
  if (state.health < 60) {
    return { target: 60, title: "健康 ≥ 60：解鎖『人生重來』資格（預告）" };
  }
  return { target: null, title: "✅ 目前里程碑已完成（下一步：實裝 Prestige）" };
}

function modeMultipliers() {
  const boosted = state.milestones.modeBoostUnlocked ? 1.1 : 1.0;

  switch (state.mode) {
    case "recovery":
      return {
        regen: 1.25 * boosted,
        workout: 0.85,
        points: 1.15,
        name: "恢復派"
      };
    case "sprint":
      return {
        regen: 0.85,
        workout: 1.25 * boosted,
        points: 0.95,
        name: "衝刺派"
      };
    default:
      return {
        regen: 1.0,
        workout: 1.0,
        points: 1.0 * boosted,
        name: "平衡派"
      };
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
  modeSprintBtn: document.getElementById("modeSprintBtn"),

  autoStatus: document.getElementById("autoStatus"),
  buyAutoBtn: document.getElementById("buyAutoBtn"),
  autoPrice: document.getElementById("autoPrice"),

  msTitle: document.getElementById("msTitle"),
  msBar: document.getElementById("msBar"),
  msProgressText: document.getElementById("msProgressText"),
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

  if (state.autoUnlocked) {
    const workouts = Math.min(
      Math.floor(sec / state.autoInterval),
      Math.floor(state.energy / state.workoutCost),
      2000 // 安全上限，避免極端狀況卡死
    );
    state.energy -= workouts * state.workoutCost;

    // 簡化：用當下的 workoutGain 估算（足夠 MVP）
    state.health += workouts * workoutGain();
  }

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

function buyAuto() {
  if (state.autoUnlocked) {
    el.hint.textContent = "已經解鎖自動運動了。";
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

// 自動運動：不顯示提示、不一直刷 hint（避免吵）
function autoWorkoutStep() {
  if (!state.autoUnlocked) return;
  if (state.energy < state.workoutCost) return;

  state.energy -= state.workoutCost;
  state.health += workoutGain();
  clamp();
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

  el.autoStatus.textContent = state.autoUnlocked ? "已解鎖" : "未解鎖";
  el.autoPrice.textContent = `（${state.autoPrice} 點）`;
  el.buyAutoBtn.disabled = state.autoUnlocked || state.points < state.autoPrice;

  // ===== 里程碑 UI =====
  const ms = nextMilestone();
  el.msTitle.textContent = ms.title;

  if (ms.target === null) {
    el.msProgressText.textContent = "—";
    el.msBar.style.width = "100%";
  } else {
    const cur = Math.max(0, Math.floor(state.health));
    const pct = Math.max(0, Math.min(100, (cur / ms.target) * 100));
    el.msBar.style.width = pct.toFixed(1) + "%";
    el.msProgressText.textContent = `${cur} / ${ms.target}`;
  }

}

// ===== 主循環 =====
let last = performance.now();
function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;

  state.energy += energyRegen() * dt;
  state.points += pointsPerSec() * dt;

  checkMilestones();

  // 自動運動計時
  if (state.autoUnlocked) {
    state.autoTimer += dt;
    while (state.autoTimer >= state.autoInterval) {
      state.autoTimer -= state.autoInterval;
      autoWorkoutStep();
    }
  }

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
el.buyAutoBtn.onclick = buyAuto;

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
