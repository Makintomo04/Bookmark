# Google Play

Answers and copy for the Play Console. They describe the same data as [app-store.md](app-store.md#app-privacy);
keep them in step.

## Listing

**App name** (30 max): Bookmark: Read with Friends

**Short description** (80 max): Track your books, see every stat free, and read together in reading circles.

**Full description:** the App Store description, unchanged (Play allows 4,000 characters).

**Category:** Books & Reference. **Tags:** Books, Social, Productivity.

**Contact email and privacy policy:** the site's `/privacy`, and a support address.

## App content

- **Ads:** no.
- **Target audience:** 13 and over. Not designed for children.
- **Content rating (IARC questionnaire):** the app lets users interact and share content with each other
  (reading circle comments, reviews, follows); there's reporting and blocking. No violence, sexual content,
  gambling or controlled substances in the app's own content. Expect a Teen / PEGI 12 rating.
- **News app:** no. **Government app:** no. **Financial features:** none (Plus is a subscription).
- **Health apps:** no.
- **Account deletion:** in the app at More → Settings → Delete account, and a web link for people who
  no longer have the app (see the README: this page still needs making).
- **App access:** "All or some functionality is restricted": give the review account from
  [app-store.md](app-store.md#review-notes) with the same notes.

## Data safety

Data is **encrypted in transit**. Readers **can ask for their data to be deleted** (in the app, and by
the web link). No data is **shared** with third parties for their own use; the services that process data
for Bookmark (hosting, image storage, email, payments, RevenueCat) are service providers, which Play
doesn't count as sharing.

Collected, all **required or optional as noted**, used for **App functionality** and **Account management**
only, never for advertising, analytics or personalisation:

| Category | Type | Required? | Notes |
| --- | --- | --- | --- |
| Personal info | Email address | Required | Sign-in |
| Personal info | Name | Optional | Only from Google or Apple sign-in |
| Personal info | User IDs | Required | Username and account id |
| Photos and videos | Photos | Optional | Profile photo, banner, book covers the reader uploads |
| Messages | Other in-app messages | Optional | Reading circle comments and replies |
| App activity | Other user-generated content | Optional | Shelves, ratings, reviews, notes, lists |
| Financial info | Purchase history | Optional | Bookmark Plus via Google Play and RevenueCat |
| Device or other IDs | Device or other IDs | Optional | The push token, when the reader allows notifications |

Not collected: location, contacts, calendar, files (an imported CSV is read and discarded; the books in it
become user-generated content), web browsing, search history, app interactions, crash logs, diagnostics.

## Release

Play's internal track first (`eas submit` puts builds there as drafts). A new personal developer account
then needs a **closed test with 12 or more testers for 14 days** before production access opens.
