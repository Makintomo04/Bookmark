import Container from '@/app/components/Container'
import { Metadata } from 'next'
import { FC } from 'react'

export const metadata: Metadata = {
  title: "Terms of Service",
}

const Section: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="flex flex-col gap-2 mb-8">
    <h2 className="text-xl font-bold">{title}</h2>
    <div className="text-sm text-neutral-600 dark:text-neutral-300/90 flex flex-col gap-3">{children}</div>
  </div>
)

const Page: FC = () => {
  return (
    <div className="mt-12 mb-20">
      <Container className="max-w-2xl">
        <h1 className="page-title mb-2">Terms of Service</h1>
        <p className="text-xs text-muted-foreground mb-10">Last updated: {new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <Section title="1. Acceptance of these terms">
          <p>By creating an account or using Bookmark, you agree to these Terms of Service. If you don&apos;t agree, please don&apos;t use the app.</p>
        </Section>

        <Section title="2. What Bookmark is">
          <p>Bookmark is a personal reading tracker. You can log books, track your progress and reading goals, and optionally follow other users and share a public profile of the books you&apos;re reading or have completed.</p>
        </Section>

        <Section title="3. Your account">
          <p>You&apos;re responsible for keeping your login details secure and for anything that happens under your account. You must provide a valid email address, and you can&apos;t impersonate someone else or use a username that belongs to someone else.</p>
          <p>You can delete your account at any time from your profile settings. This permanently removes your books, notes, reading goals, and follow relationships.</p>
        </Section>

        <Section title="4. Your content">
          <p>You keep ownership of anything you add to Bookmark - book notes, quotes, your bio, and any images you upload. By posting content, you give Bookmark permission to store and display it back to you (and, for anything on a public profile, to other users) as part of running the service.</p>
          <p>Don&apos;t upload anything you don&apos;t have the rights to, or anything illegal, abusive, or infringing on someone else&apos;s rights.</p>
        </Section>

        <Section title="5. Public profiles">
          <p>If your profile is public, your username, bio, avatar, and the books marked as currently reading or completed are visible to anyone, including people who aren&apos;t signed in. Books you haven&apos;t started are never shown on your public profile.</p>
        </Section>

        <Section title="6. Acceptable use">
          <p>Don&apos;t use Bookmark to harass anyone, scrape or bulk-collect other users&apos; data, try to break or abuse the service, or use it for anything illegal.</p>
        </Section>

        <Section title="7. Termination">
          <p>We may suspend or remove an account that violates these terms. You can stop using Bookmark and delete your account at any time.</p>
        </Section>

        <Section title="8. No warranty">
          <p>Bookmark is provided &quot;as is&quot;. We do our best to keep it running and your data safe, but we can&apos;t guarantee the service will always be available or error-free.</p>
        </Section>

        <Section title="9. Changes to these terms">
          <p>We may update these terms from time to time. If we make material changes, we&apos;ll do our best to let you know.</p>
        </Section>

        <Section title="10. Contact">
          <p>Questions about these terms? [Add a contact email here before launch.]</p>
        </Section>
      </Container>
    </div>
  )
}

export default Page
