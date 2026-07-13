# Plan Review: corner-horror-m1-3

## 審查模式
claude（自審 checklist）

## 計畫文件
claude_data/plans/plan-corner-horror-modules-1-3.md

## 逐項評估

### 1. 目標清晰度
**判定：PASS**
- 驗證目標明確且可觀測：「手機一揮、牆上光錐跟著動」，並有量化驗收（目測延遲 < 100ms、串流 ≥ 30Hz）。範圍明確限定模組 1–3，模組 4–6 列為明確不做。

### 2. 方案合理性
**判定：PASS**
- 單一 port + 單一自簽憑證解掉「HTTPS 頁面必須配 wss」的耦合問題，是最小摩擦做法。
- relay 與協定邏輯獨立於 Vite plugin，符合上游 idea「A 到 C 不重寫」的路徑要求。
- 陀螺儀數學獨立成純函式模組並單測，正確對應全案最高風險點（各機型軸向/漂移）。
- last-wins 角色管理讓手機重整即重連，符合實測迭代場景。

### 3. 範圍適當性
**判定：PASS**
- YAGNI 邊界清楚：warp、校正 UI、音訊分流、震動、事件系統全數排除，與上游 idea「先驗證核心互動」結論一致。
- 滑鼠 fallback 雖非驗證目標必需，但直接服務開發迭代效率，成本一檔內，納入合理。

### 4. 風險識別
**判定：PASS**
- 覆蓋憑證信任、HMR WebSocket 衝突、Windows 防火牆、陀螺儀漂移、桌機無感測器、延遲抖動六項，皆附具體對策。
- 上游 idea 的 iOS 權限、iPhone 無震動風險已在範圍設計中吸收（權限流程納入 Phase 2；震動屬模組 5 不在本範圍）。

### 5. Phase 劃分
**判定：PASS**
- 相依鏈 P1→P2→P3 線性清楚，各 Phase 有完整檔案清單與可獨立執行的驗收標準。
- Phase 1 檔案數約 10（超過 2–6 建議值），但其中 package.json / tsconfig.json / 兩個 html 為腳手架樣板，實質邏輯檔為 4 個（ws-relay、vite-ws-plugin、protocol、兩端暫置 main）；拆成「純腳手架 Phase」會產生無可驗收行為的空 Phase，維持現狀較合理。記為 LOW。

## 問題清單

### [LOW] Phase 1 檔案數超過建議粒度
- **檔案**：claude_data/plans/plan-corner-horror-modules-1-3.md（Phase 1 段）
- **問題**：列出約 10 檔，超過 2–6 建議；但過半為零邏輯樣板檔
- **建議**：不拆分；實作時樣板檔先行、邏輯檔逐一完成並各自驗證

## 總結
- MEDIUM+ 問題數：0
- LOW 問題數：1
- **判定：PASS**
- 審查輪次：第 1 輪
