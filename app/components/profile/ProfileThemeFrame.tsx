import { FC, ReactNode } from 'react'
import type { ProfileTheme } from '@prisma/client'
import { profileThemeFrame } from '@/lib/personalisation'

// Dresses a profile page in its owner's theme (lib/personalisation.ts). Classic renders the children bare.
const ProfileThemeFrame: FC<{ theme: ProfileTheme; accent: string | null; children: ReactNode }> = ({ theme, accent, children }) => {
  const frame = profileThemeFrame(theme, accent)
  if (!frame) return <>{children}</>
  return (
    <div data-profile-theme={theme} className={frame.className} style={frame.style}>
      {children}
    </div>
  )
}

export default ProfileThemeFrame
