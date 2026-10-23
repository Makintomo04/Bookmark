import crypto from "crypto";

// Sign in with Apple on the web (next-auth's Apple provider). The App Store requires it in the iOS app
// because Google sign-in is offered there, and the web needs it too, or someone who signed up on their
// iPhone with "Hide My Email" couldn't sign in here. Off until all four are set:
//   APPLE_ID           the Services ID (e.g. app.bookmark.web), the web's client id
//   APPLE_TEAM_ID      the Apple Developer team id
//   APPLE_KEY_ID       the id of a Sign in with Apple key
//   APPLE_PRIVATE_KEY  that key's .p8 contents (newlines may be written as \n)
// The app's own bundle id (APPLE_BUNDLE_ID) is only for native sign-in (lib/idTokens.ts).

export function appleWebConfig() {
  const { APPLE_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY } = process.env;
  if (!APPLE_ID || !APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_PRIVATE_KEY) return null;
  return { clientId: APPLE_ID, teamId: APPLE_TEAM_ID, keyId: APPLE_KEY_ID, privateKey: APPLE_PRIVATE_KEY.replace(/\\n/g, "\n") };
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

// Apple's client secret is a JWT the site signs with its key (ES256), valid for at most six months.
// Made when the server starts, so a running instance never holds one close to expiring.
export function appleClientSecret(config: NonNullable<ReturnType<typeof appleWebConfig>>, now = new Date()) {
  const iat = Math.floor(now.getTime() / 1000);
  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const payload = base64url(JSON.stringify({ iss: config.teamId, iat, exp: iat + 180 * 24 * 60 * 60, aud: "https://appleid.apple.com", sub: config.clientId }));
  const signature = crypto.sign("sha256", Buffer.from(`${header}.${payload}`), { key: config.privateKey, dsaEncoding: "ieee-p1363" });
  return `${header}.${payload}.${base64url(signature)}`;
}
