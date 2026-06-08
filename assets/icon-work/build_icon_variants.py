from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps


ROOT = Path(r"D:\Project_Dave\SHIT\assets\icon-work")
SOURCE = ROOT / "source-logo.png"
OUT = ROOT / "variants"
SIZE = 1024
RADIUS = 230


def ensure_dirs() -> None:
    OUT.mkdir(parents=True, exist_ok=True)


def rounded_mask(size: int = SIZE, radius: int = RADIUS, inset: int = 0) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        (inset, inset, size - inset - 1, size - inset - 1),
        radius=max(0, radius - inset),
        fill=255,
    )
    return mask


def make_canvas(color: str) -> Image.Image:
    return Image.new("RGBA", (SIZE, SIZE), color)


def add_outer_shadow(base: Image.Image, blur: int = 42, opacity: int = 110) -> Image.Image:
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    alpha = rounded_mask()
    shadow.putalpha(alpha.point(lambda p: min(opacity, p // 2)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    out = Image.new("RGBA", base.size, (0, 0, 0, 0))
    out.alpha_composite(shadow)
    out.alpha_composite(base)
    return out


def add_inner_highlight(base: Image.Image, inset: int = 18, opacity: int = 80) -> Image.Image:
    overlay = Image.new("RGBA", base.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle(
        (inset, inset, SIZE - inset - 1, SIZE - inset - 1),
        radius=RADIUS - inset,
        outline=(255, 255, 255, opacity),
        width=6,
    )
    base = base.copy()
    base.alpha_composite(overlay)
    return base


def fit_source(scale: float = 0.82, y_shift: int = 0) -> Image.Image:
    src = Image.open(SOURCE).convert("RGBA")
    target = int(SIZE * scale)
    fitted = ImageOps.contain(src, (target, target), method=Image.Resampling.LANCZOS)
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    x = (SIZE - fitted.width) // 2
    y = (SIZE - fitted.height) // 2 + y_shift
    layer.alpha_composite(fitted, (x, y))
    return layer


def make_glass_enhanced() -> Image.Image:
    src = fit_source(scale=0.86, y_shift=-6)
    card = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    mask = rounded_mask()
    card.paste(src, mask=mask)
    card = add_inner_highlight(card, inset=14, opacity=70)
    return card


def make_soft_white() -> Image.Image:
    bg = make_canvas("#f6f7fb")
    bg.putalpha(rounded_mask())
    src = fit_source(scale=0.76)
    src = src.filter(ImageFilter.GaussianBlur(0.2))
    composed = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    composed.alpha_composite(bg)
    composed.alpha_composite(src)
    composed = add_outer_shadow(composed, blur=34, opacity=70)
    composed = add_inner_highlight(composed, inset=20, opacity=95)
    return composed


def make_dark_store() -> Image.Image:
    bg = make_canvas("#101318")
    bg.putalpha(rounded_mask())
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    draw.ellipse((170, 150, 870, 850), fill=(75, 130, 255, 55))
    draw.ellipse((160, 110, 700, 650), fill=(255, 70, 100, 45))
    draw.ellipse((330, 170, 930, 760), fill=(60, 220, 130, 42))
    glow = glow.filter(ImageFilter.GaussianBlur(80))
    src = fit_source(scale=0.74)
    composed = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    composed.alpha_composite(bg)
    composed.alpha_composite(glow)
    composed.alpha_composite(src)
    composed = add_inner_highlight(composed, inset=22, opacity=60)
    return composed


def make_flat_minimal() -> Image.Image:
    bg = make_canvas("#ffffff")
    bg.putalpha(rounded_mask())
    src = fit_source(scale=0.68)
    src = src.filter(ImageFilter.GaussianBlur(0.4))
    shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    shadow.alpha_composite(src, (0, 18))
    shadow = shadow.filter(ImageFilter.GaussianBlur(16))
    shadow = Image.blend(Image.new("RGBA", shadow.size, (0, 0, 0, 0)), shadow, 0.22)
    composed = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    composed.alpha_composite(bg)
    composed.alpha_composite(shadow)
    composed.alpha_composite(src)
    border = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(border)
    draw.rounded_rectangle(
        (1, 1, SIZE - 2, SIZE - 2),
        radius=RADIUS,
        outline=(220, 224, 232, 255),
        width=4,
    )
    composed.alpha_composite(border)
    return composed


def make_brand_tile() -> Image.Image:
    bg = make_canvas("#0c0f14")
    bg.putalpha(rounded_mask())
    src = fit_source(scale=0.80)
    sheen = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 0))
    draw = ImageDraw.Draw(sheen)
    draw.polygon([(90, 120), (500, 120), (170, 460), (90, 460)], fill=(255, 255, 255, 38))
    draw.polygon([(620, 90), (920, 90), (920, 350), (760, 220)], fill=(255, 255, 255, 30))
    sheen = sheen.filter(ImageFilter.GaussianBlur(28))
    composed = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    composed.alpha_composite(bg)
    composed.alpha_composite(sheen)
    composed.alpha_composite(src)
    composed = add_inner_highlight(composed, inset=16, opacity=72)
    composed = add_outer_shadow(composed, blur=30, opacity=88)
    return composed


def make_store_primary() -> Image.Image:
    bg = Image.new("RGBA", (SIZE, SIZE), (18, 22, 28, 255))
    bg.putalpha(rounded_mask())

    ambient = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(ambient)
    draw.ellipse((170, 120, 760, 700), fill=(255, 70, 90, 36))
    draw.ellipse((300, 110, 900, 720), fill=(80, 220, 120, 36))
    draw.ellipse((250, 390, 890, 930), fill=(30, 110, 255, 48))
    ambient = ambient.filter(ImageFilter.GaussianBlur(82))

    src = fit_source(scale=0.80, y_shift=-4)
    composed = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    composed.alpha_composite(bg)
    composed.alpha_composite(ambient)
    composed.alpha_composite(src)

    gloss = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 0))
    draw = ImageDraw.Draw(gloss)
    draw.rounded_rectangle(
        (22, 22, SIZE - 22, SIZE - 22),
        radius=RADIUS - 16,
        outline=(255, 255, 255, 60),
        width=5,
    )
    gloss = gloss.filter(ImageFilter.GaussianBlur(0.4))
    composed.alpha_composite(gloss)
    composed = add_outer_shadow(composed, blur=34, opacity=92)
    return composed


def make_transparent_primary() -> Image.Image:
    src = fit_source(scale=0.86, y_shift=-6)
    card = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    mask = rounded_mask()
    card.paste(src, mask=mask)
    card = add_inner_highlight(card, inset=14, opacity=72)
    return card


def make_transparent_tight() -> Image.Image:
    src = fit_source(scale=0.92, y_shift=-4)
    card = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    mask = rounded_mask()
    card.paste(src, mask=mask)
    card = add_inner_highlight(card, inset=12, opacity=64)
    return card


def save_png(name: str, image: Image.Image) -> None:
    image.save(OUT / f"{name}.png")


def export_ios_set(master: Image.Image) -> None:
    ios_dir = OUT / "ios"
    ios_dir.mkdir(exist_ok=True)
    sizes = [1024, 512, 256, 180, 167, 152, 120, 87, 80, 76, 60, 58, 40, 29, 20]
    for size in sizes:
        master.resize((size, size), Image.Resampling.LANCZOS).save(ios_dir / f"icon-{size}.png")


def main() -> None:
    ensure_dirs()
    variants = {
        "shit-icon-glass": make_glass_enhanced(),
        "shit-icon-soft-white": make_soft_white(),
        "shit-icon-dark-store": make_dark_store(),
        "shit-icon-flat-minimal": make_flat_minimal(),
        "shit-icon-brand-tile": make_brand_tile(),
        "shit-icon-store-primary": make_store_primary(),
        "shit-icon-transparent-primary": make_transparent_primary(),
        "shit-icon-transparent-tight": make_transparent_tight(),
    }
    for name, image in variants.items():
        save_png(name, image)
    export_ios_set(variants["shit-icon-soft-white"])


if __name__ == "__main__":
    main()
