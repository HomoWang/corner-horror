# State: corner-horror-m7-8

## 完成日期

2026-07-13

## 模組 7：完整遊戲流程

- Controller ready 後由 Host 顯示開始畫面，不再自動啟動事件。
- 「開始體驗」會解鎖房間 Web Audio、重置 director 並啟動事件時間線。
- 人影消失後保留 2.8 秒餘韻，再顯示結束畫面。
- 「再玩一次」可完整重置並重跑；Controller 斷線會中止並回到 QR。

## 模組 8：2.5D 電影式場景

- 新增 CinematicBackdrop shader，讀取 2×2 寫實 spritesheet。
- 四個影格：空房、畫像異變、人影出現、消失後。
- 手電筒四元數投影成 screen UV 光罩，包含柔邊、hot spot、輕微呼吸閃爍、暗角與顆粒。
- 影格切換使用 140ms 交叉淡化，最後再進入既有 homography 投影校正。
- 圖片載入失敗時保留原本程序化 3D 房間 fallback。

## 視覺資產

- 專案檔案：public/assets/room-sequence.png
- 生成方式：Codex built-in image generation
- Prompt：固定視點荒廢公寓房間的 2×2 photorealistic horror spritesheet；四格依序為空房、畫像異變、人影出現及人影消失後；禁止文字、分隔線、UI、浮水印及額外人物。

## 自動驗證

- vitest：PASS（28/28）
- TypeScript typecheck：PASS
- Vite build：PASS
- HTTPS dev smoke：Host 200、Controller 200、room spritesheet 200。
- WebSocket E2E：status、orient、cue 全部成功。

## 待實機驗收

1. 投影畫面確認 spritesheet 四格裁切方向正確。
2. 手機手電筒光罩大小、亮度與現場投影黑位是否合適。
3. 事件切格的 140ms 過渡是否夠像驚嚇跳格；必要時改成更短或直接硬切。
4. 完整跑一次開始、事件、結束、重玩與中途斷線。
