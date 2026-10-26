# 檔案工具

手機瀏覽器用的 PWA。合併 PDF、圖片轉 PDF、相機掃描、分割抽頁，全部在裝置本機完成，檔案不會上傳到任何伺服器。

v1.1 新增：

- PDF 轉圖片：挑出頁面轉成 JPEG，可一次分享多張
- 批次刪除：勾選多頁後一次刪掉
- 自訂檔名：匯出前可以改檔名

## 開發

```bash
npm install
python3 scripts/make_fixtures.py     # 產生測試素材與 PWA icon
npm run dev                          # http://localhost:5173/file-tools/
npm run build                        # 正式建置（含 service worker 預快取）
npm run preview                      # 預覽建置結果
```

`scripts/make_fixtures.py` 需要 Python 的 `pypdf` 與 `Pillow`（`pip install pypdf Pillow`）。

相機需要安全來源。`localhost` 算安全來源，所以本機開發可以測；用 IP 連手機測相機時必須走 HTTPS。

## 測試

```bash
npm test                             # Vitest，純函式層
npm run e2e                          # Playwright，瀏覽器流程
npx tsc -b                           # 型別檢查（務必用 -b，本專案的 tsconfig 是 references 結構）
```

型別檢查用 `npx tsc -b`，本專案不使用 linter。

E2E 的前置條件（全新環境必做）：

```bash
npx playwright install chromium      # 沒裝瀏覽器，npm run e2e 會直接失敗
python3 scripts/make_fixtures.py     # tests/fixtures/ 被 .gitignore 排除，跑 e2e 前必須先產生
```

## 架構

所有來源正規化成單一 `Page[]` 清單，各功能是同一條資料路徑上的不同入口與匯出選項。

- `src/state/documentReducer.ts` — `Page[]` 的唯一變更入口，純函式
- `src/core/exporter.ts` — 唯一寫 PDF 的地方
- `src/core/scanner/geometry.ts` — 透視校正，純函式
- `src/core/scanner/filters.ts` — 影像增強，純函式
- `src/core/pdfjs.ts` — pdf.js 的 worker 只能設定一次，這裡集中設定；是 thumbnailer 與 pageToImage 唯一真正共用的東西
- `src/core/pageToImage.ts` — PDF 頁面轉 JPEG，序列渲染、逐頁釋放 canvas
- `src/core/thumbnailer.ts`、`src/core/scanner/camera.ts`、`src/core/output.ts` — 瀏覽器專屬的轉接層

純函式層不依賴任何瀏覽器 API，所以 PDF 正確性這件最重要的事能在 Node 下完整測試。

## 更新行為

PWA 用 `prompt` 模式。發佈新版後，新的 service worker 會等所有分頁都關閉才啟用，不會在操作到一半時重載而丟掉載入中的頁面；下次打開就是新版。

## 不支援的事

- Word、Excel、PowerPoint 轉 PDF。需要伺服器端的排版引擎，使用者文件必須上傳，與零伺服器的前提衝突
- 檔案庫與歷史紀錄。匯出即結束，不留存
- 自動邊緣偵測。裁切框要手動對齊四個角
- OCR
- 多頁圖片打包成 ZIP。分割本來就刻意不引入 ZIP 概念，手機上 ZIP 也不好解
- PNG 輸出。照片類影像存成 PNG 體積會大到不可用，圖片一律輸出 JPEG

## 真機手動測試清單

自動化測不到、每次改動 `output.ts` 或 PWA 設定後都要在真 iPhone 上跑一遍：

- [ ] 按「儲存／分享」會跳出 iOS 系統分享選單，且能存進「檔案」App
- [ ] 加到主畫面後以 standalone 模式開啟（沒有 Safari 的網址列）
- [ ] 開飛航模式後仍能開啟 app 並完成一次合併與匯出
- [ ] 從相簿選取 HEIC 照片能正常轉成 PDF
- [ ] 掃描時相機是後鏡頭
- [ ] 掃描三頁再加一份既有 PDF 合併，一趟流程完成，不需要匯出中間檔
- [ ] VoiceOver 能單獨聚焦縮圖上的「旋轉」與「刪除」按鈕（根 div 帶著 dnd-kit 的 `role="button"`，裡面放真 button 是巢狀互動元素，螢幕閱讀器的行為只能真機驗）
- [ ] 長按拖曳排序在觸控下正常，且不與頁面捲動衝突（自動化只測得到滑鼠拖曳）
- [ ] `navigator.share` 不可用時，`a[download]` 的退路在 standalone 模式下會不會變成在 app 內開啟預覽而無法返回
- [ ] 大檔下載時，iOS 的確認框若停留超過 60 秒，blob URL 是否已失效
- [ ] 離線狀態下縮圖正常顯示（不是「縮圖失敗」）
- [ ] 部署新版後，關閉所有分頁再重開確實拿到新版
- [ ] 單張照片匯出 JPEG 在 iOS 分享選單裡的行為；以及相機權限被拒後的畫面與引導
- [ ] 一次分享多張圖片時，iOS 的分享選單能不能一次全部存進相簿
- [ ] **20 頁的多檔分享 iOS 撐不撐得住**（`LIMITS.maxImageExportPages` 這個數字是估計值，依實測調整）
- [ ] 2000px 的 JPEG 在 iPhone 上渲染 20 頁的實際耗時與記憶體峰值
- [ ] 自訂檔名含中文時，存進「檔案」App 後顯示是否正確

## 部署

v1 完成後拆為獨立 repo `mikeli678/file-tools`，用 GitHub Actions 建置並發佈到該 repo 的 GitHub Pages。Vite 的 `base` 與 manifest 的 `start_url`、`scope` 都必須是 `/file-tools/`。
