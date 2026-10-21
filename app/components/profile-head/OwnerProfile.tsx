"use client"
import { FC } from 'react'
import { SWRConfig } from 'swr'
import ProfileHead from './ProfileHead'
import BookList from '../books/BookList'
import ProfileLists from '../discover/ProfileLists'

interface OwnerProfileProps {
  username: string
  // SWR keys the server already has answers for, so the header renders on the first paint
  // instead of behind a loader. Everything still revalidates on mount.
  fallback: Record<string, unknown>
}

// Your own profile: editable, so it stays client-side, but starts from server data.
const OwnerProfile: FC<OwnerProfileProps> = ({ username, fallback }) => (
  <SWRConfig value={{ fallback }}>
    <ProfileHead />
    <div className="mt-12 px-4 sm:px-8">
      <BookList />
      <ProfileLists username={username} isSelf />
    </div>
  </SWRConfig>
)

export default OwnerProfile
