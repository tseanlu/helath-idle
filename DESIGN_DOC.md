# Training Idle – v3（完整功能版，先不做 Prestige）

你說「舊版體力一直被訓練吃掉，所以很難參加賽事」——這版已經把問題根治：
- 不再用 Energy gate
- 改用 **Fatigue（疲勞）** 影響成功率/成長/比賽時間
- 你隨時都能訓練或比賽，但累就會表現變差 → 玩家自然會做恢復策略

## 核心循環（你在玩什麼）
1) **Training**：選 Run/Bike/Swim/Hike 其中一個 Lv1–Lv10 課表 → 倒數 → 自動結算  
2) **Unlock**：打過 LvN → 解鎖 Lv(N+1)（每類各自進度）  
3) **Races**：用 Readiness 驗證 build（不是刷錢）→ 疲勞大增  
4) **Shop**：買裝備（只給 multiplier，不暴力加成）→ 形成流派 build  
5) **Sponsor**：可按鈕拿錢，但冷卻會變長（2m、5m、10m、30m…）避免不現實刷錢

## 數值模型
### 長期能力（慢慢長）
- VO₂max（25–75）
- Endurance / Strength / Recovery（0–100）

### 短期狀態（會上下）
- Fatigue（0–160）：會自然回復（Recovery 越高回復越快）
- Condition（-0.15..+0.15）：每日狀態 roll（會被 daily mod 影響）

### Readiness
綜合長期能力後，再被 Condition/Fatigue 修正，用於：
- 訓練成功率
- 比賽表現與時間

## Daily modifiers（取代舊事件軸）
每天 roll 2 個 modifier（例如：跑步疲勞 -12%、游泳成長 +15%、Condition +0.05…）
→ 會真的影響策略，而不是看熱鬧

## 不含 Prestige
本版刻意不做 prestige，把核心 loop 先做紮實。
