# Code Review: Batch 3（場景渲染 + 光錐跟手）

## 審查模式
claude（自審 checklist）

## 審查檔案
- src/host/scene.ts
- src/host/flashlight.ts
- src/host/main.ts
- index.html（計畫未列，見「問題清單」LOW）

> 註：非 git repo，以逐檔重讀 + `vite build` + dev server 實跑替代 git diff。

## 逐項審查

### 1. 正確性
**判定：PASS**
- 訊息契約閉環比對：controller 送 `q:[x,y,z,w]` → `Flashlight.setTargetQuaternion` 以 `Quaternion.set(...)` 同序接收 → 套用到 (0,0,-1)，與 orientation.ts 明文契約一致。
- slerp 平滑用 `1-exp(-dt·k)` 幀率無關；three 的 slerp 自帶最短路徑處理（負 dot 反轉），跨 180° 不會繞遠路。
- 首筆 orient 直接對齊（避免光錐從原點掃過）；斷線 `hasTarget=false` 熄燈；分頁休眠回來的大 dt 有夾住（0.1s 上限）。
- 滑鼠 fallback 以 `isConnected` 閘控，控制器連線時不干擾；NDC 轉換 y 軸正負號正確（unproject 驗證）。
- SpotLight 的 target Object3D 有加入 scene（否則矩陣不更新，光不會動）。

### 2. 安全性
**判定：PASS**
- 無新攻擊面；狀態列輸出全走 textContent。

### 3. 效能
**判定：PASS**
- 每幀配置僅一個方向向量 clone（60Hz 無感）；pixelRatio 夾 2 防高 DPI 投影機過載；light/相機常數集中檔頂可調。

### 4. 程式碼品質
**判定：PASS**
- scene（建景）/ flashlight（方向狀態機）/ main（組裝與連線）責任分明；實測調整常數（FOV、光錐角、平滑速度、強度）具名且集中。

### 5. 專案規範
**判定：PASS**
- 沿用既有慣例（TS strict、繁中約束註解、reconnect/kick 模式與前兩 Phase 一致）。

### 6. 測試覆蓋
**判定：PASS**
- 純函式層（protocol/orientation）已有 16 測試；渲染層依計畫不寫自動化測試，以 `vite build`（打包/匯入正確性）+ dev server 實跑（頁面 200、模組轉譯 200）+ 開發者實機驗收替代。

### 7. 一致性
**判定：PASS**
- host 頁保留 Phase 1 的 QR/連線行為（改為疊層呈現），controller 無需任何變更即可對接。

## 問題清單

### [LOW] index.html 改寫未列於計畫 Phase 3 檔案清單
- 全螢幕 canvas + QR 疊層屬 Phase 3「QR 疊層」需求的必然載體，納入本 Phase（Step 6 前置規則：改法明顯的小項納入並記錄）

### [LOW] controller 頁因 orientation.ts 引用 three 而載入 472kB three chunk
- 區網環境無感；若日後要瘦身可手寫四元數數學。記錄不修

### [LOW] btn 訊息目前僅顯示於狀態列
- 為模組 6（事件系統）預留的通路驗證，符合計畫範圍

## 總結
- MEDIUM+ 問題數：0
- LOW 問題數：3
- **判定：PASS**（第 1 輪）
- 測試：vitest 16/16、tsc PASS、vite build 成功、dev server smoke 全 200
