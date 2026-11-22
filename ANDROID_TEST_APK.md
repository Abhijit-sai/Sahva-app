# Android test APK

The debug build uses Capacitor 6, Kotlin 1.9.22, JDK 17, Gradle wrapper 8.2.1, Android Gradle Plugin 8.2.1, Android SDK Platform 34 and Build Tools 34.0.0. Minimum device API is 26, target API is 34. Install the SDK Platform Tools for adb. Set JAVA_HOME and ANDROID_HOME on your build host.

## Build and install

```sh
npm ci
npm run android:apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

The same command runs on Windows and Linux. GitHub Actions builds an installable APK on pushes to main and on manual dispatch. Open **Actions → Android test APK → successful run → sahva-test-apk**, download and unzip the artifact, then sideload app-debug.apk. Each fresh hosted runner uses its own debug keystore. If Android reports incompatible signatures, use a persistent debug signing key across builds or uninstall the previous test installation (which clears its local session).

Configure VITE_API_BASE_URL with your deployed HTTPS API and VITE_PUBLIC_WEB_URL with the website before building, or use the first-launch test server field to connect a generic APK to a same-origin deployment. Configure VITE_CLERK_PUBLISHABLE_KEY at build time or on the server. Only public configuration belongs in Vite variables. Set SAHVA_WEB_HOST in the Gradle build environment for verified /oauth-callback links. Publish /.well-known/assetlinks.json on that domain with the app ID app.sahva.mobile and the SHA-256 fingerprint of your signing certificate. The custom scheme works independently.

The website offers the test binary at `/downloads/sahva-test.apk`. On the EC2 deployment, install the verified CI artifact as `/var/lib/sahva/downloads/sahva-test.apk` with mode 0644. Nginx serves this directory through a read-only mount. To host the file elsewhere, set the public build variable `VITE_ANDROID_APK_URL` during the Vite build.

## Ring a locked phone

1. Launch the APK, sign in, allow microphone and notifications, and finish onboarding. Enable background listening in battery settings if desired. On Android 14 and later enable full-screen notifications for Sahva under Special app access. The ongoing listener notification indicates the service started. Verify its socket by checking deliveredToSockets from the trigger response.
2. Sign into the website as the same recipient, switch to a different tab and lock the phone. The native service and website use separate authenticated connections.
3. Export SAHVA_ORIGIN, INTERNAL_CALL_API_KEY and TARGET_EMAIL in a trusted shell, then trigger the call.

```sh
curl --fail-with-body -X POST "$SAHVA_ORIGIN/api/calls/ring" \
  -H "Content-Type: application/json" \
  -H "x-internal-call-key: $INTERNAL_CALL_API_KEY" \
  --data "{\"targetEmails\":[\"$TARGET_EMAIL\"],\"ringTimeoutSec\":45}"
```

The response lists the session ID, room ID and online/offline targets. An internal call uses a service identity by default. Supply callerUserId or INTERNAL_CALLER_USER_ID for a registered caller. A two-way microphone test requires a human caller participating in the app. Use the caller's Clerk bearer token for /api/calls/SESSION_ID/cancel. Use a target's bearer token for answer or decline. The internal key grants only the ring operation.

4. Answer on the phone, then repeat and decline from the notification while locked. Verify the browser stops ringing in both cases. Repeat with caller cancellation and a 45-second timeout. Disable the phone's network, restore it and verify pending calls recover while unexpired. During an active call turn the screen off, speak both languages and check the recording after returning.

## Android background behavior

A persistent foreground service maintains an OkHttp socket with ping frames and reconnect backoff. It stores the session grant in Android Keystore-backed encrypted preferences. The server checks the Clerk session before issuing a fresh JWT. The seven-day listener grant renews when the app opens. Reopen Sahva after a force-stop or reboot. Notification permissions, full-screen intent settings, loss of connectivity, battery management and manufacturer restrictions affect delivery. A forced stop prevents an app from receiving calls until relaunched. Android 15's dataSync foreground-service time limit applies to apps targeting API 35 and above. Re-evaluate the listener architecture before raising the target SDK.

