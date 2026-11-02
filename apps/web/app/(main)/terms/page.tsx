// LEGAL REVIEW NEEDED: this text was written from what the code does, not by a lawyer. Have it reviewed
// (and set SUPPORT_EMAIL) before launch.
import Container from '@/app/components/Container'
import { PLUS_PRICING } from '@/lib/entitlements'
import { supportEmail, supportEmailLabel } from '@/lib/support'
import { Metadata } from 'next'
import Link from 'next/link'
import { FC } from 'react'

export const metadata: Metadata = {
  title: "Terms of Service",
}

const LAST_UPDATED = "23 October 2026"

const Section: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="flex flex-col gap-2 mb-8">
    <h2 className="text-lg font-semibold">{title}</h2>
    <div className="text-sm text-neutral-600 dark:text-neutral-300/90 flex flex-col gap-3">{children}</div>
  </div>
)

const Contact: FC = () =>
  supportEmail ? <a href={`mailto:${supportEmail}`} className="underline">{supportEmail}</a> : <span>{supportEmailLabel}</span>

const Page: FC = () => {
  return (
    <div className="mt-12 mb-20">
      <Container className="max-w-2xl">
        <h1 className="page-title mb-2">Terms of Service</h1>
        <p className="text-xs text-muted-foreground mb-10">Last updated: {LAST_UPDATED}</p>

        <Section title="1. Acceptance of these terms">
          <p>By creating an account or using Bookmark, you agree to these Terms of Service. If you don&apos;t agree, please don&apos;t use the app.</p>
        </Section>

        <Section title="2. What Bookmark is">
          <p>Bookmark is a place to read with friends. You can log books, track your progress and reading goals, see your reading stats, and import your history from other reading apps.</p>
          <p>You can follow other readers, share a profile and lists, and write reviews. In reading circles, you read a book alongside friends and talk about it as you go, with comments that stay hidden until each member reaches the point they were written at.</p>
        </Section>

        <Section title="3. Your account">
          <p>You&apos;re responsible for keeping your login details secure and for anything that happens under your account. You must provide a valid email address, and you can&apos;t impersonate someone else or use a username that belongs to someone else.</p>
          <p>You can delete your account at any time from <Link href="/settings#delete-account" className="underline">Settings</Link>. This permanently removes your books, notes, reading goals, lists, and follow relationships, and cancels any Bookmark Plus subscription. Your reading circle comments stay, shown as a former member&apos;s without your name or profile, and circles you host pass to their longest-standing member.</p>
        </Section>

        <Section title="4. Your content">
          <p>You keep ownership of anything you add to Bookmark - reviews, notes, quotes, lists, circle comments, your bio, and any images you upload. By posting content, you give Bookmark permission to store it and show it to you and to the people your privacy settings and circle memberships allow, as part of running the service.</p>
          <p>Don&apos;t upload anything you don&apos;t have the rights to, or anything illegal, abusive, or infringing on someone else&apos;s rights.</p>
        </Section>

        <Section title="5. Profiles and privacy">
          <p>You choose who can see your profile (public, followers only, or private) and your reviews in <Link href="/settings#privacy" className="underline">Settings → Privacy</Link>. Our <Link href="/privacy" className="underline">Privacy Policy</Link> explains what each setting shows and how we handle your data.</p>
        </Section>

        <Section title="6. Bookmark Plus">
          <p>Bookmark Plus is an optional paid plan. The prices and what Plus includes are shown on the <Link href="/plus" className="underline">Plus page</Link> before you buy. Payments are handled by Stripe.</p>
          <p><strong>Subscriptions</strong> (monthly or yearly) renew automatically at the end of each period until you cancel. You can cancel any time from <Link href="/settings" className="underline">Settings</Link>, which opens Stripe&apos;s billing portal. When you cancel, Plus stays on until the end of the period you&apos;ve paid for, and you won&apos;t be charged again.</p>
          <p><strong>Free trial:</strong> each account can have one {PLUS_PRICING.trialDays}-day free trial. If you haven&apos;t added a payment method by the end of it, the trial ends and you&apos;re back on the free plan.</p>
          <p><strong>Refunds:</strong> we&apos;ll give refunds where the law requires it. If something&apos;s gone wrong with a payment, contact us at <Contact /> and we&apos;ll sort it out.</p>
          <p>Features marked &quot;coming soon&quot; aren&apos;t part of what you&apos;re paying for until they arrive. If we change what Plus costs, we&apos;ll tell you before your next renewal.</p>
        </Section>

        <Section title="7. Community rules">
          <p>Bookmark works because people can trust it not to spoil their books. When you use it:</p>
          <p>• Don&apos;t post spoilers ahead of where they belong. In a circle, place each comment at the point in the book it&apos;s about, and don&apos;t put later events in an earlier comment. Elsewhere, mark reviews that give things away as spoilers.<br/>
          • Don&apos;t harass, threaten, or abuse anyone, or post hateful or sexually explicit content.<br/>
          • Don&apos;t spam, scrape or bulk-collect other users&apos; data, try to break or abuse the service, or use it for anything illegal.</p>
          <p>You can report a circle comment or a list you think breaks these rules, and you can block someone so you no longer see each other. Our staff review reports.</p>
        </Section>

        <Section title="8. Moderation and termination">
          <p>We may remove content that breaks these terms, and suspend or remove accounts that do so repeatedly or seriously. You can stop using Bookmark and delete your account at any time.</p>
        </Section>

        <Section title="9. No warranty">
          <p>Bookmark is provided &quot;as is&quot;. We do our best to keep it running and your data safe, but we can&apos;t guarantee the service will always be available or error-free.</p>
        </Section>

        <Section title="10. Changes to these terms">
          <p>We may update these terms from time to time. If we make material changes, we&apos;ll do our best to let you know.</p>
        </Section>

        <Section title="11. Contact">
          <p>Questions about these terms, a payment, or something you&apos;ve seen on Bookmark? Email us at <Contact />.</p>
        </Section>
      </Container>
    </div>
  )
}

export default Page
