"use client"
import { FC } from 'react'
import { askToJoin } from '@/app/hooks/useJoinPrompt'
import { primaryButtonClass } from './ProfileHeader'

// Follow, for a signed-out visitor (BOO-53): the same button in the same place members see, so the profile
// looks the same either way. Following is members-only, so pressing it asks them to join, naming the reader
// (JoinPromptModal). Sign-up comes back with ?joined=1 (WelcomeBack), where they choose to follow: joining
// and following stay separate steps.
const JoinToFollow: FC<{ username: string; name: string }> = ({ username, name }) => (
  <button
    type="button"
    onClick={() => askToJoin(`Join to follow ${name}`, `/u/${encodeURIComponent(username)}?joined=1`)}
    className={primaryButtonClass}
  >
    Follow
  </button>
)

export default JoinToFollow
