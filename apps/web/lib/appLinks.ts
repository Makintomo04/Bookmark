// The web addresses the phone hands to the Bookmark app instead of the browser (iOS universal links,
// Android app links), served from /.well-known/*. The app's own config (apps/mobile) lists the same
// paths. Nothing is served until the app's ids are set:
//   APPLE_TEAM_ID + APPLE_BUNDLE_ID          for iOS
//   ANDROID_PACKAGE + ANDROID_SHA256_CERTS   for Android (the Play signing certificate's SHA-256
//                                            fingerprints, comma separated)
export const APP_LINK_PATHS = [
  "/open/*",
  "/circles/join/*",
  "/circles/*",
  "/u/*",
  "/lists/*",
  "/quests/*",
  "/reset-password",
  "/verify-email",
] as const;

export function appleAppSiteAssociation() {
  const { APPLE_TEAM_ID, APPLE_BUNDLE_ID } = process.env;
  if (!APPLE_TEAM_ID || !APPLE_BUNDLE_ID) return null;
  const appID = `${APPLE_TEAM_ID}.${APPLE_BUNDLE_ID}`;
  return {
    applinks: { details: [{ appIDs: [appID], components: APP_LINK_PATHS.map((path) => ({ "/": path })) }] },
    // Lets iOS offer passwords saved for this site in the app's sign-in form.
    webcredentials: { apps: [appID] },
  };
}

export function androidAssetLinks() {
  const pkg = process.env.ANDROID_PACKAGE;
  const certs = (process.env.ANDROID_SHA256_CERTS ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  if (!pkg || certs.length === 0) return null;
  return [
    { relation: ["delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds"], target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: certs } },
  ];
}
