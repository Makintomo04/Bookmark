// LEGAL REVIEW NEEDED: written from what lib/accountDeletion.ts does, not by a lawyer. Google Play asks
// for this page: a link, outside the app, where anyone can find out how to delete their account and what
// happens to their data. Its address goes in the Play Console's Data safety form. Have the promised reply
// time checked (and SUPPORT_EMAIL set) before launch.
import Container from '@/app/components/Container'
import { supportEmail, supportEmailLabel } from '@/lib/support'
import { Metadata } from 'next'
import Link from 'next/link'
import { FC } from 'react'

export const metadata: Metadata = {
  title: "Delete your account",
  description: "How to delete your Bookmark account, from the app, the website, or by email, and what happens to your data.",
}

const Section: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="flex flex-col gap-2 mb-8">
    <h2 className="text-xl font-bold">{title}</h2>
    <div className="text-sm text-neutral-600 dark:text-neutral-300/90 flex flex-col gap-3">{children}</div>
  </div>
)

const Contact: FC = () =>
  supportEmail ? <a href={`mailto:${supportEmail}?subject=Delete%20my%20Bookmark%20account`} className="underline">{supportEmail}</a> : <span>{supportEmailLabel}</span>

// Public on purpose: it's for people who no longer have the app or can't sign in.
const Page: FC = () => {
  return (
    <div className="mt-12 mb-20">
      <Container className="max-w-2xl">
        <h1 className="page-title mb-2">Delete your Bookmark account</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-300/90 mb-10">
          You can delete your account whenever you like, from the Bookmark app for iPhone or Android, from the website, or by asking us.
        </p>

        <Section title="If you subscribe to Bookmark Plus in the app">
          <p>
            Cancel it first. Plus bought in the app is billed by Apple or Google, and only you can cancel it. Deleting your Bookmark account doesn&apos;t stop it.
          </p>
          <p>
            • <strong>iPhone:</strong> Settings → your name → Subscriptions, or <a href="https://apps.apple.com/account/subscriptions" className="underline">apps.apple.com/account/subscriptions</a>.<br />
            • <strong>Android:</strong> the Play Store app → your profile → Payments and subscriptions, or <a href="https://play.google.com/store/account/subscriptions" className="underline">play.google.com/store/account/subscriptions</a>.
          </p>
          <p>Plus bought on the website is cancelled for you when you delete your account.</p>
        </Section>

        <Section title="In the app">
          <p>Open Bookmark and go to <strong>More → Settings → Delete account</strong>. Type your username to confirm, then choose <strong>Delete my account</strong>.</p>
        </Section>

        <Section title="On the website">
          <p>Sign in and go to <Link href="/settings#delete-account" className="underline">Settings → Delete account</Link>. Type your username to confirm, then choose <strong>Delete my account</strong>.</p>
        </Section>

        <Section title="If you can't sign in">
          {/* LEGAL REVIEW: check the promised reply time. */}
          <p>
            Email <Contact /> from the address on your account, and tell us your username if you remember it. So that nobody can delete someone else&apos;s account, we&apos;ll reply to that address to confirm before deleting anything. We delete it within 30 days of your confirmation, and tell you when it&apos;s done.
          </p>
          <p>If you no longer have that email address, say so, and we&apos;ll find another way to check the account is yours.</p>
        </Section>

        <Section title="What's deleted">
          <p>
            Deleting is immediate and can&apos;t be undone. It removes your profile, your avatar and banner, your books, ratings, reviews, notes, lists and reading goals, your followers and the people you follow, your achievements, your AI recaps, your imports, the phones you&apos;re signed in on and their push notification tokens, and your purchase records with RevenueCat. Every image you uploaded is deleted from our image host too. Copies of Open Library covers we stored for your books are deleted as well, unless another reader&apos;s book shows the same cover.
          </p>
        </Section>

        <Section title="What stays">
          <p>
            Comments you posted in reading circles stay, so the conversation still makes sense for the other members, but they&apos;re shown as a former member&apos;s, without your name or profile. Reading circles you host pass to the member who has been in them longest.
          </p>
          <p>
            If you&apos;d like a copy of your data first, download it from <Link href="/settings#data" className="underline">Settings → Your data</Link> (or More → Settings → Your data in the app) before you delete. Our <Link href="/privacy" className="underline">privacy policy</Link> has the rest.
          </p>
        </Section>
      </Container>
    </div>
  )
}

export default Page
