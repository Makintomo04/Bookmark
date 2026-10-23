// Runs a command against the bookmark-test database instead of the one in .env.local.
//
//   node scripts/with-test-db.mjs npx prisma db push --skip-generate
//   node scripts/with-test-db.mjs node scripts/seed-test-readers.ts
//
// Everything else comes from .env.local; only the database name in DATABASE_URL is swapped, so the
// same Atlas cluster and login are used. EMAIL_SERVER_* is dropped so mail goes to a disposable
// Ethereal inbox (lib/mailer.ts logs a preview link) and never reaches a real address.
import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"

const TEST_DB = "bookmark-test"
// The port the wrapped `next dev` binds (its -p/--port), so NEXTAUTH_URL matches when two checkouts
// run test servers side by side. 3030 is the default in package.json.
const portArg = process.argv.findIndex((a) => a === "-p" || a === "--port")
const TEST_PORT = portArg > 0 ? Number(process.argv[portArg + 1]) || 3030 : 3030

function readEnvFile(path) {
  const env = {}
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match) continue
    let value = match[2]
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1)
    env[match[1]] = value
  }
  return env
}

const fileEnv = readEnvFile(".env.local")
const url = fileEnv.DATABASE_URL
if (!url) {
  console.error("with-test-db: DATABASE_URL is missing from .env.local")
  process.exit(1)
}
// mongodb[+srv]://user:pass@host/<database>?options
const testUrl = url.replace(/^(mongodb(?:\+srv)?:\/\/[^/]+\/)([^?]*)/, `$1${TEST_DB}`)
if (testUrl === url && !url.includes(`/${TEST_DB}`)) {
  console.error("with-test-db: couldn't find the database name in DATABASE_URL")
  process.exit(1)
}

const env = {
  ...process.env,
  ...fileEnv,
  DATABASE_URL: testUrl,
  // `npm run dev:test` serves here, with its own build folder, alongside the normal dev server.
  NEXTAUTH_URL: `http://localhost:${TEST_PORT}`,
  NEXT_PUBLIC_SITE_URL: `http://localhost:${TEST_PORT}`,
  NEXT_DIST_DIR: ".next-test",
}
// Blank rather than deleted: Next.js fills in any variable that's unset from .env.local again.
for (const key of ["EMAIL_SERVER_HOST", "EMAIL_SERVER_PORT", "EMAIL_SERVER_USER", "EMAIL_SERVER_PASSWORD"]) env[key] = ""

const [command, ...args] = process.argv.slice(2)
if (!command) {
  console.error("usage: node scripts/with-test-db.mjs <command> [args...]")
  process.exit(1)
}
console.log(`with-test-db: using database "${TEST_DB}"`)
const child = spawn(command, args, { stdio: "inherit", shell: true, env })
child.on("exit", (code) => process.exit(code ?? 0))
