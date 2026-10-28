# Siddheswari CampusHub — React Native (Expo)

One TypeScript/React Native project for Android and iOS using Expo SDK 58.
The app now uses **native screens**, not a WebView host, for account sign-in,
campus overview, announcements and notifications, courses and released exam
grades, BDT invoice/payment history, leave requests, parent–teacher meetings,
reviews, and role switching. Advanced management remains on the website.

## Development

1. `npm ci` inside `mobile-app/`.
2. Set `expo.extra.portalUrl` in `app.json` to an **HTTPS** deployment of this
   backend. The `https://example.edu` placeholder intentionally blocks sign-in.
3. Run `npm run type-check`, `npm run doctor`, then `npx expo start`.
4. Test Android and iOS with synthetic accounts for every campus role. Verify
   sign-in, token expiry, guardian isolation, mutations, and accessibility.

## Security

- `POST /api/mobile/auth/login` uses the same password/account lockout policy
  as web login but issues a separate, revocable opaque token.
- Expo SecureStore holds the token in the OS Keychain/Keystore. The backend
  stores only its SHA-256 digest; the session expires after seven days.
- API calls use HTTPS and Authorization bearer tokens; mutations include the
  configured same-origin `Origin` header.
- Never bundle NU/board credentials or payment gateway secrets in the app.

## Remaining release blockers

Native release signing and real-device testing are not done. You must provision
institutionally approved bundle IDs, EAS project/signing credentials, a privacy
policy, accessibility and security reviews, and revocation procedures. Real
push delivery, downloaded official documents, offline sync, and comprehensive
mobile end-to-end tests still need to be implemented and verified. These native
screens are a functional foundation, not production certification.
