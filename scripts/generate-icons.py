#!/usr/bin/env python3
import os
import subprocess
from PIL import Image

TEMPLATE = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 512px;
    height: 512px;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .icon-box {
    width: 512px;
    height: 512px;
    background: linear-gradient(135deg, #2563eb, #3b82f6);
    border-radius: 114px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  svg {
    width: 280px;
    height: 280px;
  }
</style>
</head>
<body>
  <div class="icon-box">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#ffffff"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z" />
      <line x1="12" y1="5" x2="12" y2="21" />
    </svg>
  </div>
</body>
</html>
"""

script_dir = os.path.dirname(os.path.abspath(__file__))
base_dir = os.path.dirname(script_dir)
public_dir = os.path.join(base_dir, "public")

html_path = os.path.join(script_dir, "temp-icon.html")
master_png = os.path.join(script_dir, "temp-master.png")

with open(html_path, "w") as f:
    f.write(TEMPLATE)

# Render 512x512 via headless chromium
cmd = [
    "/snap/bin/chromium",
    "--headless=new",
    "--no-sandbox",
    "--hide-scrollbars",
    f"--screenshot={master_png}",
    "--window-size=512,512",
    "--default-background-color=00000000",
    f"file://{html_path}",
]
print("Running Chromium screenshot...")
subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

print(f"Loading master image from {master_png}...")
im512 = Image.open(master_png).convert("RGBA")

# 1. public/icon-512.png
im512.save(os.path.join(public_dir, "icon-512.png"), format="PNG")
print("Saved public/icon-512.png")

# 2. public/icon-192.png
im192 = im512.resize((192, 192), Image.Resampling.LANCZOS)
im192.save(os.path.join(public_dir, "icon-192.png"), format="PNG")
print("Saved public/icon-192.png")

# 3. public/apple-touch-icon.png (180x180)
im180 = im512.resize((180, 180), Image.Resampling.LANCZOS)
im180.save(os.path.join(public_dir, "apple-touch-icon.png"), format="PNG")
im180.save(os.path.join(public_dir, "apple-touch-icon-precomposed.png"), format="PNG")
im180.save(os.path.join(public_dir, "icon.png"), format="PNG")
print("Saved apple touch icons (180x180)")

# 4. public/favicon.ico
im32 = im512.resize((32, 32), Image.Resampling.LANCZOS)
im16 = im512.resize((16, 16), Image.Resampling.LANCZOS)
im48 = im512.resize((48, 48), Image.Resampling.LANCZOS)
im32.save(
    os.path.join(public_dir, "favicon.ico"),
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48)],
    append_images=[im16, im48],
)
print("Saved public/favicon.ico")

# Clean up temp files
if os.path.exists(html_path):
    os.remove(html_path)
if os.path.exists(master_png):
    os.remove(master_png)

print("All icons successfully generated and saved to public/!")
