// Lets plain Node (with its built-in TypeScript type stripping) load app modules that use "@/..." imports
// without file extensions, so the import tests can call lib/export.ts for a real round trip.
//
//   node --import ./scripts/test/register.mjs --test scripts/test/*.test.ts
//
// The tests never query a database. DATABASE_URL is pinned to an unreachable local address anyway,
// so nothing loaded here can reach the one in .env.local.
import { register } from "node:module";

process.env.DATABASE_URL = "mongodb://127.0.0.1:1/bookmark-tests";

register("./alias-hooks.mjs", import.meta.url);
