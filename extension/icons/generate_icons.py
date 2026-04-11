#!/usr/bin/env python3
"""
Generate Chrome extension icons programmatically.
Run this script to create icon16.png, icon48.png, and icon128.png

The icons match the main ApplyPilot app's brand:
- Gradient: #00d4ff (cyan) → #7c3aed (purple)
- Shape: Rounded square with rocket icon

Requirements:
    pip install Pillow

Usage:
    python generate_icons.py
"""

from PIL import Image, ImageDraw
import math


def create_icon(size: int, filename: str) -> None:
    """Create a gradient rounded-square icon with rocket design."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    padding = max(1, int(size * 0.03))
    inner = size - 2 * padding
    corner = max(2, int(size * 0.22))

    # Draw gradient rounded square background
    # Gradient from #00d4ff (0, 212, 255) to #7c3aed (124, 58, 237)
    for y in range(size):
        for x in range(size):
            # Calculate distance-based gradient (diagonal: top-left to bottom-right)
            ratio = ((x + y) / (2 * size))
            ratio = max(0.0, min(1.0, ratio))

            r = int(0 + (124 - 0) * ratio)
            g = int(212 + (58 - 212) * ratio)
            b = int(255 + (237 - 255) * ratio)

            # Check if point is inside rounded rectangle
            rx = x - padding
            ry = y - padding
            if 0 <= rx < inner and 0 <= ry < inner:
                in_rect = True
                # Check corners
                if rx < corner and ry < corner:
                    in_rect = math.hypot(rx - corner, ry - corner) <= corner
                elif rx > inner - corner and ry < corner:
                    in_rect = math.hypot(rx - (inner - corner), ry - corner) <= corner
                elif rx < corner and ry > inner - corner:
                    in_rect = math.hypot(rx - corner, ry - (inner - corner)) <= corner
                elif rx > inner - corner and ry > inner - corner:
                    in_rect = math.hypot(rx - (inner - corner), ry - (inner - corner)) <= corner

                if in_rect:
                    img.putpixel((x, y), (r, g, b, 255))

    scale = size / 128.0

    # Draw rocket body (white triangle/teardrop shape)
    cx = size // 2
    
    # Rocket body points
    top_y = int(24 * scale)
    body_width = int(16 * scale)
    body_bottom = int(88 * scale)

    # Main body polygon (elongated shape with pointed top)
    body_points = [
        (cx, top_y),  # Nose tip
        (cx + body_width, int(60 * scale)),  # Right shoulder
        (cx + body_width, body_bottom),  # Right bottom
        (cx - body_width, body_bottom),  # Left bottom
        (cx - body_width, int(60 * scale)),  # Left shoulder
    ]
    draw.polygon(body_points, fill='white')

    # Rocket nose cone (smooth top)
    nose_r = int(16 * scale)
    draw.ellipse(
        [cx - nose_r, top_y - int(2 * scale), cx + nose_r, top_y + int(24 * scale)],
        fill='white'
    )

    # Window (circle with gradient fill)
    window_r = max(2, int(7 * scale))
    window_cy = int(52 * scale)
    draw.ellipse(
        [cx - window_r, window_cy - window_r, cx + window_r, window_cy + window_r],
        fill=(0, 180, 220, 255)  # Cyan-ish
    )

    # Left fin
    fin_w = int(10 * scale)
    fin_points = [
        (cx - body_width, int(72 * scale)),
        (cx - body_width - fin_w, body_bottom + int(4 * scale)),
        (cx - body_width, body_bottom),
    ]
    draw.polygon(fin_points, fill='white')

    # Right fin
    fin_points_r = [
        (cx + body_width, int(72 * scale)),
        (cx + body_width + fin_w, body_bottom + int(4 * scale)),
        (cx + body_width, body_bottom),
    ]
    draw.polygon(fin_points_r, fill='white')

    # Flame (small orange/yellow at bottom)
    flame_w = int(8 * scale)
    flame_h = int(12 * scale)
    flame_points = [
        (cx - flame_w, body_bottom),
        (cx, body_bottom + flame_h),
        (cx + flame_w, body_bottom),
    ]
    draw.polygon(flame_points, fill=(255, 200, 80, 230))

    # Inner flame
    iflame_w = int(4 * scale)
    iflame_h = int(8 * scale)
    iflame_points = [
        (cx - iflame_w, body_bottom),
        (cx, body_bottom + iflame_h),
        (cx + iflame_w, body_bottom),
    ]
    draw.polygon(iflame_points, fill=(255, 255, 200, 230))

    img.save(filename, 'PNG')
    print(f'Created {filename} ({size}x{size})')


def main():
    """Generate all required icon sizes."""
    print("Generating Chrome extension icons...")
    print("-" * 40)

    create_icon(16, 'icon16.png')
    create_icon(48, 'icon48.png')
    create_icon(128, 'icon128.png')

    print("-" * 40)
    print("All icons generated successfully!")
    print("\nReload the extension in Chrome:")
    print("1. Go to chrome://extensions/")
    print("2. Click the refresh icon on the extension card")


if __name__ == '__main__':
    main()
