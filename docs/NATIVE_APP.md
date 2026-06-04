# Shipping SVN OS to the App Store / Play Store

SVN OS is a static PWA, so the fastest path to native app stores is
[Capacitor](https://capacitorjs.com) — it wraps the existing web app in
a native shell with no code rewrite. The app already works offline and
installs as a PWA, which covers most "app-like" requirements; Capacitor
is only needed for actual store distribution.

## Why Capacitor (vs. rewrite)

- Reuses 100% of the current HTML/CSS/JS — no framework migration.
- `webDir` points at the repo root, which is what Vercel already serves.
- Native plugins (push, haptics, share, status bar) are available if you
  want to deepen the native feel later.

## One-time setup

```bash
# From the repo root
npm init -y                      # if you don't already have a package.json
npm install @capacitor/core
npm install -D @capacitor/cli

# Capacitor reads capacitor.config.json (already committed)
npx cap add ios
npx cap add android
```

`capacitor.config.json` is already configured:
- `appId`: `com.svnos.app` (change to your own reverse-domain identifier
  before submitting — it must be unique on the stores)
- `appName`: `SVN OS`
- `webDir`: `.` (serves the repo root, matching the static deploy)
- Dark `backgroundColor` and splash to match the cinematic theme

## Build & run

```bash
# Copy the latest web assets into the native projects
npx cap copy

# Open the native IDEs
npx cap open ios       # Xcode
npx cap open android   # Android Studio
```

From Xcode / Android Studio you can run on a simulator or device, set
signing certificates, and archive for submission.

## Important notes for store review

1. **Point at production data.** The app talks to Supabase over HTTPS, so
   the native build needs network access (already allowed via the
   `https` schemes in the config). No localhost.

2. **Auth redirect URLs.** If you use OAuth providers later, add the
   Capacitor custom scheme to Supabase's allowed redirect URLs.

3. **Icons & splash.** Generate native icon sets from `icons/icon-512.png`:
   ```bash
   npm install -D @capacitor/assets
   npx capacitor-assets generate
   ```

4. **Offline.** The service worker + offline write queue (`js/offline.js`)
   already give a usable offline experience inside the native shell.

5. **App Store metadata.** Prepare screenshots at the required device
   sizes, a privacy policy URL (required because the app stores user
   data), and a description. The marketing copy on `/welcome` is a good
   starting point.

## Alternative: PWA-only

If you don't need store distribution, the app is already installable:
- iOS Safari → Share → Add to Home Screen
- Chromium → install icon in the address bar / the in-app install prompt

The in-app install prompt (`js/install-prompt.js`) surfaces this
automatically on supported browsers.
