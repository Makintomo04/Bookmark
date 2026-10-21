import Container from '@/app/components/Container'
import { Metadata } from 'next'
import { FC } from 'react'

export const metadata: Metadata = {
  title: "Privacy Policy",
}

const Section: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="flex flex-col gap-2 mb-8">
    <h2 className="text-xl font-bold">{title}</h2>
    <div className="text-sm text-slate-600 dark:text-gray-300/90 flex flex-col gap-3">{children}</div>
  </div>
)

const Page: FC = () => {
  return (
    <div className="mt-12 mb-20">
      <Container className="max-w-2xl">
        <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-xs text-muted-foreground mb-10">Last updated: {new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <Section title="What we collect">
          <p><strong>Account info:</strong> your email address and a hashed (never plaintext) password, or basic profile details from Google/GitHub if you sign in that way.</p>
          <p><strong>Profile info:</strong> the username, bio, favourite colour, and any avatar or banner image you choose to add.</p>
          <p><strong>Reading data:</strong> the books, authors, page counts, progress, notes, quotes, reading goals, and follow relationships you create while using Bookmark.</p>
          <p><strong>Usage data:</strong> basic, anonymised analytics about how the app is used, via Vercel Analytics - this doesn&apos;t include anything you type into the app.</p>
        </Section>

        <Section title="How we use it">
          <p>To run the app: show you your books, calculate your reading stats and goal progress, and show public profiles to people who follow you or visit your profile link.</p>
          <p>To keep your account secure (password hashing, session management) and to send you account-related emails, like a password reset link if you request one.</p>
          <p>We don&apos;t sell your data, and we don&apos;t use it for advertising.</p>
        </Section>

        <Section title="Who we share it with">
          <p>We use a small number of third-party services to run Bookmark:</p>
          <p>• <strong>MongoDB Atlas</strong> to store your data.<br/>
          • <strong>UploadThing</strong> to host images you upload (avatar, banner, book covers).<br/>
          • <strong>Vercel</strong> to host the app and for basic analytics.<br/>
          • <strong>Open Library</strong> to power book search/autofill when you add a book - your search text is sent to their public API.<br/>
          • Google and/or GitHub, only if you choose to sign in with them.</p>
          <p>None of these services get access to your password.</p>
        </Section>

        <Section title="Public profiles">
          <p>If your profile is public (the default), your username, bio, avatar, and the books you&apos;ve marked as reading or completed are visible to anyone with the link, including people without a Bookmark account. Books you haven&apos;t started, your email, and your password are never shown publicly.</p>
          <p>Your yearly Wrapped (a summary of the books you finished that year, your top genre, favourite book, medals and goal result) is public whenever your profile is. Your full reading stats page is only visible to you.</p>
        </Section>

        <Section title="Cookies">
          <p>We use a session cookie to keep you signed in. That&apos;s it - no third-party advertising or tracking cookies.</p>
        </Section>

        <Section title="Your rights">
          <p>You can view and edit most of your data directly in the app. You can permanently delete your account and all associated data at any time from your profile settings - this removes your books, notes, reading goals, and follow relationships immediately.</p>
          <p>If you have questions about your data that aren&apos;t covered here, [add a contact email here before launch].</p>
        </Section>

        <Section title="Taking your data with you">
          <p>Your data is yours: take it anywhere, anytime. From <strong>Edit profile</strong> you can download everything in your account whenever you like, with no waiting and no request to us.</p>
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
