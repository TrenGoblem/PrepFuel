# Fuelr native app

Fuelr's existing GitHub/Supabase app is now prepared to run as a native iPhone and Android app through Capacitor. The same Fuelr codebase continues to power the web/PWA version.

## What this gives us

- Fuelr installs as a real native app container.
- The current onboarding, accounts, school themes, recipes, Prep, Grocery, Calendar, Budget and Settings stay intact.
- Supabase remains the backend for each user's private data.
- The web app and native apps can share the same product logic.

## First native build

Install Node.js, then from the repository:

```bash
npm install
npm run native:add:ios
npm run native:add:android
```

Those commands create the native platform projects once.

After that, whenever Fuelr changes:

```bash
npm run native:sync
```

Open the native projects with:

```bash
npm run native:ios
npm run native:android
```

## iPhone / App Store

Building and submitting iOS requires macOS with Xcode and an Apple Developer account. The public App Store can list Fuelr as a free download, but Apple charges for the developer program.

Before release:
1. Confirm the final bundle ID (currently `com.fuelr.app`).
2. Add production app icons and splash assets.
3. Set signing/team in Xcode.
4. Archive the app and upload it to App Store Connect.
5. Use TestFlight for beta testing before public release.

## Android / Google Play

Android can be opened in Android Studio with `npm run native:android`. A signed Android App Bundle (AAB) is required for Google Play release.

## Important

Do not put the Supabase service-role key, Apple secrets, Google OAuth secrets, payment secrets, or signing keys in the web bundle or this repository.
