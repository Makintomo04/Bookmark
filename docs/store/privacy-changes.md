# Privacy policy changes for the apps: notes for legal review

The 23 October 2026 draft of [/privacy](../../apps/web/app/(main)/privacy/page.tsx) adds the iPhone and
Android apps, and [/delete-account](../../apps/web/app/(main)/delete-account/page.tsx) is new. Both were
written from what the code does, not by a lawyer. In the page source, every changed passage carries a
`LEGAL REVIEW` comment. This note lists them with the questions to settle.

## What changed, and the code it comes from

| Change | Where it comes from |
| --- | --- |
| The policy covers the website and both apps | One account and one API for all three |
| Sign in with Apple, including a private relay email and the name Apple shares | `lib/socialSignIn.ts` stores the name the provider gives |
| App Store and Google Play purchases, via RevenueCat, which knows the account ID and not the email | `apps/mobile/src/lib/purchases.ts` logs in with the user id only; `lib/storeBilling.ts` |
| Signed-in phones: platform, last used, a hashed sign-in token | `MobileSession` in the schema |
| Push tokens: stored when allowed, deleted on sign-out, on deletion, or when the phone rejects them | `PushToken`; `api/mobile/auth/sign-out`; `lib/push.ts` |
| Push text names who and which book, never what anyone wrote | `packages/shared/src/push.ts` |
| The apps collect no analytics | No analytics SDK in `apps/mobile` |
| **AI features**, a new section: what Ask the shelf and Catch me up send to Anthropic | `lib/askShelf.ts`, `lib/recap.ts`, `lib/recapSource.ts` |
| A reader's circle comments can go, without names, into another member's recap | `lib/recap.ts` sends the comments the asking reader has unlocked |
| Apple, Google, RevenueCat and Expo added as service providers | Payments, push delivery (`lib/push.ts` sends through Expo) |
| Storage on the phone: Keychain or Keystore for sign-in, local preferences | `apps/mobile/src/lib/secureStorage.ts`, AsyncStorage |
| Deleting from the app, and the new page for people who can't sign in | Settings in the app; `/delete-account` |
| **Corrected:** deleting doesn't cancel an App Store or Google Play subscription | Only Stripe can be cancelled from the server (`lib/accountDeletion.ts`) |
| Covers a reader uploads stay on their own copy: never in search, the catalogue, circles, lists or other shelves | `lib/uploads.ts` (the `Upload` model), [the proposal](../proposals/private-uploaded-covers.md) |
| Every upload is deleted with the account; stored Open Library cover copies too, unless another reader's book shows them | `lib/uploadedImages.ts`, `lib/uploadedImagesServer.ts` |
| Exports in the app go to the share sheet, with no copy kept | `apps/mobile/src/app/(app)/settings.tsx` |

## Questions for the reviewer

1. **Other members' comments in recaps.** Catch me up sends the text of comments the reader can already see,
   written by other circle members, to Anthropic, without names. Is a notice in the policy enough, or
   does it need consent from the commenters, or a way to opt their comments out? Under UK/EU GDPR, a
   comment can still be personal data without a name.
2. **Anthropic's role and retention.** The draft treats Anthropic as a service provider (processor). Confirm
   that against the API terms we're on, including how long requests are kept and that they aren't used
   for training, and whether the policy should say so.
3. **International transfers.** Vercel, MongoDB Atlas, UploadThing, Stripe, RevenueCat, Expo and Anthropic
   may process data outside the UK and EU. The policy doesn't mention transfers or safeguards.
4. **Lawful bases and controller details.** The policy has no controller name or address and no lawful
   basis per use. UK/EU readers are entitled to both, and the right to complain to the ICO or a regulator.
5. **Retention periods.** Only deletion is described. Sign-in records expire, and push tokens go when
   rejected, but nothing says how long other data is kept while an account is open, or backups after
   deletion.
6. **Uploads before this change.** Uploads made before uploads were kept private may already have been
   shown to other readers. `scripts/private-covers.ts` takes them out of shared places and records them
   so they're deleted with the account. It has to be run (dry run, then `--apply`) on production before the
   policy's wording is true there.
7. **The 30-day reply time** on `/delete-account` for readers who can't sign in. That's a promise to staff
   as well as readers.
8. **Children.** "Not intended for under 13" matches the stores' 12+/Teen ratings, but in the UK the age
   of digital consent is 13 and the Children's Code applies to services likely to be used by under-18s.

## Before launch

- Set `SUPPORT_EMAIL`, or both pages show a placeholder.
- Once reviewed, remove the `LEGAL REVIEW` comments and the "LEGAL REVIEW NEEDED" header, and set
  `LAST_UPDATED` to the publication date.
- Put `https://<site>/delete-account` in the Play Console (Data safety → Data deletion), and link the
  privacy policy in both stores.
