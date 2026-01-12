# Training Idle – v3（先不做 Prestige）

這版把「體力/能量」改成更像運動科學的模型，解你提到的痛點：
- 以前：訓練一直吃體力 → 很難參加賽事 → 玩家得一直手動休息  
- 現在：你永遠可以訓練/比賽，但 **Fatigue 高就會表現變差**（自然會想安排恢復）

## 狀態與能力
### 長期能力（慢慢長）
- VO₂max（25–75）
- Endurance（0–100）
- Strength（0–100）
- Recovery（0–100）

### 短期狀態（會上下）
- Fatigue（0–160）：累積疲勞，影響成功率/成長/比賽
- Condition（-0.15..+0.15）：每日狀態（今天比較強或比較弱）

## 每日事件 → 重新做成「Daily Modifiers」
每天會有 1–2 個 modifier 來推你改策略（不只是看而已）：
- 推薦項目：成功率/成長加成
- 天氣：疲勞成本變動

## Training（主循環）
跑 / 騎 / 游 / 爬 四類課表：
- 每個 track 有 Level（1–10）與 Mastery（0–1）
- 點 Start → 倒數 → 自動結算（成功/勉強/失敗）
- 成功：升級更快、成長更多、但疲勞也會堆

## Races（驗證，不是刷錢）
比賽改成看 **Readiness**（綜合 VO₂+Endurance+Recovery+Strength，再被 Condition/Fatigue 修正）+ 最低門檻。
- 獎金不高、疲勞打很重 → 逼你真的要練好再去

## Shop（build 方向）
裝備只給 multiplier，不給暴力加成，避免你說的數字爆表：
- Shoes → VO₂
- Top → Endurance
- Towel → Recovery
- Poles → Strength

## Prestige
這版不做（先把核心 loop 打磨順）
