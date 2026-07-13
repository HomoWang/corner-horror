# Code Review: Batch 2（手機控制器頁）

## 審查模式
claude（自審 checklist）

## 審查檔案
- src/shared/orientation.ts
- src/controller/sensors.ts
- src/controller/main.ts
- controller.html
- tests/orientation.test.ts

> 註：非 git repo，以逐檔重讀 + 單元測試數值驗證替代 git diff。

## 逐項審查

### 1. 正確性
**判定：PASS（實作中自抓一個 HIGH 級數學 bug，測試前已修）**
- `yawCorrectionFor` 初版正負號錯誤（繞世界 Y 轉 θ 使方位角「減少」θ，修正量應等於方位角而非其負值）——寫測試推導期望值時抓到，已修正；9 個 orientation 測試含 recenter 冪等性驗證全過。
- 指向公式沿用 three.js DeviceOrientationControls 已驗證管線（YXZ 內旋 + 螢幕方向補償），僅尾端加「-Z→頂邊」軸轉換；6 個姿態測試（平放/直立/仰角/滾轉/螢幕旋轉補償）數值全對。
- iOS `requestPermission()` 在 click handler 的同步堆疊內呼叫（首個 await 之前），權限手勢要求滿足。
- `deviceorientation` 事件值全 null（桌機常見）已過濾；2 秒無資料顯示明確提示。
- recenter 在無感測資料時為 no-op（已防護）。

### 2. 安全性
**判定：PASS**
- 無新攻擊面；收訊仍走 parseMessage；無 DOM 注入（全 textContent）。

### 3. 效能
**判定：PASS**
- 事件 handler 只存最新角度，rAF 節流計算與上送（≈60Hz、每則 ~80B）；四元數物件每幀新建屬微小配置，對 60Hz 無感（不預先最佳化）。

### 4. 程式碼品質
**判定：PASS**
- 數學/感測/UI 三層分離（orientation 純函式 → sensors 封裝瀏覽器 API → main 只管 UI 與連線）；常數具名（重連退避、無感測 timeout）。

### 5. 專案規範
**判定：PASS**
- 沿用 Phase 1 慣例（TS strict、繁中註解講約束、reconnect/kick 模式與 host 頁一致）。

### 6. 測試覆蓋
**判定：PASS**
- orientation 9 測試：4 個基準姿態 + 滾轉不變性 + 螢幕方向補償不變性 + recenter 三件套（歸中、保 pitch、冪等）。sensors/main 為瀏覽器 API 膠水，依計畫以實機驗證。

### 7. 一致性
**判定：PASS**
- 訊息契約（q 套用到 (0,0,-1)）在 orientation.ts 註解明文化，Phase 3 host 端依此實作。

## 問題清單

### [HIGH]（已修復，測試前自抓）yawCorrectionFor 正負號錯誤
- **檔案**：src/shared/orientation.ts:47
- **問題**：修正量取了方位角的負值，recenter 會把偏差放大一倍而非歸零
- **修復**：改為回傳方位角本身；`recenter 冪等`測試鎖住此行為

### [LOW] @types/three 初裝到 0.185 與 three 0.178 不齊
- 已改裝 @types/three@0.178 對齊。記錄供日後升級 three 時同步

### [LOW] Android Chrome 的 deviceorientation 為絕對方位（含磁力計），可能有抖動
- recenter 機制本就吸收任意零點；若實測抖動明顯，Phase 3 的 host 端 slerp 平滑可調。記錄不修

### [LOW] wake lock 於分頁切換後不會自動重新取得
- 實測影響小（玩家全程停在頁面）；如成問題再加 visibilitychange 重取

## 總結
- MEDIUM+ 問題數：1（HIGH，已修復並以測試鎖定）
- LOW 問題數：3
- **判定：PASS**
- 測試：vitest 16/16 綠、tsc PASS（見 test_result.txt）
