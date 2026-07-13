# State: corner-horror-m4-6

## 完成時間

2026-07-13

## 模組 4：轉角幾何校正

- 場景改為先渲染到 WebGLRenderTarget，再以 inverse homography shader 投影到任意凸四邊形。
- Host 新增四角拖曳校正 UI、四條對位線、重設／完成與 `C` 快捷鍵。
- normalized 校正值保存至 localStorage，重新整理後自動恢復。
- 新增 calibration 純函式與 4 個測試。

## 模組 5：音訊分流

- Host 新增程序化低頻環境音與 sting，需點「啟動房間聲音」解鎖 Web Audio。
- Controller 在「開始」手勢內同時請求方向權限與解鎖 Web Audio。
- 新增 host→controller `cue` 協定：ring、whisper、impact；impact 在支援裝置上呼叫 Vibration API。
- relay 新增 cue 轉發、error 清理、8 KiB maxPayload 與 3 個整合單元測試。

## 模組 6：事件系統

- 新增可測試 ScriptedEventEngine：time、look+dwell、action rising-edge、依賴與 once-only。
- 第一段事件：4 秒手機來電 → 凝視掛畫 650ms 異變 → 12 秒角落人影出現 → 凝視人影 450ms 後消失並在手機衝擊／震動。
- action 鈕在來電後可觸發一次手機耳語。
- Host 必須收到第一筆 orientation 才標記 controller ready 並開始事件；斷線或 controller 被取代會重置。

## 自動驗證

- vitest：28/28 通過（5 個 test files）。
- TypeScript typecheck：通過。
- Vite production build：通過。
- HTTPS dev smoke：Host 200、Controller 200、`/api/net` 正常。
- WebSocket E2E：status、orient、cue 全部成功。

## 待實機驗收

1. 投影機上拖動 TL/TR/BR/BL，確認兩面牆的實際對位與透視觀感。
2. 點 Host「啟動房間聲音」，確認環境音走房間喇叭；手機事件音走手機喇叭。
3. Android 驗證 impact 震動；iPhone 驗證無震動時仍正常播放衝擊音。
4. 依事件節奏照向掛畫與右側人影，確認凝視角度與時間門檻符合現場手感。

## 仍保留的部署限制

`npm run preview`／純靜態 dist 尚未包含 `/ws` relay 與 `/api/net`；進入公開部署階段時需補獨立 production server 或 preview hook。
