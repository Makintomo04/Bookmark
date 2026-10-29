// Type-check only: packages/shared declares the Prisma enums it uses as plain unions (so it never needs
// @prisma/client). If prisma/schema.prisma changes one of them, `tsc` fails here until shared matches.
import type * as Db from "@prisma/client";
import type * as Shared from "@bookmark/shared/enums";

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export const sharedEnumsMatchSchema: [
  Same<Db.Plan, Shared.Plan>,
  Same<Db.ProfileVisibility, Shared.ProfileVisibility>,
  Same<Db.ReviewVisibility, Shared.ReviewVisibility>,
  Same<Db.ReviewCommentAudience, Shared.ReviewCommentAudience>,
  Same<Db.BuddyReadInviteAudience, Shared.BuddyReadInviteAudience>,
  Same<Db.ListVisibility, Shared.ListVisibility>,
] = [true, true, true, true, true, true];
