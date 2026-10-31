import { FC } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { primaryButtonClass } from './ProfileHeader'

// Names up to this long fit the button; longer ones read "Join to follow" (the accessible name keeps it all).
const NAME_IN_BUTTON_MAX = 20

// How a signed-out visitor joins from someone's profile (BOO-53, after the persona panel and design review):
// in the profile, where Follow sits for members, rather than a banner above it. It's the page's one red
// action, and it names the reader, since they're why the visitor came. Sign-up comes back here with
// ?joined=1 (WelcomeBack), where they choose to follow: joining and following stay separate steps.
const JoinToFollow: FC<{ username: string; name: string }> = ({ username, name }) => {
  const back = encodeURIComponent(`/u/${encodeURIComponent(username)}?joined=1`)
  return (
    <div className="mt-5 flex flex-col items-start gap-2">
      <Link
        href={`/register?callbackUrl=${back}`}
        aria-label={`Join to follow ${name}`}
        aria-describedby="join-to-follow-hint"
        className={cn(primaryButtonClass, "bg-brand-fill text-white hover:bg-brand-fill-hover hover:opacity-100")}
      >
        {name.length <= NAME_IN_BUTTON_MAX ? `Join to follow ${name}` : 'Join to follow'}
      </Link>
      <p id="join-to-follow-hint" className="text-sm text-muted-foreground">Free. Track your books and see what {name} reads.</p>
    </div>
  )
}

export default JoinToFollow
