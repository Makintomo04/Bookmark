import type { Status as PrismaStatus } from "@prisma/client"

// The Status enum for client components. Importing the value from @prisma/client pulls Prisma's
// browser build into the client bundle, which fails to resolve in the pnpm monorepo. `satisfies`
// keeps this in step with the schema: adding or renaming a status there breaks the type-check here.
export const Status = {
  STARTED: "STARTED",
  NOT_STARTED: "NOT_STARTED",
  COMPLETED: "COMPLETED",
  DNF: "DNF",
  PAUSED: "PAUSED",
  NOT_INTERESTED: "NOT_INTERESTED",
} as const satisfies { [K in PrismaStatus]: K }

export type Status = PrismaStatus
