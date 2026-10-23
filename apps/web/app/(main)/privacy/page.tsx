// LEGAL REVIEW NEEDED: this text was written from what the code does, not by a lawyer. Have it reviewed
// (and set SUPPORT_EMAIL) before launch.
import Container from '@/app/components/Container'
import { supportEmail, supportEmailLabel } from '@/lib/support'
import { Metadata } from 'next'
import Link from 'next/link'
import { FC } from 'react'

export const metadata: Metadata = {
  title: "Privacy Policy",
}

const LAST_UPDATED = "22 October 2026"

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

        <Section title="What we collect">
          <p><strong>Account info:</strong> your email address and a hashed (never plaintext) password, or basic profile details from Google or GitHub if you sign in that way. If you sign in with an emailed link, we only need your email address.</p>
          <p><strong>Profile info:</strong> the username, bio, favourite colour, and any avatar or banner image you choose to add.</p>
          <p><strong>Reading data:</strong> the books, authors, page counts, progress, ratings, reviews, notes, quotes, lists, reading goals, and follow relationships you create while using Bookmark.</p>
          <p><strong>Reading circles:</strong> the circles you host or join, your progress in them, and the comments, replies and reactions you post.</p>
          <p><strong>Imports:</strong> if you import a file from another reading app (such as Goodreads or StoryGraph), we read the rows in it to add those books to your shelf.</p>
          <p><strong>Payments:</strong> if you buy Bookmark Plus, Stripe handles your card details. We keep a reference to your Stripe customer and subscription, and your plan, but never your card number.</p>
          <p><strong>Usage data:</strong> basic, anonymised analytics and page performance data via Vercel Analytics and Vercel Speed Insights. This doesn&apos;t include anything you type into the app.</p>
        </Section>

        <Section title="How we use it">
          <p>To run the app: show you your books, calculate your reading stats and goal progress, run your reading circles, and show your profile to the people your privacy settings allow.</p>
          <p>To keep your account secure (password hashing, session management) and to send you account-related emails, like a sign-in link, an email confirmation, or a password reset link if you request one.</p>
          <p>To run Bookmark Plus: start and manage your subscription or purchase, and give your account the features it has paid for.</p>
          <p>We don&apos;t sell your data, and we don&apos;t use it for advertising.</p>
        </Section>

        <Section title="Who we share it with">
          <p>We use a small number of third-party services to run Bookmark:</p>
          <p>• <strong>Vercel</strong> to host the app, and for anonymised analytics and performance data.<br/>
          • <strong>MongoDB Atlas</strong> to store your data.<br/>
          • <strong>UploadThing</strong> to host images you upload (avatar, banner, book covers).<br/>
          • <strong>Stripe</strong> to take payments for Bookmark Plus and manage subscriptions. Stripe receives your email address and the payment details you enter at checkout.<br/>
          • <strong>An email delivery provider</strong> to send account emails (sign-in links, email confirmation, password resets). It receives your email address and the content of those emails.<br/>
          • <strong>Open Library</strong> to power book search and book details. The text you search for is sent to their public API.<br/>
          • <strong>Anthropic</strong> to help match imported books. When you import a file, rows we can&apos;t match by ISBN or title search may be sent to Anthropic&apos;s Claude model, along with the Open Library results we found for them, so it can pick the right book. Only each row&apos;s title, author, publication year and format are sent: never your ratings, reviews, notes, shelves, or anything identifying you.<br/>
          • <strong>Google and GitHub</strong>, only if you choose to sign in with them.</p>
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
          <p><strong>Invite links:</strong> anyone with a circle&apos;s invite link can see the circle&apos;s book and its members&apos; usernames and avatars, even before they join. They can&apos;t read the comments unless they join. Only share an invite link with people you&apos;re happy to see that.</p>
          <p><strong>Reports:</strong> if you report a comment, our staff review the report and the comment. We don&apos;t tell the author who reported it.</p>
          <p>If you delete your account, comments you posted in reading circles stay so the conversation still makes sense, but they&apos;re shown as a former member&apos;s, without your name or profile. Circles you host pass to the member who has been in them longest.</p>
        </Section>

        <Section title="Cookies">
          <p>We use a session cookie to keep you signed in. That&apos;s it - no third-party advertising or tracking cookies.</p>
        </Section>

        <Section title="Your rights">
          <p>You can view and edit most of your data directly in the app. You can permanently delete your account at any time from <Link href="/settings#delete-account" className="underline">Settings → Delete account</Link>. This immediately deletes your profile, books, notes, reviews, lists, reading goals, follow relationships, and everything else in your account, with one exception: comments you posted in reading circles stay so the conversation still makes sense, but they&apos;re shown as a former member&apos;s, without your name or profile. Circles you host pass to the member who has been in them longest.</p>
          <p>If you have Bookmark Plus, deleting your account cancels your subscription first, so you won&apos;t be charged again.</p>
          <p>If you have questions about your data that aren&apos;t covered here, email us at <Contact />.</p>
        </Section>

        <Section title="Taking your data with you">
          <p>Your data is yours: take it anywhere, anytime. From <Link href="/settings#data" className="underline">Settings → Your data</Link> you can download everything in your account whenever you like, with no waiting and no request to us.</p>
          <p>• <strong>Download my data (JSON)</strong> includes your profile (never your password), your books with ratings, reviews and progress, notes, reading goals, lists, the usernames you follow, and your achievements.<br/>
          • <strong>Export books (CSV)</strong> uses the same columns as a Goodreads export, so other reading apps that import from Goodreads can read it.</p>
          <p>Exports are built when you ask for them and sent straight to your browser. We don&apos;t keep a copy.</p>
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
