# CampusHub Mobile — React Native / Expo

One TypeScript codebase for **Android and iOS**, using Expo SDK 58. The current implementation is a **cross-platform React Native portal host**. It securely presents the existing Next.js website and its role-based parent, student, teacher and administrator workflows. It is not yet a fully native set of screens.

## Get started

1. Install Node.js 22.13+ and the Expo Go application or an Android/iOS simulator.
2. From this directory run `npm install`.
3. Set `expo.extra.portalUrl` in `app.json` to your deployed, trusted **HTTPS** CampusHub URL. The placeholder `https://example.edu` intentionally displays configuration instructions.
4. Run `npx expo start`. Open with Expo Go or use `npm run android` / `npm run ios`.

For production builds, configure unique identifiers, icons, signing credentials, EAS project metadata and release policies. Do not commit login credentials or backend secrets.

## Security and limitations

The portal enforces authorization on the server, not in the mobile UI. The app blocks non-HTTPS and cross-origin navigation within its WebView, opens safe external links in the operating system, disables third-party cookies, and blocks mixed content and file access.

Dedicated React Native screens, mobile API authentication, secure token storage, push notifications, offline caching, deep links, downloads, accessibility QA, release signing, and real-device testing remain future work. Do not claim this starter is ready for production student data.
