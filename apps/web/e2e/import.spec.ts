import path from "node:path"
import { expect, test } from "@playwright/test"
import { newReader, onboard, readerContext, register } from "./helpers"

// Flow 3: a Goodreads export lands on the right shelves. The fixture is the one the import unit tests
// use: 7 rows, one with no title, so 6 books.
const FIXTURE = path.join(__dirname, "..", "scripts", "test", "fixtures", "goodreads.csv")

test("a small Goodreads CSV lands on the right shelves", async ({ browser }, testInfo) => {
  const context = await readerContext(browser, testInfo)
  const page = await context.newPage()
  const reader = newReader("import")

  await page.goto("/register")
  await register(page, reader)
  await onboard(page, reader)
  await page.getByRole("button", { name: "Import from Goodreads or StoryGraph" }).click()
  await page.waitForURL("**/import")
  await expect(page.getByRole("heading", { name: "Bring your library with you" })).toBeVisible()

  await page.locator("#import-file").setInputFiles(FIXTURE)
  // Matching asks Open Library about each row; rows it can't match are still imported as typed.
  await expect(page.getByRole("heading", { name: "Ready to import 6 books" })).toBeVisible({ timeout: 150_000 })
  await page.getByRole("button", { name: "Import 6 books" }).click()
  await expect(page.getByText("Welcome home.")).toBeVisible({ timeout: 60_000 })

  await page.getByRole("link", { name: "Go to my shelves" }).click()
  await page.waitForURL(`**/u/${reader.username}`)
  const shelf = (id: string) => page.locator(`#${id}`)
  await expect(shelf("shelf-finished")).toContainText("Hobbit")
  await expect(shelf("shelf-finished")).toContainText("Dune")
  await expect(shelf("shelf-dnf")).toContainText("Infinite Jest")
  await expect(shelf("shelf-dnf")).toContainText("Middlemarch")
  await expect(shelf("shelf-paused")).toContainText("Name of the Wind")
  await expect(page.getByText("Project Hail Mary").first()).toBeVisible()
  await expect(shelf("shelf-want")).toHaveCount(0)

  await context.close()
})
