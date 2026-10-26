# 브랜드 아이콘 생성: 검은 둥근 네모 + 흰 S(public/studed_icon_black_transparent.png의 모양).
# 원본 S가 작아서(약 250px) 모양(알파)만 키운 뒤 가장자리를 다시 또렷하게 만든다(단색 로고라 가능).
# 사용: python scripts/make-brand-icons.py  → src/app 아이콘들 + brand/ 홍보용 이미지
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "studed_icon_black_transparent.png"
WORDMARK = ROOT / "public" / "studed_logo_black_transparent.png"
BG = (12, 12, 13, 255)  # globals.css 다크 배경 --background(#0c0c0d)
FG = (255, 255, 255, 255)


def crisp_glyph_alpha(target_h: int) -> Image.Image:
    """S 모양(알파)을 target_h 높이로 키우고 가장자리를 또렷하게."""
    src = Image.open(SRC).convert("RGBA")
    alpha = src.getchannel("A").crop(src.getbbox())
    scale = target_h / alpha.height
    big = alpha.resize((round(alpha.width * scale), target_h), Image.LANCZOS)
    # 원본 픽셀 계단이 커지며 생긴 울퉁불퉁함을 흐려서 펴고, 아래에서 가장자리를 다시 세운다.
    big = big.filter(ImageFilter.GaussianBlur(radius=max(0.8, scale * 0.9)))
    # 부드러워진 가장자리를 좁은 구간에서 다시 세운다(안티앨리어싱 1~2px만 남김).
    return big.point(lambda a: 0 if a < 112 else 255 if a > 144 else round((a - 112) * 255 / 32))


def make_icon(size: int, rounded: bool, glyph_ratio: float = 0.66) -> Image.Image:
    ss = 4 if size < 256 else 2  # 작은 크기는 크게 그린 뒤 줄여서 모서리·획을 깨끗하게
    S = size * ss
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bg = Image.new("RGBA", (S, S), BG)
    if rounded:
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=round(S * 0.22), fill=255)
        canvas.paste(bg, (0, 0), mask)
    else:
        canvas = bg
    glyph_alpha = crisp_glyph_alpha(round(S * glyph_ratio))
    white = Image.new("RGBA", glyph_alpha.size, FG)
    # 가운데 정렬(글자 모양 기준)
    x = (S - glyph_alpha.width) // 2
    y = (S - glyph_alpha.height) // 2
    canvas.paste(white, (x, y), glyph_alpha)
    return canvas.resize((size, size), Image.LANCZOS)


def make_og(dark: bool, width: int = 1200, height: int = 630, logo_ratio: float = 0.62) -> Image.Image:
    """링크 미리보기(Open Graph) 이미지: 가운데 STUDED 워드마크. dark면 검은 바탕 + 흰 글자, 아니면 흰 바탕 + 검은 글자."""
    src = Image.open(WORDMARK).convert("RGBA")
    alpha = src.getchannel("A").crop(src.getbbox())
    w = round(width * logo_ratio)
    h = round(alpha.height * w / alpha.width)
    alpha = alpha.resize((w, h), Image.LANCZOS)
    bg = BG if dark else (255, 255, 255, 255)
    fg = FG if dark else (17, 17, 19, 255)  # globals.css 라이트 --foreground(#111113)
    canvas = Image.new("RGBA", (width, height), bg)
    canvas.paste(Image.new("RGBA", (w, h), fg), ((width - w) // 2, (height - h) // 2), alpha)
    return canvas.convert("RGB")


def main() -> None:
    app = ROOT / "src" / "app"
    brand = ROOT / "brand"
    brand.mkdir(exist_ok=True)

    # 브라우저 탭: 작게 보이므로 글자를 조금 더 크게
    fav = [make_icon(s, rounded=True, glyph_ratio=0.72) for s in (16, 32, 48)]
    fav[2].save(app / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)], append_images=[fav[0], fav[1]])
    make_icon(192, rounded=True).save(app / "icon.png")
    # iOS는 모서리를 스스로 둥글게 깎으므로 꽉 찬 네모로
    make_icon(180, rounded=False).save(app / "apple-icon.png")

    # 홍보용
    make_icon(1024, rounded=True).save(brand / "studed-icon-1024.png")
    make_icon(1024, rounded=False).save(brand / "studed-icon-1024-square.png")
    make_icon(512, rounded=True).save(brand / "studed-icon-512.png")
    # 링크 미리보기(1200x630): 흰 바탕 / 검은 바탕 두 가지
    make_og(dark=False).save(brand / "studed-og-white.png")
    make_og(dark=True).save(brand / "studed-og-black.png")
    print("ok")


if __name__ == "__main__":
    main()
