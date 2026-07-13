# Codex 接手 Review 紀錄（2026-07-13）

## 結論

模組 1–3 在目前的 `npm run dev` 使用方式與正常操作流程下可用：主機頁顯示 QR、手機掃碼、按「開始」並授權感測器後，控制資料可傳到主機。自動檢查結果為 vitest 16/16、TypeScript typecheck 通過、Vite build 通過。

以下項目不阻擋目前已實測的 happy path，統一列為後續開發需處理的 P2 邊界／部署強化，不再列為 P1：

1. **控制器連線狀態與感測器 ready 狀態混用**
   - controller 頁載入即連 WebSocket；relay 隨即向 host 回報 `controller: true`。
   - 若使用者未按「開始」、拒絕權限或沒有方向資料，host 仍會隱藏 QR 並停用滑鼠 fallback。
   - 後續應拆分 `connected` / `ready`，或在第一筆有效方向資料後才切換 host 輸入模式。

2. **正式 build / Vite preview 沒有 relay 與 `/api/net`**
   - relay 目前只實作 Vite `configureServer`，所以 `npm run dev` 正常。
   - `npm run preview` 使用 `configurePreviewServer`；純靜態 `dist` 也不會包含 Node relay。
   - 在進入可部署階段前需提供共用 preview hook 或獨立 production server。

3. **WebSocket 連線缺少 `error` handler**
   - `ws` 在 frame 或 socket 錯誤時會 emit `error`；未處理可能令開發伺服器退出。
   - 後續 relay 強化時應安裝 error handler 並安全清理角色狀態。

4. **WebSocket payload 上限過大**
   - `WebSocketServer` 沿用 `ws` 的 100 MiB 預設值，但本專案訊息只有數百 bytes。
   - 後續應把 `maxPayload` 限制在數 KB；若進入公開部署，再加入 origin／配對 token。

## 測試缺口

現有自動測試集中在 protocol 與 orientation；尚未覆蓋 relay lifecycle、controller ready 狀態、preview server、WebSocket 錯誤與 payload 邊界。模組 4–6 開發時會優先補上與新協定／事件邏輯相關的純單元測試。

## 環境備註

專案目前不是 Git repository，因此本次 review 以現有 snapshot、逐檔閱讀及實際執行測試／typecheck／build 為準。

## 接續開發處理狀態

- 控制器 ready 狀態：**已處理**。Host 現在等到第一筆有效 `orient` 才隱藏 QR、停用滑鼠 fallback 並開始事件流程；controller last-wins 取代時會重新等待 ready。
- Preview／production relay：**保留待發布階段處理**。目前開發與實機流程仍以 `npm run dev` 為準。
- WebSocket error handler：**已處理**。relay 會安全清除錯誤連線並通知 Host。
- WebSocket payload：**已處理**。上限已由預設 100 MiB 降為 8 KiB。
