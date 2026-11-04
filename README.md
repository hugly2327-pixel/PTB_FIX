# LH PTB 4.2.0 — Photo Studio

LH PTB is a browser-based Photo Booth and photo composition app built with Next.js, React, TypeScript, Canvas, MediaRecorder, and IndexedDB.

## Features
- Front/rear camera capture, timer, zoom, and automatic 4/6-photo sessions.
- Quick presets with live camera color/filter preview.
- Photo layouts including 2×2, 2×3, strips, Polaroid, and transparent PNG templates.
- Post-capture editor with warm/cool temperature, highlights, shadows, brightness, contrast, saturation, sharpness, effects, captions, stickers, and frames.
- Automatic local saving of captured photos and WebM Video Recap after a completed session.
- PNG, JPG, and WebP export.
- Local browser photo library with temporary retention.
- Responsive desktop/mobile interface and light/dark appearance.

## Requirements
- Node.js 20 or newer
- npm

## Run locally
```bash
npm install
npm run dev
```

## Build locally
```bash
npm run typecheck
npm run build
```

## Deploy to GitHub Pages
This repository is configured for **GitHub Pages only**. It does not contain an Android project, Capacitor configuration, or Android APK workflow.

1. Create a GitHub repository.
2. Extract this ZIP. Its files are placed directly at the project root.
3. Upload/commit all extracted files and folders to the repository's `main` branch. Do not put them inside an extra nested folder.
4. Open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
5. Open **Actions** and allow the workflow named **Build and Deploy LH PTB to GitHub Pages** to finish.
6. Open the Pages URL shown in the workflow deployment summary.

The workflow automatically detects the repository name and configures the correct base path for GitHub Pages project sites.

## Camera and privacy
Camera access requires HTTPS (GitHub Pages provides HTTPS) and browser permission. Photos and template presets are processed and stored locally in the browser using IndexedDB. This project does not add a remote image upload service or account backend. Camera resolutions, Web Share, and MediaRecorder codecs vary by browser and device.
