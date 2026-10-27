"""產生測試素材與 PWA icon。重複執行會覆蓋，結果不進 git。"""
import os
import zlib
import random
from pypdf import PdfWriter
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = os.path.join(ROOT, "tests", "fixtures")
PUB = os.path.join(ROOT, "public")
os.makedirs(FIX, exist_ok=True)
os.makedirs(PUB, exist_ok=True)

A4 = (595.28, 841.89)


def write(writer, name):
    with open(os.path.join(FIX, name), "wb") as fh:
        writer.write(fh)


# 三頁的正常 PDF，每頁尺寸不同以便驗證匯出後尺寸有被保留
w = PdfWriter()
w.add_blank_page(A4[0], A4[1])
w.add_blank_page(A4[1], A4[0])
w.add_blank_page(A4[0], A4[1])
write(w, "three-pages.pdf")

# 單頁，且該頁自己帶 /Rotate 90。用來驗證匯出時旋轉是疊加而非覆寫
w = PdfWriter()
page = w.add_blank_page(A4[0], A4[1])
page.rotate(90)
write(w, "rotated-90.pdf")

# 單頁，MediaBox 原點不在 (0,0)：[20 30 615 872]，即 x=20、y=30、寬 595、高 842。
# 用來驗證簽名座標有加上 MediaBox 原點偏移
from pypdf.generic import RectangleObject
w = PdfWriter()
page = w.add_blank_page(595, 842)
page.mediabox = RectangleObject([20, 30, 615, 872])
page.cropbox = RectangleObject([20, 30, 615, 872])
write(w, "offset-mediabox.pdf")

# 零頁
w = PdfWriter()
write(w, "empty.pdf")

# 加密（pdf-lib 載入時會丟 EncryptedPDFError）
w = PdfWriter()
w.add_blank_page(A4[0], A4[1])
w.encrypt("mikeai")
write(w, "encrypted.pdf")

# 損壞：有 PDF 標頭但內容是垃圾
with open(os.path.join(FIX, "corrupt.pdf"), "wb") as fh:
    fh.write(b"%PDF-1.7\n" + bytes(range(256)) * 4)

# 直向與橫向的 PNG 與 JPEG
Image.new("RGB", (100, 200), (200, 30, 30)).save(os.path.join(FIX, "portrait.png"))
Image.new("RGB", (200, 100), (30, 200, 30)).save(os.path.join(FIX, "landscape.jpg"), quality=90)

# 簽名用的素材：寬扁、透明背景、中間一條不透明的「筆跡」
sig = Image.new("RGBA", (600, 200), (0, 0, 0, 0))
d = ImageDraw.Draw(sig)
d.line([(40, 150), (200, 60), (360, 150), (560, 70)], fill=(20, 20, 30, 255), width=12)
sig.save(os.path.join(FIX, "signature.png"))

# 掃描測試用：淺色背景上一個深色梯形，四角座標固定且已知
scan = Image.new("RGB", (400, 300), (235, 235, 235))
draw = ImageDraw.Draw(scan)
draw.polygon([(80, 40), (330, 70), (300, 260), (50, 230)], fill=(60, 60, 60))
scan.save(os.path.join(FIX, "trapezoid.png"))

# PWA icon：深底加白色方塊，不需要字型
for size in (192, 512):
    icon = Image.new("RGB", (size, size), (24, 24, 27))
    pad = size // 4
    ImageDraw.Draw(icon).rectangle([pad, pad, size - pad, size - pad], fill=(250, 250, 250))
    icon.save(os.path.join(PUB, f"icon-{size}.png"))

print("fixtures written to", FIX)
print("icons written to", PUB)


# ---- 掃描偵測用的合成照片 ----
# 真值四角寫進檔名旁的 JSON，測試直接讀，不要在兩邊各寫一份座標
import json as _json

def _paper(draw, quad):
    """畫一張有內文的紙"""
    draw.polygon(quad, fill=(246, 244, 238))
    xs = [p[0] for p in quad]
    ys = [p[1] for p in quad]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    for i in range(12):
        y = y0 + (y1 - y0) * (0.12 + 0.065 * i)
        if y > y1 - 20:
            break
        w = (x1 - x0) * (0.45 + 0.37 * ((i * 7) % 10) / 10)
        draw.line([(x0 + (x1 - x0) * 0.1, y), (x0 + (x1 - x0) * 0.1 + w, y)], fill=(70, 70, 75), width=3)

def _scan_case(name, bg, quad, clutter=0, size=(900, 1200)):
    im = Image.new("RGB", size, bg)
    d = ImageDraw.Draw(im)
    # 不能用 hash(name)：Python 的字串 hash 每個 process 都會隨機化，
    # 素材每次產生都不同，準確度測試就不可重現了
    rnd = random.Random(zlib.crc32(name.encode()))
    for _ in range(clutter):
        x, y = rnd.randint(0, size[0]), rnd.randint(0, size[1])
        w, h = rnd.randint(40, 220), rnd.randint(40, 220)
        d.rectangle([x, y, x + w, y + h], fill=tuple(rnd.randint(20, 210) for _ in range(3)))
    _paper(d, quad)
    blurred = im.filter(ImageFilter.GaussianBlur(1.2))
    # PNG 留給人眼檢查，.rgba 才是測試讀的——Node 環境沒有影像解碼器
    blurred.save(os.path.join(FIX, f"scan-{name}.png"))
    with open(os.path.join(FIX, f"scan-{name}.rgba"), "wb") as fh:
        fh.write(blurred.convert("RGBA").tobytes())
    return {"name": name, "quad": [list(p) for p in quad], "width": size[0], "height": size[1]}

_scan_cases = [
    # 應該偵測成功
    _scan_case("plain", (52, 48, 44), [(150, 220), (750, 220), (750, 980), (150, 980)]),
    _scan_case("rotated", (48, 52, 56), [(170, 250), (760, 180), (830, 930), (240, 1000)]),
    _scan_case("perspective", (40, 44, 40), [(260, 190), (680, 210), (790, 980), (120, 950)]),
    _scan_case("clutter", (60, 60, 64), [(160, 240), (740, 230), (760, 960), (150, 970)], clutter=14),
    _scan_case("full", (30, 30, 34), [(40, 60), (860, 50), (870, 1150), (30, 1140)]),
    # 應該退回預設（淺紙放在淺色桌面，紙與桌面只差十幾個灰階）
    _scan_case("lowcontrast", (228, 226, 220), [(160, 240), (740, 230), (760, 960), (150, 970)]),
    # 應該退回預設（文件偏到角落、被畫面切掉）
    _scan_case("offcenter", (45, 42, 40), [(60, 90), (430, 100), (440, 560), (50, 550)]),
    _scan_case("cropped", (38, 40, 44), [(-120, 180), (700, 150), (760, 940), (-80, 980)]),
]
with open(os.path.join(FIX, "scan-cases.json"), "w") as fh:
    _json.dump(_scan_cases, fh)
