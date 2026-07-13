# Dev-Flow Log: corner-horror-m1-3

## 任務資訊
- 計畫文件：claude_data/plans/plan-corner-horror-modules-1-3.md
- 開始時間：2026-07-13 21:30
- 完成時間：2026-07-13 22:30
- 模式：claude（全程 claude 實作 + 自審）
- 審查輪數：Plan Review 1 輪 PASS；Batch 1 兩輪（1 MEDIUM 修復）；Batch 2 一輪（1 HIGH 實作中自抓修復）；Batch 3 一輪 PASS

## 開發檔案（實作順序）
1. package.json / tsconfig.json / vite.config.ts：TS + Vite + basic-ssl 腳手架、多頁 input、WS plugin 掛載
2. src/shared/protocol.ts：訊息型別 + parseMessage 白名單驗證
3. server/ws-relay.ts：host/controller 角色管理（last-wins + kick）、orient/btn 轉發
4. server/vite-ws-plugin.ts：/ws upgrade 攔截（避開 HMR）、/api/net 區網 IP
5. index.html + src/host/main.ts：暫置 host 頁（QR + 訊息顯示）
6. controller.html + src/controller/main.ts：暫置 controller 頁（測試鈕）
7. tests/protocol.test.ts：7 測試
8. src/shared/orientation.ts：deviceorientation→指向四元數（頂邊慣例）、recenter 只修 yaw
9. src/controller/sensors.ts：iOS 權限手勢流程、null 過濾、rAF 節流、wake lock
10. src/controller/main.ts + controller.html 改寫：開始→權限→串流、歸中/action、指數退避重連
11. tests/orientation.test.ts：9 測試
12. src/host/scene.ts：暗房 + 可照亮物件 + SpotLight（可調常數集中）
13. src/host/flashlight.ts：slerp 平滑、首筆對齊、斷線熄燈、滑鼠 fallback
14. src/host/main.ts + index.html 改寫：場景組裝、QR 疊層淡出

## 測試結果
- L1 Unit test：pass（16/16：protocol 7 + orientation 9）
- L2 Integration test：pass（dev server 實跑雙 WS 客戶端：註冊/轉發/last-wins/kick 全驗證）
- L3 Smoke test：pass（vite build 成功；host/controller 頁 + /api/net + 模組轉譯全 200）

## 審查結果（最終輪）
- 彙整判定：PASS（Batch 1–3 全 PASS，剩 7 個 LOW flag）

## 修復歷程
- Batch 1 第 1 輪：[MEDIUM] host 無 kick，雙 host 分頁互踢無限迴圈 → 修復（relay 對舊 host 送 kick + host 頁停止重連）→ 第 2 輪 PASS
- Batch 2 實作中：[HIGH] yawCorrectionFor 正負號錯誤（recenter 放大偏差）→ 寫測試推導期望值時抓到，修復並以冪等測試鎖定 → 第 1 輪 PASS
- Batch 3 第 1 輪：PASS

## 環境事件
- 本機 npm install 反覆 ERR_SSL_CIPHER_OPERATION_FAILED：診斷為 Node 24 TLS AES-GCM 大流量解密問題（Node 原生 fetch 大檔可重現、ChaCha20 正常）。Workaround：`NODE_OPTIONS='--tls-cipher-list=TLS_CHACHA20_POLY1305_SHA256:...' npm install --maxsockets 1`，已記入專案 memory。

## Flag（未處理的 LOW 問題）
- controller 測試鈕滑鼠情境 pointerup 可能落鈕外漏送 release（觸控不受影響）
- Android deviceorientation 為絕對方位（磁力計），實測若抖動由 host slerp 常數吸收
- wake lock 分頁切換後不自動重取
- controller 頁載入 472kB three chunk（僅用數學類；區網無感）
- 專案非 git repo：review 以逐檔重讀 + 實跑 smoke 替代 git diff（建議之後 git init）

## 待開發者實機驗收
1. `npm run dev` → 投影/瀏覽器開 https://192.168.0.237:5173（首次啟動允許 Windows 防火牆）
2. 手機掃 QR → 接受自簽憑證警告 → 按「開始」授權感測器
3. 驗證：光錐跟手體感（目測延遲 <100ms）、歸中鈕、斷線熄燈重連恢復、iOS/Android 雙平台權限流程
