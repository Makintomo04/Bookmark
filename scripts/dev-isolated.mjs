// Runs `next dev` with its own build folder, so it can run alongside another
// dev server in this checkout without the two overwriting each other's .next.
import { spawn } from "node:child_process"

const child = spawn("npx", ["next", "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NEXT_DIST_DIR: ".next-isolated" },
})
child.on("exit", (code) => process.exit(code ?? 0))
