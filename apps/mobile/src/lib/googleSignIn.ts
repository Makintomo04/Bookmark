// Native Google sign-in only runs on the phones (googleSignIn.native.ts). On the web build used for
// development there's no button.
export const googleSignInAvailable = false;

export async function googleIdToken(): Promise<string | null> {
  return null;
}
