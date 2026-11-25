# Saathiya

Saathiya is a private, consent-first wedding community and matchmaking app. It combines guest discovery, opt-in matching, private match chat, QR-based wedding communities, memories and a planner dashboard.

## Project structure

- `src/` — React, TypeScript and Vite web application.
- `app/` — Android WebView application that loads the built web app from packaged assets.
- `firestore.rules` — active Firestore security rules.
- `firestore.rules.test.js` — Firestore Emulator security tests.
- `.github/workflows/android-apk.yml` — CI checks and Android build artifacts.

## Run the web app

Requirements: Node.js 22 or later.

```bash
npm ci
npm run dev
```

Vite serves the app at `http://localhost:3000`.

## Validate the project

```bash
npm run lint
npm run lint:rules
npm run build
npm run test:rules
```

The rules test command installs pinned test-only tools (`@firebase/rules-unit-testing@4.0.1` and `firebase-tools@15.37.0`), starts an isolated `demo-saathiya` Firestore Emulator, runs the 12 adversarial security cases plus a positive control, and shuts the emulator down. It does not connect to the production Firebase project. The emulator requires Java 21 or later.

## Firebase setup

The browser app's Firebase client configuration is in `firebase-applet-config.json`. Firebase web configuration values are client identifiers, not service-account credentials. Never commit service-account JSON files, private keys, upload keystores, or production secrets.

Before testing real sign-in and database functionality, enable the authentication providers used by the app in the Firebase Console and configure the authorized domains and phone-auth settings. The Firestore rules in `firestore.rules` are the active ruleset. Review them before deploying:

```bash
npx firebase-tools deploy --only firestore:rules --project YOUR_FIREBASE_PROJECT_ID
```

## Android builds

The Android application ID is `com.nealaringale.saathiya`. The GitHub Actions workflow:

1. Runs TypeScript, Firestore-rule lint and emulator security tests.
2. Builds the Vite frontend and copies `dist/` into `app/src/main/assets/`.
3. Builds a debug APK, a release APK and a release AAB.
4. Uploads the outputs as the `Saathiya-android-builds` workflow artifact.

Open the repository's **Actions** tab, select the latest successful run, and download its artifact.

### Optional release signing

The debug APK is signed with a generated debug key and is suitable for device testing. Release outputs are signed only when all four GitHub Actions repository secrets are configured:

- `ANDROID_KEYSTORE_BASE64` — base64-encoded upload keystore.
- `ANDROID_KEYSTORE_PASSWORD` — keystore password.
- `ANDROID_KEY_ALIAS` — upload-key alias (commonly `upload`).
- `ANDROID_KEY_PASSWORD` — key password.

Without these secrets, CI still builds and uploads an **unsigned** release APK/AAB. An unsigned AAB cannot be uploaded to Google Play; configure your own upload key before publishing. Keep the keystore and passwords private and backed up securely.

Example keystore creation command (run locally and keep the resulting file out of Git):

```bash
keytool -genkeypair -v -keystore saathiya-upload-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
base64 -w 0 saathiya-upload-key.jks
```

The CI artifact is retained for 14 days. Download and archive signed release outputs securely.
