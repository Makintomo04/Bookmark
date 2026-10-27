import { randomBytes, randomInt } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import AxeBuilder from "@axe-core/playwright"
import { expect, type Browser, type Page, type TestInfo } from "@playwright/test"

// Shared steps for the smoke flows. Every reader is made fresh through the real sign-up, with a
// generated @bookmark.test address and password, so runs never depend on (or touch) seeded accounts.

export const OUTBOX_DIR = path.join(__dirname, ".outbox")

export interface Reader {
  email: string
  password: string
  username: string
}

export function newReader(tag: string): Reader {
  const id = randomBytes(4).toString("hex")
  return {
    email: `e2e-${tag}-${id}@bookmark.test`,
    password: randomBytes(12).toString("base64url"),
    username: `e2e${tag}${id}`,
  }
}

// A browser context for one reader, with the project's viewport and its own client IP: the app's rate
// limits (lib/rateLimit.ts) key on x-forwarded-for, so readers and reruns don't share a budget.
export async function readerContext(browser: Browser, testInfo: TestInfo) {
  const { viewport, isMobile, hasTouch, userAgent, deviceScaleFactor, baseURL } = testInfo.project.use
  const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`
  const context = await browser.newContext({
    viewport, isMobile, hasTouch, userAgent, deviceScaleFactor, baseURL,
    extraHTTPHeaders: { "x-forwarded-for": ip },
  })
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL })
  return context
}

// The newest confirmation link mailed to `email`, from the outbox lib/mailer.ts writes in the tests.
async function verifyLinkFor(email: string) {
  let link: string | undefined
  await expect.poll(() => {
    const files = readdirSync(OUTBOX_DIR, { withFileTypes: true }).filter((f) => f.isFile()).map((f) => f.name).sort()
    for (const file of files.reverse()) {
      const message = JSON.parse(readFileSync(path.join(OUTBOX_DIR, file), "utf8"))
      // nodemailer's JSON transport: { to: [{ address, name }], text, html, ... }
      const to = (message.to ?? []).map((r: { address?: string }) => r.address)
      const match = typeof message.text === "string" && message.text.match(/https?:\/\/\S+\/verify-email\?\S+/)
      if (to.includes(email) && match) {
        link = match[0]
        return true
      }
    }
    return false
  }, { message: `confirmation email to ${email}`, timeout: 30_000 }).toBe(true)
  // Same host as the test server, minus the origin (NEXTAUTH_URL already points at it).
  const url = new URL(link!)
  return url.pathname + url.search
}

// Fills the register form (already open) and follows the emailed confirmation link.
export async function register(page: Page, reader: Reader) {
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible()
  await page.getByLabel("Email").fill(reader.email)
  await page.getByLabel("Password", { exact: true }).fill(reader.password)
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible()

  await page.goto(await verifyLinkFor(reader.email))
  await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible()
  await page.getByRole("button", { name: "Confirm and continue" }).click()
}

// Step 1 of onboarding: the username, then `Continue` (or `Save and continue` when arriving from an invite).
export async function chooseUsername(page: Page, reader: Reader) {
  await expect(page.getByRole("heading", { name: "Set up your profile" })).toBeVisible({ timeout: 60_000 })
  await page.getByLabel("Username").fill(reader.username)
  await expect(page.getByText(`Available · your profile will be /u/${reader.username}`)).toBeVisible()
  await page.getByRole("button", { name: /^(Save and )?[Cc]ontinue$/ }).click()
}

// Full onboarding without an invite: username, skip genres, then out to the profile (the shelf).
export async function onboard(page: Page, reader: Reader) {
  await chooseUsername(page, reader)
  await expect(page.getByRole("heading", { name: "What do you like to read?" })).toBeVisible()
  await page.getByRole("button", { name: "Skip" }).click()
  await expect(page.getByRole("heading", { name: `Welcome, ${reader.username}` })).toBeVisible()
}

export async function signUpAndOnboard(page: Page, reader: Reader) {
  await page.goto("/register")
  await register(page, reader)
  await onboard(page, reader)
  await page.getByRole("button", { name: "Go to my profile" }).click()
  await page.waitForURL(`**/u/${reader.username}`)
}

// Adds a book by hand from the profile (no catalogue lookup), on Reading, with the circle switch on,
// and lands on /circles/new with it.
export async function addBookAndStartCircle(page: Page, book: { title: string; author: string; pages: number }) {
  await page.getByRole("button", { name: "Add a book" }).first().click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("textbox", { name: "Search for a book" }).fill(book.title)
  await dialog.getByRole("button", { name: "Can't find it? Add it manually" }).click()
  await expect(dialog.getByLabel("Title")).toHaveValue(book.title)
  await dialog.getByLabel("Author").fill(book.author)
  await dialog.getByRole("radio", { name: "Reading" }).click()
  await dialog.getByLabel(/^Total pages/).fill(String(book.pages))
  await dialog.getByRole("switch", { name: /Start a reading circle for this book/ }).click()
  await dialog.getByRole("button", { name: "Start reading" }).click()

  await page.waitForURL("**/circles/new**")
  await expect(page.getByRole("heading", { name: "Start a reading circle" })).toBeVisible()
  const choice = page.locator("label").filter({ hasText: book.title })
  await choice.click()
  await page.getByRole("button", { name: "Start and get the link" }).click()
  await page.waitForURL(/\/circles\/[a-f0-9]{24}$/)
  await expect(page.getByRole("heading", { level: 1, name: book.title })).toBeVisible()
}

// Clicks "Copy invite link" and returns the copied URL's path.
export async function copyInvite(page: Page) {
  await page.getByRole("button", { name: "Copy invite link" }).click()
  await expect(page.getByText("Link copied")).toBeVisible()
  const link: string = await page.evaluate(() => navigator.clipboard.readText())
  expect(link).toMatch(/\/circles\/join\/[a-z0-9]{6,20}$/)
  return new URL(link).pathname
}

// From a circle page: "Update my progress" → page number → Save.
export async function logProgress(page: Page, toPage: number) {
  await page.getByRole("button", { name: /^Update my progress/ }).click()
  const dialog = page.getByRole("dialog")
  await dialog.locator("#current-page").fill(String(toPage))
  await dialog.getByRole("button", { name: "Save progress" }).click()
  await expect(dialog).toBeHidden()
}

// Serious and critical WCAG 2 A/AA problems fail the run; minor and moderate ones are logged.
export async function expectAccessible(page: Page, testInfo: TestInfo, name: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()
  await testInfo.attach(`axe-${name}.json`, { body: JSON.stringify(results.violations, null, 2), contentType: "application/json" })
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
  expect(
    blocking.map((v) => `${v.id} (${v.impact}): ${v.help}: ${v.nodes.slice(0, 5).map((n) => n.html.slice(0, 160)).join(" | ")}`),
    `axe on ${name}`,
  ).toEqual([])
}
