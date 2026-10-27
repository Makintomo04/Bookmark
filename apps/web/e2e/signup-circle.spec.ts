import { expect, test } from "@playwright/test"
import { addBookAndStartCircle, copyInvite, expectAccessible, newReader, onboard, readerContext, register } from "./helpers"

// Flow 1: a new reader goes from the landing page to a reading circle they can invite people to.
// The accessibility checks run on the pages this flow passes through.
test("landing → register → onboarding → add a book → start a circle → copy the invite", async ({ browser }, testInfo) => {
  const context = await readerContext(browser, testInfo)
  const page = await context.newPage()
  const reader = newReader("host")

  await page.goto("/")
  await expect(page).toHaveTitle(/Bookmark/)
  await expectAccessible(page, testInfo, "landing")
  await page.getByRole("link", { name: "Start reading free" }).first().click()
  await page.waitForURL("**/register")

  await register(page, reader)
  await onboard(page, reader)
  await page.getByRole("button", { name: "Go to my profile" }).click()
  await page.waitForURL(`**/u/${reader.username}`)
  await expect(page.getByText("Your shelf is empty")).toBeVisible()

  await addBookAndStartCircle(page, { title: `Smoke Test Novel ${reader.username}`, author: "A. Tester", pages: 300 })
  await expect(page.getByRole("heading", { name: "Invite readers" })).toBeVisible()
  await copyInvite(page)
  await expectAccessible(page, testInfo, "circle")

  await page.goto(`/u/${reader.username}`)
  await expect(page.getByText(`Smoke Test Novel ${reader.username}`).first()).toBeVisible()
  await expectAccessible(page, testInfo, "shelf")

  await page.goto("/settings")
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible()
  await expectAccessible(page, testInfo, "settings")

  await context.close()
})

