"""Generate icons for VoxNote desktop application."""

from pathlib import Path

from PIL import Image, ImageDraw


def generate_voxnote_icon(size: int = 512) -> Image.Image:
    # 512x512 master image with RGBA
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded rectangle background with Concept A Primary color #577A5B
    radius = int(size * 0.22)
    padding = int(size * 0.04)
    rect = [padding, padding, size - padding, size - padding]
    draw.rounded_rectangle(rect, radius=radius, fill=(87, 122, 91, 255))

    # Inner soft border
    border_color = (130, 168, 134, 120)
    draw.rounded_rectangle(
        rect, radius=radius, outline=border_color, width=max(2, int(size * 0.015))
    )

    # Audio waveform bars in Concept A Surface/Warm White (#FFFDF8)
    wave_color = (255, 253, 248, 255)
    center_x = size / 2
    center_y = size / 2

    # Bar heights relative to size
    bar_heights = [0.22, 0.40, 0.62, 0.44, 0.24]
    bar_width = int(size * 0.075)
    bar_spacing = int(size * 0.13)
    start_x = center_x - 2 * bar_spacing

    for i, h_ratio in enumerate(bar_heights):
        x = start_x + i * bar_spacing
        h = size * h_ratio
        top = center_y - h / 2
        bottom = center_y + h / 2
        bar_rect = [x - bar_width / 2, top, x + bar_width / 2, bottom]
        bar_radius = bar_width // 2
        draw.rounded_rectangle(bar_rect, radius=bar_radius, fill=wave_color)

    return img


def main() -> None:
    targets = [
        Path("resources/icons"),
        Path("src-tauri/icons"),
    ]

    for d in targets:
        d.mkdir(parents=True, exist_ok=True)

    master = generate_voxnote_icon(512)

    sizes = {
        "32x32.png": 32,
        "128x128.png": 128,
        "128x128@2x.png": 256,
        "icon.png": 512,
    }

    for dir_path in targets:
        for filename, sz in sizes.items():
            resized = master.resize((sz, sz), Image.Resampling.LANCZOS)
            resized.save(dir_path / filename, "PNG")

        # Save multi-size .ico
        ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
        master.save(dir_path / "icon.ico", format="ICO", sizes=ico_sizes)

    print("Icons successfully generated in resources/icons and src-tauri/icons")


if __name__ == "__main__":
    main()
