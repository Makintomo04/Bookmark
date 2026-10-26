import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Container from '@/app/components/Container'
import getCurrentUser from '@/app/actions/getCurrentUser'
import ProfileShortcut from '@/app/components/settings/ProfileShortcut'
import AppearanceSettings from '@/app/components/settings/AppearanceSettings'
import PlusSettings from '@/app/components/settings/PlusSettings'
import PrivacySettings from '@/app/components/settings/PrivacySettings'
import DataExport from '@/app/components/settings/DataExport'
import DeleteAccount from '@/app/components/settings/DeleteAccount'

export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false },
}

// Account settings. Every control here saves as soon as it changes; the profile itself is edited in
// the Edit profile modal, which saves as one form. Each section has an id so other pages can link to it.
const Page = async () => {
  const user = await getCurrentUser()
  if (!user) redirect('/signin?callbackUrl=/settings')

  return (
    <div className="mt-8 sm:mt-12">
      <Container>
        <div className="mx-auto max-w-2xl">
          <h1 className="page-title">Settings</h1>
          <p className="mt-2 text-muted-foreground">Changes here save as soon as you make them.</p>
          <div className="mt-8 flex flex-col gap-6">
            <ProfileShortcut />
            <section id="appearance" className="scroll-mt-6"><AppearanceSettings /></section>
            <section id="plus" className="scroll-mt-6"><PlusSettings /></section>
            <section id="privacy" className="scroll-mt-6 flex flex-col gap-6"><PrivacySettings /></section>
            <section id="data" className="scroll-mt-6"><DataExport /></section>
            <section id="delete-account" className="scroll-mt-6 mt-6"><DeleteAccount /></section>
          </div>
        </div>
      </Container>
    </div>
  )
}

export default Page
