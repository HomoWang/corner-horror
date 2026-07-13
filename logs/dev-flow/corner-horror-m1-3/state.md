# State: corner-horror-m1-3

## Phase 1 完成（2026-07-13 21:50）
- 已完成：專案腳手架（package.json/tsconfig/vite.config，TS+Vite+basic-ssl）、`src/shared/protocol.ts`（訊息驗證）、`server/ws-relay.ts`（host/controller 各一、last-wins+kick、轉發）、`server/vite-ws-plugin.ts`（/ws upgrade + /api/net 區網 IP）、host/controller 暫置頁（QR、btn 測試通路）、`tests/protocol.test.ts`。vitest 7/7 綠、tsc 綠、dev server 實跑 smoke 全過（含 last-wins kick）。
- 發現/偏差：
  - review 抓到 host 無 kick 的互踢迴圈（MEDIUM），已修復（relay 對舊 host 也送 kick）。
  - 本機 npm install 需 ChaCha20 TLS workaround（`NODE_OPTIONS='--tls-cipher-list=TLS_CHACHA20...' npm install --maxsockets 1`），已記入專案 memory。
  - 專案非 git repo，review 以逐檔重讀 + 實跑 smoke 替代 git diff。
- 下一步：Phase 2（手機控制器頁：orientation 數學 + sensors + controller 改寫 + 單元測試）

## Phase 2 完成（2026-07-13 22:05）
- 已完成：`src/shared/orientation.ts`（deviceorientation→指向四元數、頂邊指向慣例、recenter 只修 yaw）、`src/controller/sensors.ts`（iOS 權限手勢流程、null 值過濾、rAF 節流、wake lock）、controller 頁改寫（開始→權限→串流、歸中/action 鈕、指數退避重連 0.5s→5s、kick 停止重連）、`tests/orientation.test.ts` 9 測試。vitest 16/16、tsc PASS。
- 發現/偏差：
  - 自抓 HIGH：yawCorrectionFor 正負號錯（recenter 會放大偏差），已修並以冪等測試鎖定。
  - 補裝 @types/three 並對齊 0.178（three 不帶型別，計畫未列）。
  - 訊息契約明文化：host 把 q 套用到 (0,0,-1) 得光錐方向。
  - 待實機驗證項：雙平台權限流程、串流頻率 ≥30Hz、歸中手感（開發者執行）。
- 下一步：Phase 3（host 場景：scene.ts + flashlight.ts + main.ts 改寫）

## Phase 3 完成（2026-07-13 22:20）
- 已完成：`src/host/scene.ts`（6×3×6 暗房、四個可照亮物件、SpotLight、可調常數集中）、`src/host/flashlight.ts`（slerp 平滑、首筆對齊、斷線熄燈、滑鼠 fallback）、`src/host/main.ts` 改寫（場景組裝、QR 疊層連線後淡出、kick）、index.html 改寫（全螢幕 canvas + 疊層）。vitest 16/16、tsc PASS、vite build 成功、dev server smoke 全 200。
- 發現/偏差：index.html 未列於計畫 Phase 3 清單，屬 QR 疊層需求的必然載體，納入並記錄。controller 頁載入 472kB three chunk（區網無感，flag 不修）。
- 下一步：Step 7 計畫符合度審查
