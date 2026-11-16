"use client"
import { FC, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

// "About Susanna Clarke" on a book page (BOO-92): photo, the bio's opening paragraph cut to a few lines, and the
// way to their author page, where the full bio, links and every book live. Client-side only for the photo's
// fallback: one Open Library hasn't got (a 404) drops to the initials, as on the author page.
const AuthorBrief: FC<{ name: string, href: string, photoUrl: string | null, bio: string | null, headingClassName: string, className: string }> = ({ name, href, photoUrl, bio, headingClassName, className }) => {
  const [photoFailed, setPhotoFailed] = useState(false)
  const photo = photoFailed ? null : photoUrl
  return (
    <section aria-labelledby="about-author-heading" className={`${className} flex flex-col gap-4`}>
      <h2 id="about-author-heading" className={headingClassName}>About {name}</h2>
      <div className="flex items-start gap-4">
        {photo ? (
          // unoptimized: a librarian's photo can be on any https host, which the optimiser wouldn't take.
          <Image src={photo} alt={`Photo of ${name}`} width={64} height={64} unoptimized onError={() => setPhotoFailed(true)} className="size-16 shrink-0 rounded-full object-cover bg-neutral-200 dark:bg-neutral-800" />
        ) : (
          <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-full bg-neutral-200 text-lg font-semibold text-muted-foreground dark:bg-neutral-800">{initials(name)}</span>
        )}
        <div className="flex min-w-0 flex-col gap-2">
          {bio && <p className="line-clamp-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">{bio}</p>}
          <Link href={href} className="inline-flex items-center gap-0.5 self-start text-sm font-medium text-brand-text underline-offset-2 hover:underline">
            {bio ? `More about ${name}` : `See ${name}'s books and bio`}<ChevronRight size={14} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  )
}

export default AuthorBrief
