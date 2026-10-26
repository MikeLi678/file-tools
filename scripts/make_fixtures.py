"""產生測試素材與 PWA icon。重複執行會覆蓋，結果不進 git。"""
import os
from pypdf import PdfWriter
from PIL import Image, ImageDraw

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
