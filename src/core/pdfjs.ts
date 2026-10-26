import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// 用 ?url 匯入是為了讓 worker 成為建置產物的一部分，PWA 的預快取才抓得到它。
// 離線時少了這個檔，縮圖與轉圖片會整批失敗，而且錯誤不明顯。
//
// 這個模組存在的唯一理由：workerSrc 只能設定一次。thumbnailer 與 pageToImage
// 都要用 pdf.js，但兩者的生命週期完全不同（前者要快取、並發、世代控制；
// 後者是一次性、序列、產出 Blob），所以不合併成同一個模組，只共用這裡。
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export { pdfjs }
