// LEGAL REVIEW NEEDED: this text was written from what the code does, not by a lawyer. Have it reviewed
// (and set SUPPORT_EMAIL) before launch.
//
// The 23 October 2026 draft adds the iPhone and Android apps. Every passage that's new or changed for them
// is marked with a "LEGAL REVIEW (app)" comment, and docs/store/privacy-changes.md lists them with the
// questions for the reviewer. Remove the markers once it's been reviewed.
import Container from '@/app/components/Container'
import { supportEmail, supportEmailLabel } from '@/lib/support'
import { Metadata } from 'next'
import Link from 'next/link'
import { FC } from 'react'

export const metadata: Metadata = {
  title: "Privacy Policy",
}

const LAST_UPDATED = "1 November 2026"

const Section: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="flex flex-col gap-2 mb-8">
    <h2 className="text-xl font-bold">{title}</h2>
    <div className="text-sm text-neutral-600 dark:text-neutral-300/90 flex flex-col gap-3">{children}</div>
  </div>
)

const Contact: FC = () =>
  supportEmail ? <a href={`mailto:${supportEmail}`} className="underline">{supportEmail}</a> : <span>{supportEmailLabel}</span>

const Page: FC = () => {
  return (
    <div className="mt-12 mb-20">
      <Container className="max-w-2xl">
        <h1 className="page-title mb-2">Privacy Policy</h1>
        <p className="text-xs text-muted-foreground mb-10">Last updated: {LAST_UPDATED}</p>

        {/* LEGAL REVIEW (app): new. Says the policy covers the apps as well as the website. */}
        <p className="text-sm text-neutral-600 dark:text-neutral-300/90 mb-8">
          This policy covers Bookmark on the web and the Bookmark apps for iPhone and Android. They share one account, so the same data and the same choices apply wherever you use it.
        </p>

        <Section title="What we collect">
          {/* LEGAL REVIEW (app): Sign in with Apple added, with the relay address and the name it shares. */}
          <p><strong>Account info:</strong> your email address and a hashed (never plaintext) password, or basic profile details from Google, Apple or GitHub if you sign in that way. If you sign in with Apple, Apple may give us a private relay address that forwards to your real one, and the name you chose to share, if any. If you sign in with an emailed link, we only need your email address.</p>
          <p><strong>Profile info:</strong> the username, bio, favourite colour, and any avatar or banner image you choose to add.</p>
          <p><strong>Reading data:</strong> the books, authors, page counts, progress, ratings, reviews, notes, quotes, lists, reading goals, and follow relationships you create while using Bookmark.</p>
          {/* LEGAL REVIEW (app): new. Uploaded covers stay on the uploader's own shelf (lib/uploads.ts). */}
          <p><strong>Covers you upload:</strong> a book cover you upload is shown only on your own copy of the book, to the people who can see your shelf. It&apos;s never used as the cover anyone else sees: not in search, not in Bookmark&apos;s shared catalogue of books, and not on reading circles, lists or other readers&apos; shelves.</p>
          <p><strong>Reading circles:</strong> the circles you host or join, your progress in them, and the comments, replies and reactions you post.</p>
          <p><strong>Imports:</strong> if you import a file from another reading app (such as Goodreads or StoryGraph), we read the rows in it to add those books to your shelf.</p>
          {/* LEGAL REVIEW (app): App Store and Google Play purchases, through RevenueCat, added. */}
          <p><strong>Payments:</strong> if you buy Bookmark Plus on the website, Stripe handles your card details. We keep a reference to your Stripe customer and subscription, and your plan, but never your card number. If you buy Plus in the app, Apple or Google take the payment and we never see your payment details. RevenueCat, which manages app purchases for us, tells us which plan you bought, whether it&apos;s a free trial, and when it renews or ends. RevenueCat knows your purchases by your Bookmark account ID, not your name or email.</p>
          {/* LEGAL REVIEW (app): new. What the apps keep on our side: signed-in devices and push tokens. */}
          <p><strong>Signed-in phones:</strong> when you sign in to the app, we keep a record of that sign-in so you stay signed in: whether it&apos;s an iPhone or Android phone, when it was last used, and a sign-in token stored only in scrambled (hashed) form.</p>
          <p><strong>Push notifications:</strong> if you allow notifications, we store your phone&apos;s push token so we can send the ones you&apos;ve left on in Settings → Notifications. It&apos;s deleted when you sign out, when you delete your account, or when your phone stops accepting it.</p>
          {/* LEGAL REVIEW (app): the app has no analytics; this now says the analytics are the website's. */}
          <p><strong>Usage data:</strong> on the website, basic, anonymised analytics and page performance data via Vercel Analytics and Vercel Speed Insights. This doesn&apos;t include anything you type. The apps don&apos;t collect analytics.</p>
        </Section>

        <Section title="How we use it">
          <p>To run the app: show you your books, calculate your reading stats and goal progress, run your reading circles, and show your profile to the people your privacy settings allow.</p>
          <p>To keep your account secure (password hashing, session management) and to send you account-related emails, like a sign-in link, an email confirmation, or a password reset link if you request one.</p>
          {/* LEGAL REVIEW (app): new. */}
          <p>To send push notifications you&apos;ve allowed: reading circle invites and activity, new followers and follow requests, and books friends send you. A notification says who did something and which book it&apos;s about, but never what anyone wrote, since lock screens can be seen by others.</p>
          <p>To run Bookmark Plus: start and manage your subscription or purchase, and give your account the features it has paid for.</p>
          <p>We don&apos;t sell your data, and we don&apos;t use it for advertising.</p>
          {/* LEGAL REVIEW (app): new. Sponsored slots and shop links, with no ad network or targeting. */}
          <p><strong>Sponsored books and shop links:</strong> on a free account, some pages may show a book a publisher has paid to feature, always labelled &ldquo;Sponsored&rdquo;. Everyone on that page sees the same one: it isn&apos;t chosen from your reading, and the publisher learns nothing about you. Plus members don&apos;t see them. Book pages also link to shops such as Bookshop.org and Amazon, and we may earn a commission if you buy through them. Those links carry no information about you.</p>
        </Section>

        {/* LEGAL REVIEW (app): new section. Ask the shelf and Catch me up weren't covered at all before. */}
        <Section title="AI features">
          <p>Bookmark has two AI features. Each one runs only when you ask, its results are always labelled as AI, and it&apos;s about books, never about you.</p>
          <p>• <strong>Ask the shelf</strong> (Discover): what you type, such as &ldquo;a cosy fantasy with found family&rdquo;, is sent to Anthropic&apos;s Claude model to turn it into a search. The books come from Bookmark&apos;s own catalogue, and the model then writes a short reason for each one from the book&apos;s details. We don&apos;t save what you typed; we only count how many searches you&apos;ve made this month.<br/>
          • <strong>Catch me up</strong> (on a book you&apos;re coming back to): to write a recap of the story so far, we send the model the book&apos;s title, author and series, how far through it you are, your own notes on that book, and comments from your reading circles for it that you can already see. Comments are sent without anyone&apos;s name or username. The recap is saved so you can open it again, and only you see it. You can turn Catch me up off in Settings → AI features.</p>
          <p>Neither feature sends your email, your username, your ratings or your reviews.</p>
        </Section>

        <Section title="Who we share it with">
          <p>We use a small number of third-party services to run Bookmark:</p>
          <p>• <strong>Vercel</strong> to host the app, and for anonymised analytics and performance data on the website.<br/>
          • <strong>MongoDB Atlas</strong> to store your data.<br/>
          • <strong>UploadThing</strong> to host images you upload (avatar, banner, book covers).<br/>
          • <strong>Stripe</strong> to take payments for Bookmark Plus on the website and manage those subscriptions. Stripe receives your email address and the payment details you enter at checkout.<br/>
          {/* LEGAL REVIEW (app): Apple, Google, RevenueCat and Expo added. */}
          • <strong>Apple and Google</strong> to take payments for Bookmark Plus bought in the app (through the App Store and Google Play), and to deliver push notifications to your phone.<br/>
          • <strong>RevenueCat</strong> to manage purchases made in the app. It receives your Bookmark account ID and the purchases you make through Apple or Google.<br/>
          • <strong>Expo</strong> to send push notifications to Apple and Google for delivery. It receives your phone&apos;s push token and the notification&apos;s text.<br/>
          • <strong>An email delivery provider</strong> to send account emails (sign-in links, email confirmation, password resets). It receives your email address and the content of those emails.<br/>
          • <strong>Open Library</strong> to power book search and book details. The text you search for is sent to their public API.<br/>
          {/* LEGAL REVIEW (app): widened from import matching alone to all three uses of Anthropic. */}
          • <strong>Anthropic</strong> for the AI features above, and to help match imported books. When you import a file, rows we can&apos;t match by ISBN or title search may be sent to Anthropic&apos;s Claude model, along with the Open Library results we found for them, so it can pick the right book. Only each row&apos;s title, author, publication year and format are sent: never your ratings, reviews, notes, shelves, or anything identifying you.<br/>
          • <strong>Google, Apple and GitHub</strong>, only if you choose to sign in with them.</p>
          <p>None of these services get access to your password.</p>
        </Section>

        <Section title="Who can see your profile">
          <p>You choose who sees your profile in <Link href="/settings#privacy" className="underline">Settings → Privacy</Link>:</p>
          <p>• <strong>Public</strong> (the default): anyone with the link can see your shelf, including people without a Bookmark account, and your profile can show up in search engines.<br/>
          • <strong>Followers only</strong>: only people you&apos;ve approved as followers see your shelf and activity. Anyone else sees your name and can ask to follow you. Nobody follows you until you approve the request.<br/>
          • <strong>Private</strong>: only you see your shelf. You&apos;re hidden from search, and your activity stays out of other people&apos;s feeds. Follow requests also need your approval.</p>
          <p>You can also choose who reads your reviews, hide your Want to read shelf, and hide your follower and following counts. Your email and password are never shown to anyone.</p>
          <p>Your yearly Wrapped (a summary of the books you finished that year) follows your profile setting.</p>
        </Section>

        <Section title="Reading circles">
          <p><strong>Comments:</strong> what you post in a circle is visible to that circle&apos;s members. Each comment is locked until a member has read up to the point it was written at, so nobody sees it before they get there.</p>
          {/* LEGAL REVIEW (app): new. Comments can be used, without names, in other members' recaps. */}
          <p><strong>Recaps:</strong> if another member asks Catch me up for a recap of the book, comments they can already see, including yours, may be sent to the AI model to help write it, without your name or username. Only that member sees the recap.</p>
          <p><strong>Invite links:</strong> anyone with a circle&apos;s invite link can see the circle&apos;s book and its members&apos; usernames and avatars, even before they join. They can&apos;t read the comments unless they join. Only share an invite link with people you&apos;re happy to see that.</p>
          <p><strong>Reports:</strong> if you report a comment, our staff review the report and the comment. We don&apos;t tell the author who reported it.</p>
          <p>If you delete your account, comments you posted in reading circles stay so the conversation still makes sense, but they&apos;re shown as a former member&apos;s, without your name or profile. Circles you host pass to the member who has been in them longest.</p>
        </Section>

        {/* LEGAL REVIEW (app): retitled from "Cookies"; adds what the app keeps on the phone. */}
        <Section title="Cookies and storage on your phone">
          <p>On the website, we use a session cookie to keep you signed in. That&apos;s it: no third-party advertising or tracking cookies. If you follow a shop link, that shop&apos;s own site may set its cookies, under its own privacy policy.</p>
          <p>The app keeps your sign-in in your phone&apos;s secure storage (the iOS Keychain or Android Keystore), and remembers preferences such as light or dark mode on the phone. Signing out removes the sign-in.</p>
        </Section>

        <Section title="Your rights">
          {/* LEGAL REVIEW (app): the app's delete option and the public deletion page added. */}
          <p>You can view and edit most of your data directly in the app. You can permanently delete your account at any time from <Link href="/settings#delete-account" className="underline">Settings → Delete account</Link> on the website, or More → Settings → Delete account in the app. If you can&apos;t sign in, <Link href="/delete-account" className="underline">here&apos;s how to ask us to delete it</Link>. This immediately deletes your profile, books, notes, reviews, lists, reading goals, follow relationships, AI recaps, signed-in phones, push tokens, and everything else in your account, with one exception: comments you posted in reading circles stay so the conversation still makes sense, but they&apos;re shown as a former member&apos;s, without your name or profile. Circles you host pass to the member who has been in them longest.</p>
          {/* LEGAL REVIEW (app): image files are deleted with the account (lib/uploadedImagesServer.ts). */}
          <p>Every image you uploaded is deleted from UploadThing too. Copies of Open Library covers we stored for your books are deleted as well, unless another reader&apos;s book shows the same cover.</p>
          {/* LEGAL REVIEW (app): corrected. Deleting can't cancel an App Store or Google Play subscription. */}
          <p>If you subscribed to Bookmark Plus on the website, deleting your account cancels that subscription first, so you won&apos;t be charged again. If you subscribed in the app, the subscription is billed by Apple or Google and only you can cancel it, in your App Store or Google Play account settings. Deleting your Bookmark account doesn&apos;t stop it, so cancel it there first. We also remove your purchase records from RevenueCat when you delete your account.</p>
          <p>If you have questions about your data that aren&apos;t covered here, email us at <Contact />.</p>
        </Section>

        <Section title="Taking your data with you">
          <p>Your data is yours: take it anywhere, anytime. From <Link href="/settings#data" className="underline">Settings → Your data</Link> you can download everything in your account whenever you like, with no waiting and no request to us.</p>
          <p>• <strong>Download my data (JSON)</strong> includes your profile (never your password), your books with ratings, reviews and progress, notes, reading goals, lists, the usernames you follow, and your achievements.<br/>
          • <strong>Export books (CSV)</strong> uses the same columns as a Goodreads export, so other reading apps that import from Goodreads can read it.</p>
          {/* LEGAL REVIEW (app): the app's share sheet added. */}
          <p>Exports are built when you ask for them and sent straight to your browser, or in the app to your phone&apos;s share sheet so you can save or send them. We don&apos;t keep a copy.</p>
        </Section>

        <Section title="Children's privacy">
          <p>Bookmark isn&apos;t intended for children under 13. We don&apos;t knowingly collect data from children under 13.</p>
        </Section>

        <Section title="Changes to this policy">
          <p>If we make material changes to how we handle your data, we&apos;ll do our best to let you know.</p>
        </Section>
      </Container>
    </div>
  )
}

export default Page
