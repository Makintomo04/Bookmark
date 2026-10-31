import { appUrl } from "@/lib/siteUrl";
import { unsubscribeToken, type UnsubscribeKind } from "@/lib/unsubscribeToken";

// Every email the jobs send carries a way out: a link to the confirm page (/email/unsubscribe, a click, so
// link scanners can't trigger it) and the List-Unsubscribe pair Gmail and Yahoo require, a one-click POST
// from the inbox (RFC 8058). Both stop only the kind of email they came in.
export function unsubscribeLinks(userId: string, kind: UnsubscribeKind) {
  const token = encodeURIComponent(unsubscribeToken(userId, kind));
  return {
    pageUrl: `${appUrl}/email/unsubscribe?t=${token}`,
    headers: {
      "List-Unsubscribe": `<${appUrl}/api/email/unsubscribe?t=${token}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    } as Record<string, string>,
  };
}

export const settingsUrl = () => `${appUrl}/settings#notifications`;
