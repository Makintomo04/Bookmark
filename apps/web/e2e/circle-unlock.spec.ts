import { expect, test } from "@playwright/test"
import { addBookAndStartCircle, chooseUsername, copyInvite, logProgress, newReader, readerContext, register, signUpAndOnboard } from "./helpers"

// Flow 2: the spoiler lock. A comment posted at 50% stays hidden from a reader who hasn't got there,
// and opens once they log progress past it.
test("a second reader joins through the invite and posts; the host unlocks it by reading on", async ({ browser }, testInfo) => {
  const hostContext = await readerContext(browser, testInfo)
  const host = await hostContext.newPage()
  const hostReader = newReader("host")
  const title = `Unlock Test Novel ${hostReader.username}`

  await signUpAndOnboard(host, hostReader)
  await addBookAndStartCircle(host, { title, author: "A. Tester", pages: 300 })
  const circleUrl = new URL(host.url()).pathname
  const invite = await copyInvite(host)

  // The guest arrives signed out, signs up from the invite and is carried back to it.
  const guestContext = await readerContext(browser, testInfo)
  const guest = await guestContext.newPage()
  const guestReader = newReader("guest")
  await guest.goto(invite)
  await expect(guest.getByRole("heading", { level: 1, name: title })).toBeVisible()
  await guest.getByRole("link", { name: "Create an account to join" }).click()
  await register(guest, guestReader)
  await chooseUsername(guest, guestReader)
  await guest.waitForURL(`**${invite}`)
  await guest.getByRole("button", { name: "Join the reading circle" }).click()
  await guest.waitForURL(`**${circleUrl}`)
  await expect(guest.getByRole("heading", { level: 1, name: title })).toBeVisible()
  // Joining offers reminders once, checkpoints first; not now.
  const reminders = guest.getByRole("dialog", { name: "Want a nudge to keep reading?" })
  await expect(reminders).toBeVisible()
  await expect(reminders).toContainText("You're in.")
  await reminders.getByRole("button", { name: "Not now" }).click()
  await expect(reminders).toBeHidden()

  // Halfway through, then a comment, which is pinned where the guest is.
  await logProgress(guest, 150)
  await expect(guest.getByRole("button", { name: /^Update my progress · 50%/ })).toBeVisible()
  const comment = `Did not see that twist coming (${guestReader.username})`
  await guest.getByLabel("Your comment").fill(comment)
  await guest.getByRole("button", { name: "Post", exact: true }).click()
  await expect(guest.getByText(comment)).toBeVisible()

  // The host is still at 0%: they see that something's ahead, not what it says.
  await host.reload()
  await expect(host.getByText(/1 comment ahead at\s*50%/)).toBeVisible()
  await expect(host.getByText(comment)).toHaveCount(0)

  await logProgress(host, 200)
  await expect(host.getByText(comment)).toBeVisible()
  await expect(host.getByText(/comment ahead at/)).toHaveCount(0)

  await hostContext.close()
  await guestContext.close()
})
