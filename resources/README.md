Resource Icons
==============

The following icon files are required by electron-builder and the system tray:

1. icon.png          — App icon (256×256 PNG), used for the installer and window icon
2. tray-icon.png     — System tray icon (16×16 PNG), used in Windows notification area
3. tray-icon@2x.png  — System tray icon (32×32 PNG), HiDPI variant
4. tray-icon.svg     — SVG fallback for the tray icon

Generating Icons
----------------

Run the generation script to create tray icons:

    node resources/generate-icons.js

This script uses pure Node.js (no external dependencies) to generate:
- A blue circle icon (indigo #6366F1) at 16×16 and 32×32 resolutions.
- An SVG version with "ST" text overlay.

For a custom icon, replace the generated PNG files with your own artwork
or modify the SVG and convert it using any image tool.

For development, the app will start without these files — the tray icon
creation will silently fail (caught by try/catch in main.ts) and the
window icon will use Electron's default.
