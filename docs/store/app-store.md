# App Store

Answers and copy for App Store Connect. The App Privacy answers here must match the privacy manifest in
`apps/mobile/app.config.ts` (`ios.privacyManifests`): change one, change the other.

## Listing

**Name** (30 max): Bookmark: Read with Friends

**Subtitle** (30 max): Track books, read together

**Promotional text** (170 max, can change without a new build):
Your reading and your friends, in one app. Track every book, see your stats, and start a reading circle
where comments wait until you've caught up.

**Description:**

> Your reading and your friends, in one app.
>
> Track what you're reading, what you've finished and what's next. Log pages or audiobook minutes, rate in
> quarter stars, write reviews, and keep notes as you go. Put a book down without guilt: did not finish and
> paused are shelves too.
>
> Read together in a reading circle. Pick a book, invite friends, and everyone reads at their own pace.
> Comments are tied to where they were written, so you only see them once you've got there. Set a
> schedule if your group likes one.
>
> Every stat is free. Books and pages by year and month, how you rate, your favourite genres and authors,
> your streak, and a Wrapped at the end of the year.
>
> Bring your history with you. Import from Goodreads or StoryGraph with your ratings, reviews and reading
> dates, and export everything whenever you like.
>
> Find your next book. Browse lists from readers and the Bookmark team, follow friends, and see what
> they're loving.
>
> Medals and reading streaks, if you like a challenge.
>
> Bookmark Plus supports an independent, ad-free app, and lets you host as many reading circles as you
> like, set page and monthly goals, use Ask the shelf more often, and get Catch me up, which recaps the
> story so far when you come back to a book. A free account gets 3 Ask the shelf searches a month to try.
> AI features start off on a free account and come on with Plus, and you can switch them off any time in
> Settings. They're always labelled, and only ever do what you ask. Your stats, your import and the
> circles friends invite you to are never behind Plus.

**Keywords** (100 max, comma separated). Never other apps' names: Apple rejects them (guideline 2.3.7).
reading tracker,book club,reading log,books,reading journal,tbr,buddy read,audiobook,reading goal

**Category:** Books. Secondary: Social Networking.

**Age rating:** answer "None" to every content question: the app's own content has no mature themes.
Answer "Yes" to user-generated content (readers can talk to each other, with reporting and blocking) and
"No" to unrestricted web access. Expect 12+ or 13+, from the user-generated content.

**Support URL:** the site's `/about` (or a support page with a contact address).
**Privacy policy URL:** the site's `/privacy`.

## In-app purchases

The subscription group "Bookmark Plus": monthly, yearly, and Founding Reader yearly, each with the 14-day
free trial as an introductory offer. Review screenshot: the app's Plus screen. Review notes: "Plus is
also sold on our website through Stripe; a reader who subscribed there sees their plan in the app and
manages it on the web. The app sells only through In-App Purchase."

## App Privacy

Tracking: **No.** No data is used for tracking, and there are no ads or third-party analytics in the app.

Data collected, all **linked to the user**, used only for **App Functionality**:

| Data type | What it is |
| --- | --- |
| Email Address | The account's sign-in email |
| Name | The name from Sign in with Apple or Google, when the reader signs in that way |
| User ID | The username and account id |
| Photos or Videos | A profile photo, banner or book cover the reader chooses to upload |
| Other User Content | Shelves, ratings, reviews, notes, lists and reading circle comments |
| Purchase History | Bookmark Plus purchases, via the App Store and RevenueCat |
| Device ID | The push notification token, to send pushes the reader has allowed |

Not collected: location, contacts, health, browsing or search history, diagnostics, usage data.
Book searches go to the server and Open Library to show results and aren't stored against the reader.

## Review notes

> Sign in with email and password: review@<domain> / <password> (on the "Sign in" screen, not
> "Create an account").
>
> The account already has books on its shelves, a reading goal, a friend, and a reading circle for
> Project Hail Mary. In the circle (Circles tab), one comment is visible and one says "Locked until 75%":
> comments unlock as each reader's progress reaches the point they were written at. Update progress on
> the book past 75% to see it open.
>
> User-generated content: every comment has a menu (•••) with Report; reports go to our moderators.
> Readers can be blocked from their profile (••• on the profile). Account deletion is under More →
> Settings → Delete account.
>
> AI features (Ask the shelf on Discover, Catch me up on a book you're reading) are opt-in, labelled "AI",
> and only run when the reader asks.

**Sign in with Apple** is offered next to Google, as guideline 4.8 requires.

**Export compliance:** the app only uses standard HTTPS, so `ITSAppUsesNonExemptEncryption` is false in
the config and no documentation is needed.
