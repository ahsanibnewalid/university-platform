# CampusHub Android — initial native host

This is an **interim Android WebView host** for the existing secure web portal, not a completed fully-native Android application. The existing Next.js server provides sign-in, roles, permissions and all academic data.

## Build and run

1. Install Android Studio, Android SDK 35, and JDK 17.
2. Open `android-app/` in Android Studio and sync Gradle.
3. Set the portal deployment URL in your local Gradle user properties (`~/.gradle/gradle.properties`):

   `PORTAL_URL=https://your-real-campus-domain.edu`

4. Build/install the `app` configuration.

The default `https://example.edu` deliberately displays a setup message. Never use HTTP, embed credentials, or publish a production app before Android QA.

## Remaining native work

- Native Compose screens for parent, student, teacher and admin modules
- Dedicated mobile API authentication with refresh/revocation and device binding
- FCM push notifications and notification preferences
- Offline cache, accessibility, biometric opt-in, deep links and file handling
- Device testing, signed release builds and Play Store compliance

Current WebView cookies remain app-local; third-party cookies, cleartext traffic and file access are disabled. External links open outside the app.
