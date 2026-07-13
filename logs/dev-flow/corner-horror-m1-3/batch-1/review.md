# Code Review: Batch 1（腳手架 + 通訊層）

## 審查模式
claude（自審 checklist）

## 審查檔案
- package.json / tsconfig.json / vite.config.ts
- server/ws-relay.ts
- server/vite-ws-plugin.ts
- src/shared/protocol.ts
- index.html / src/host/main.ts
- controller.html / src/controller/main.ts
- tests/protocol.test.ts

> 註：專案非 git repo，無法 `git diff`；以「逐檔重讀 + 實際啟動 dev server 做端到端 smoke」替代（smoke 結果見下）。

## 逐項審查

### 1. 正確性
**判定：PASS（第 1 輪 FAIL，修復後通過）**
- 端到端 smoke 驗證：host/controller hello 註冊、status 推送、btn/orient 轉發、controller last-wins kick 全部實測正確（dev server 實跑 + 雙 WS 客戶端腳本）。
- 第 1 輪發現 [MEDIUM] host 無 kick：兩個 host 分頁會互踢無限重連（見問題清單），已修復。
- ws 的 `send()` 於 CLOSING/CLOSED 不丟例外（僅 CONNECTING 會），`safeSend` try/catch 已涵蓋；被取代連線的 close 事件以 `this.x === ws` 防誤清，時序正確（同步賦值先於非同步 close 事件）。

### 2. 安全性
**判定：PASS**
- 所有進站訊息經 `parseMessage` 白名單驗證，未知型別/格式一律丟棄；無 eval/innerHTML（log 用 textContent）；無硬編碼機密。自簽憑證為本地開發既定方案（計畫已載明）。

### 3. 效能
**判定：PASS**
- relay 轉發 O(1)；host 頁 orient log 有 500ms 節流、log 行數上限 50；無累積性資料結構。

### 4. 程式碼品質
**判定：PASS**
- 模組邊界清楚（protocol 純函式 / relay 無框架依賴 / plugin 只做掛載）；命名一致；註解只講不明顯的約束（last-wins 時序、HMR 放行）。

### 5. 專案規範
**判定：PASS**
- 全新專案，本 Phase 即建立慣例：TS strict、ESM、vitest、繁中註解。無 lint 設定（未列入計畫範圍）。

### 6. 測試覆蓋
**判定：PASS**
- protocol 純函式 7 個測試涵蓋全部訊息型別與拒絕路徑（壞 JSON、非字串、NaN/Infinity、錯誤 role/id）。relay 以實跑 smoke 驗證（計畫載明 WS I/O 不寫自動化測試）。

### 7. 一致性
**判定：PASS**
- host/controller 兩頁結構、reconnect/kick 模式一致。

## 問題清單

### [MEDIUM]（已修復）host 被取代時無 kick，雙 host 分頁互踢無限迴圈
- **檔案**：server/ws-relay.ts:66、src/host/main.ts
- **問題**：舊 host 被 `close()` 後 1 秒自動重連，再把新 host 踢掉，形成搶奪迴圈
- **修復**：relay 對舊 host 也送 `kick`；host 頁收到 kick 停止重連並提示。修復後重跑測試全綠

### [LOW] controller 測試鈕滑鼠情境下 pointerup 可能落在鈕外漏送 release
- 觸控有 implicit pointer capture 不受影響；此鈕為暫置驗證用，Phase 2 改寫。記錄不修

## 總結
- MEDIUM+ 問題數：1（已修復並複測）
- LOW 問題數：1
- **判定：PASS**（第 2 輪）

## 附：實測 smoke 紀錄
- `npm run dev` 啟動成功（HTTPS :5173）
- `/api/net` → `{"ip":"192.168.0.237","port":5173}`；host / controller 頁均 200
- WS 雙客戶端：status(false)→status(true)→btn→orient 轉發→第二 controller 觸發舊 controller 收 kick ✓
- 環境註記：npm install 需 ChaCha20 TLS workaround（本機 Node 24 AES-GCM 問題，已記入 memory）
