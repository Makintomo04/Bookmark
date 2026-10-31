// Who decides an appeal, apart from the database so the tests can run it (lib/staffAppeals.ts).
// The rest of an appeal's rules are in lib/staffUserRules.ts appealDecisionProblem.

// A second pair of eyes: the admin who logged the appeal doesn't decide it, unless they're the only
// admin there is (adminCount, everyone who can suspend), when nobody else could.
export function appealDeciderProblem(viewer: { id: string }, appeal: { openedById: string }, adminCount: number): string | null {
  if (viewer.id !== appeal.openedById || adminCount <= 1) return null;
  return "You logged this appeal, so another admin decides it.";
}
