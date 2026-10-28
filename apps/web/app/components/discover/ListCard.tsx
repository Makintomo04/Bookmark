import { FC } from 'react'
import { readerName } from '@/lib/profile'
import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { isOpenLibraryCover } from '@/utils/helpers'
import type { ListSummary } from '@/lib/lists'
import { Flag, Lock } from 'lucide-react'
import PickBadge from './PickBadge'
import StaffSeal from '../profile-head/StaffSeal'
import ChoiceBadge from './ChoiceBadge'
import { BookFallback } from '../cards/BookCover'

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`

// Up to four covers fanned out, so a list reads as a stack of books at a glance.
const CoverStack: FC<{ covers: ListSummary["items"] }> = ({ covers }) => (
  <div className="relative h-36 sm:h-40 rounded-xl bg-neutral-100 dark:bg-neutral-900 overflow-hidden">
    {covers.length === 0 ? (
      <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">No books yet</p>
    ) : covers.map((cover, i) => (
      <div
        key={i}
        className="absolute bottom-0 aspect-[2/3] h-[85%] overflow-hidden rounded-t-md shadow-md ring-1 ring-black/5 transition-transform group-hover:-translate-y-1"
        style={{ left: `${10 + i * 20}%`, zIndex: covers.length - i, transitionDelay: `${i * 30}ms` }}
      >
        {/* The book sits under the image, so a cover that's slow or fails to load still says something. */}
        <BookFallback title={cover.title} author={cover.author} variant="thumb" />
        {cover.coverUrl && <Image src={cover.coverUrl} alt="" fill sizes="96px" unoptimized={isOpenLibraryCover(cover.coverUrl)} className="object-cover" />}
      </div>
    ))}
  </div>
)

// hideOwner: on a profile, every list is the profile owner's, so the byline is noise.
const ListCard: FC<{ list: ListSummary, className?: string, hideOwner?: boolean }> = ({ list, className, hideOwner }) => (
  <Link href={`/lists/${list.id}`} className={cn("group flex flex-col gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4", className)}>
    <CoverStack covers={list.items} />
    <div className="min-w-0">
      <p className="font-semibold leading-snug line-clamp-2 group-hover:underline underline-offset-4">{list.title}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        {list.isPick ? <PickBadge /> : !hideOwner && (
          <>
            <span className="truncate">by {readerName(list.owner)}</span>
            {/* The card is a link, so the seal only marks the role. */}
            {list.owner.staffBadge && <StaffSeal kind={list.owner.staffBadge} size={16} pressable={false} className="-ml-0.5" />}
          </>
        )}
        {(list.isPick || !hideOwner) && <span aria-hidden>·</span>}
        {list.chosenAt && !list.isPick && <><ChoiceBadge /><span aria-hidden>·</span></>}
        <span className="whitespace-nowrap">{plural(list.itemCount, "book")}</span>
        {list.visibility === "PRIVATE" && <span className="inline-flex items-center gap-1 whitespace-nowrap"><Lock size={12} aria-hidden />Private</span>}
        {list.reportCount > 0 && <span className="inline-flex items-center gap-1 whitespace-nowrap text-danger"><Flag size={12} aria-hidden />{plural(list.reportCount, "report")}</span>}
      </p>
    </div>
  </Link>
)

export default ListCard
