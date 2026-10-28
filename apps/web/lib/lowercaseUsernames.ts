import { normaliseUsername } from "@bookmark/shared/profile";

// Usernames are stored lowercase now (packages/shared/src/profile.ts), and every lookup lowercases what
// it's given (lib/handle.ts). Accounts from before that may still hold capitals, so scripts/lowercase-usernames.ts
// brings them into line. The plan is worked out here, without the database, so it can be tested: which
// accounts change, and which lowercase names two or more accounts would end up sharing. A collision is
// never resolved by the script; it's printed for a person to settle.

export interface StoredUsername {
  id: string;
  username: string | null;
}

export interface UsernameChange {
  id: string;
  from: string;
  to: string;
}

export interface UsernameCollision {
  // The lowercase name they'd share.
  username: string;
  // Every account that would hold it, including one that already does.
  accounts: { id: string; username: string }[];
}

export function planLowercaseUsernames(users: StoredUsername[]) {
  const byLower = new Map<string, { id: string; username: string }[]>();
  for (const { id, username } of users) {
    if (!username) continue;
    const lower = normaliseUsername(username);
    const list = byLower.get(lower) ?? [];
    list.push({ id, username });
    byLower.set(lower, list);
  }

  const changes: UsernameChange[] = [];
  const collisions: UsernameCollision[] = [];
  for (const [lower, accounts] of Array.from(byLower)) {
    if (accounts.length > 1) {
      collisions.push({ username: lower, accounts });
      continue;
    }
    const [account] = accounts;
    if (account.username !== lower) changes.push({ id: account.id, from: account.username, to: lower });
  }
  return { changes, collisions };
}
