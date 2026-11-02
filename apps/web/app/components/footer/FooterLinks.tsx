"use client"
import { FC } from 'react'
import Link from 'next/link'
import useUser from '@/app/hooks/useUser'

// Columns of the places worth finding from anywhere. Legal and contact links sit in the row below.
// Stats and Reading circles are a reader's own; signed out they only lead to sign-in (Stats) or an empty page
// (circles are invite-only), so like the header they show once we know a member is here.
const COLUMNS = [
  {
    title: 'Discover',
    links: [
      { href: '/discover', label: 'Discover books' },
      { href: '/discover/upcoming', label: 'Upcoming releases' },
      { href: '/stats', label: 'Reading stats', member: true },
      { href: '/import', label: 'Import books' },
    ],
  },
  {
    title: 'Community',
    links: [
      { href: '/circles', label: 'Reading circles', member: true },
      { href: '/lists', label: 'Lists from readers' },
    ],
  },
  {
    title: 'About',
    links: [
      { href: '/about', label: 'About Bookmark' },
      { href: '/plus', label: 'Bookmark Plus' },
    ],
  },
]

const FooterLinks: FC = () => {
  const { user } = useUser()
  const member = !!user?.id
  return (
    <nav aria-label="Footer" className="mt-10 grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-10">
      {COLUMNS.map(column => (
        <div key={column.title}>
          <h2 className="text-base font-medium text-muted-foreground">{column.title}</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {column.links.filter(link => member || !link.member).map(link => (
              <li key={link.href}>
                <Link href={link.href} className="text-sm font-medium hover:text-brand-text transition">{link.label}</Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export default FooterLinks
