# Extension Icons

This folder contains the PNG icons required by the Chrome extension manifest:

- `icon16.png` (16×16 px)
- `icon48.png` (48×48 px)
- `icon128.png` (128×128 px)

## Generating Icons

### Recommended — Python script (requires Pillow):

```bash
cd extension/icons
pip install Pillow
python generate_icons.py
```

This is the standard method — it generates icons that match the app's gradient color scheme.

### Alternative — ImageMagick:

```bash
convert icon.svg -resize 16x16 icon16.png
convert icon.svg -resize 48x48 icon48.png
convert icon.svg -resize 128x128 icon128.png
```

### Alternative — Inkscape:

```bash
inkscape icon.svg -w 16 -h 16 -o icon16.png
inkscape icon.svg -w 48 -h 48 -o icon48.png
inkscape icon.svg -w 128 -h 128 -o icon128.png
```

## Icon Design Guidelines

- Primary gradient: `#00d4ff` → `#7c3aed` (cyan to purple)
- Simple, recognizable at 16×16
- Placeholder PNGs are included for development/testing

