"use client"
import { FC } from 'react'
import { readerName } from '@/lib/profile'
import Link from 'next/link'
import useSWR from 'swr'
import { Users } from 'lucide-react'
import { fetcher, swrOptions } from '@/lib/fetcher'
import type { DiscoverBook } from '@/lib/openLibrary'
import type { Curator } from '@/lib/listRules'
import useUser from '@/app/hooks/useUser'
import useBookDetailsModal from '@/app/hooks/useBookDetailsModal'
import CuratorNote, { CuratorAvatar } from './CuratorNote'

interface Pick {
  person: Curator
  reason: string | null
  rating: number | null
  list: { id: string, title: string } | null
}

interface PeoplePicks {
  signedIn: boolean
  followsAnyone: boolean
  picks: Pick[]
}

const AVATARS_SHOWN = 5
const REASONS_SHOWN = 2
const NAMES_SHOWN = 2


// Where the words come from: the list links through, closing the details on the way.
const labelFor = (pick: Pick, onNavigate: () => void) =>
  pick.list
    ? <>on their list <Link href={`/lists/${pick.list.id}`} onClick={onNavigate} className="font-medium text-foreground hover:underline underline-offset-2">{pick.list.title}</Link></>
    : pick.rating ? `rated it ${String(pick.rating)}★` : "picked it"

// Book details: the people this reader follows who put the book on a public list or rated it 4+,
// in their own words. A person, never a score, is the reason to read it.
const PickedByFollowing: FC<{ book: DiscoverBook }> = ({ book }) => {
  const { user } = useUser()
  const closeDetails = useBookDetailsModal((s) => s.onClose)
  const params = new URLSearchParams({ title: book.title, author: book.author })
  if (book.workKey) params.set("workKey", book.workKey)
  const { data } = useSWR<PeoplePicks>(user?.id ? `/api/lists/people-picks?${params}` : null, fetcher, swrOptions)

  if (!data?.signedIn) return null

  if (!data.followsAnyone) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Users size={16} aria-hidden className="mt-0.5 shrink-0" />
        <span>
          Follow readers whose taste you trust and you&apos;ll see what they think of books like this.{" "}
          <Link href="/discover?find=people" onClick={closeDetails} className="font-medium text-foreground underline underline-offset-4">Find people</Link>
        </span>
      </p>
    )
  }
  if (data.picks.length === 0) return null

  const { picks } = data
  const withReasons = picks.filter((p) => p.reason).slice(0, REASONS_SHOWN)
  const named = picks.slice(0, NAMES_SHOWN).map((p) => p.person).filter((p) => p.username)
  const others = picks.length - named.length

  return (
    <section aria-labelledby="picked-by-heading" className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="flex -space-x-1.5">
          {picks.slice(0, AVATARS_SHOWN).map((pick, i) => (
            <CuratorAvatar key={pick.person.username ?? i} person={pick.person} size={28} className="ring-2 ring-background" />
          ))}
        </div>
        <p id="picked-by-heading" className="min-w-0 text-sm">
          <span className="text-muted-foreground">Picked by </span>
          {named.map((person, i) => (
            <span key={person.username}>
              {i > 0 && (i === named.length - 1 && others === 0 ? " and " : ", ")}
              <Link href={`/u/${person.username}`} className="font-medium hover:underline underline-offset-2">{readerName(person)}</Link>
            </span>
          ))}
          {others > 0 && <span className="text-muted-foreground"> and {others} {others === 1 ? "other" : "others"} you follow</span>}
          {others === 0 && <span className="text-muted-foreground">, who you follow</span>}
        </p>
      </div>
      {withReasons.map((pick, i) => (
        <CuratorNote key={pick.person.username ?? i} variant="full" reason={{ text: pick.reason!, by: pick.person }} label={labelFor(pick, closeDetails)} />
      ))}
    </section>
  )
}

export default PickedByFollowing
