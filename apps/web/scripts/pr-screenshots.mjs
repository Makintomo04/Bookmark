// Demo screenshots for a pull request: signs in to a local dev server as a seeded test reader, takes
// each page at desktop and phone width, and (with --publish) pushes the images to the pr-screenshots
// branch and prints the Markdown to paste into the PR description.
//
//   node scripts/pr-screenshots.mjs --base http://localhost:3032 shelf=/u/circlehost circle=/circles/<id>
//   node scripts/pr-screenshots.mjs --base http://localhost:3032 --spec shots.mjs --publish
//
// Shots are name=/path pairs (name=path works too, for Git Bash), or a --spec module whose default export is a list of
//   { name, path, caption?, sizes?: ["desktop"|"mobile"], fullPage?, action?: async (page) => {} }
// where `action` runs after the page loads (open a dialog, fill a form) and before the picture.
//
// Options:
//   --base <url>       dev server, localhost only (default http://localhost:3030, `pnpm dev:test`)
//   --as <email>       who to sign in as (default circle-host@bookmark.test, scripts/seed-test-readers.ts);
//                      the password comes from SHOT_PASSWORD, or the seed's for the two seeded readers
//   --signed-out       don't sign in
//   --sizes <list>     desktop,mobile (default both)
//   --out <dir>        where the PNGs go (default e2e/.screenshots/<branch>)
//   --publish          commit the PNGs to origin's pr-screenshots branch and print the Markdown
//
// The pr-screenshots branch is an orphan branch that only holds images, one folder per feature branch.
// Links point at the commit, so a later run for the same branch never changes an older PR's pictures.
import { execFileSync } from "node:child_process"
import { mkdirSync, rmSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { chromium } from "@playwright/test"

const SEEDED = { "circle-host@bookmark.test": "read-together-2026", "circle-guest@bookmark.test": "read-together-2026" }
const SIZES = {
  desktop: { viewport: { width: 1280, height: 800 } },
  mobile: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
}
const ASSET_BRANCH = "pr-screenshots"

function parseArgs(argv) {
  const opts = { base: "http://localhost:3030", as: "circle-host@bookmark.test", sizes: ["desktop", "mobile"], shots: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--base") opts.base = argv[++i]
    else if (arg === "--as") opts.as = argv[++i]
    else if (arg === "--signed-out") opts.signedOut = true
    else if (arg === "--sizes") opts.sizes = argv[++i].split(",")
    else if (arg === "--out") opts.out = argv[++i]
    else if (arg === "--spec") opts.spec = argv[++i]
    else if (arg === "--publish") opts.publish = true
    else if (/^[\w-]+=/.test(arg)) {
      // The leading slash is optional: Git Bash rewrites a bare /u/name into a Windows path.
      const [name, ...rest] = arg.split("=")
      opts.shots.push({ name, path: "/" + rest.join("=").replace(/^\//, "") })
    } else {
      console.error(`pr-screenshots: unknown argument ${arg}`)
      process.exit(2)
    }
  }
  return opts
}

// stderr is kept quiet: the first fetch of pr-screenshots fails by design, and push chats about PR links.
const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()

async function signIn(page, email, password) {
  await page.goto("/signin")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await page.waitForURL((url) => !url.pathname.startsWith("/signin"), { timeout: 60_000 })
}

async function capture(opts, outDir) {
  const browser = await chromium.launch()
  const files = []
  try {
    for (const size of opts.sizes) {
      const context = await browser.newContext({ ...SIZES[size], baseURL: opts.base, colorScheme: "dark", deviceScaleFactor: 2 })
      const page = await context.newPage()
      if (!opts.signedOut) await signIn(page, opts.as, opts.password)
      for (const shot of opts.shots) {
        if (shot.sizes && !shot.sizes.includes(size)) continue
        await page.goto(shot.path, { waitUntil: "networkidle", timeout: 90_000 })
        // The dev overlay (the N badge and its issue count) isn't part of the app.
        await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" })
        if (shot.action) await shot.action(page)
        // Let fonts, covers and enter animations settle.
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(600)
        const file = path.join(outDir, `${shot.name}-${size}.png`)
        await page.screenshot({ path: file, fullPage: shot.fullPage ?? false })
        files.push({ shot, size, file })
        console.log(`  ${path.relative(process.cwd(), file)}`)
      }
      await context.close()
    }
  } finally {
    await browser.close()
  }
  return files
}

// Adds the files under <folder>/ on origin's pr-screenshots branch without touching the working tree:
// a throwaway index, hash-object, write-tree, commit-tree, push.
function publish(files, folder, branch) {
  const remote = git("remote", "get-url", "origin")
  const repo = remote.match(/github\.com[:/](.+?)(\.git)?$/)?.[1]
  if (!repo) throw new Error(`origin isn't a GitHub repository: ${remote}`)

  let parent = null
  try {
    git("fetch", "--quiet", "origin", `${ASSET_BRANCH}:refs/remotes/origin/${ASSET_BRANCH}`)
    parent = git("rev-parse", `refs/remotes/origin/${ASSET_BRANCH}`)
  } catch {
    // First run: the branch doesn't exist yet and the commit has no parent.
  }

  const index = path.join(git("rev-parse", "--absolute-git-dir"), `pr-screenshots-index-${process.pid}`)
  const env = { ...process.env, GIT_INDEX_FILE: index }
  const run = (...args) => execFileSync("git", args, { encoding: "utf8", env }).trim()
  try {
    if (parent) run("read-tree", parent)
    else run("read-tree", "--empty")
    for (const { file } of files) {
      const blob = run("hash-object", "-w", file)
      run("update-index", "--add", "--cacheinfo", `100644,${blob},${folder}/${path.basename(file)}`)
    }
    const tree = run("write-tree")
    const commit = run("commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", `Screenshots for ${branch}`)
    git("push", "--quiet", "origin", `${commit}:refs/heads/${ASSET_BRANCH}`)
    return (file) => `https://raw.githubusercontent.com/${repo}/${commit}/${folder}/${path.basename(file)}`
  } finally {
    rmSync(index, { force: true })
  }
}

// One row per shot: desktop wide on the left, phone narrow on the right.
function markdown(files, urlFor) {
  const lines = ["## Screenshots", ""]
  const byShot = new Map()
  for (const f of files) byShot.set(f.shot, [...(byShot.get(f.shot) ?? []), f])
  for (const [shot, shots] of byShot) {
    lines.push(`**${shot.caption ?? shot.name}**`, "")
    const desktop = shots.find((s) => s.size === "desktop")
    const mobile = shots.find((s) => s.size === "mobile")
    if (desktop && mobile) {
      lines.push("| Desktop | Phone |", "| --- | --- |")
      lines.push(`| <img src="${urlFor(desktop.file)}" width="640"> | <img src="${urlFor(mobile.file)}" width="200"> |`)
    } else {
      for (const s of shots) lines.push(`<img src="${urlFor(s.file)}" width="${s.size === "mobile" ? 200 : 640}">`)
    }
    lines.push("")
  }
  return lines.join("\n")
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const host = new URL(opts.base).hostname
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host) && !host.endsWith(".localhost")) {
    console.error("pr-screenshots: --base must be a local dev server")
    process.exit(2)
  }
  if (opts.spec) opts.shots.push(...(await import(pathToFileURL(path.resolve(opts.spec)).href)).default)
  if (!opts.shots.length) {
    console.error("pr-screenshots: no shots (name=/path or --spec)")
    process.exit(2)
  }
  opts.password = process.env.SHOT_PASSWORD || SEEDED[opts.as]
  if (!opts.signedOut && !opts.password) {
    console.error(`pr-screenshots: set SHOT_PASSWORD for ${opts.as}`)
    process.exit(2)
  }

  const branch = git("rev-parse", "--abbrev-ref", "HEAD")
  const folder = branch.replace(/[^\w.-]+/g, "-")
  const outDir = path.resolve(opts.out ?? path.join("e2e", ".screenshots", folder))
  mkdirSync(outDir, { recursive: true })

  console.log(`Taking ${opts.shots.length} shot(s) at ${opts.sizes.join(" and ")} from ${opts.base}`)
  const files = await capture(opts, outDir)
  if (!opts.publish) {
    console.log("\nCheck them, then run again with --publish to get the Markdown.")
    return
  }
  const urlFor = publish(files, folder, branch)
  console.log(`\nPushed to ${ASSET_BRANCH}. Paste this into the PR description:\n`)
  console.log(markdown(files, urlFor))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
