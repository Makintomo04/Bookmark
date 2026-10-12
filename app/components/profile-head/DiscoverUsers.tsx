"use client"
import { FC, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import axios from 'axios'
import { toast } from 'react-toastify'
import { Input } from '../ui/input'
import { useForm, FieldValues } from 'react-hook-form'

interface SearchUser {
  username: string
  image: string | null
  favColour: string | null
  bio: string | null
  isFollowing: boolean
}

const DiscoverUsers: FC = () => {
  const { register, watch, formState: { errors } } = useForm<FieldValues>({ defaultValues: { q: "" } })
  const query = watch("q")
  const [results, setResults] = useState<SearchUser[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [followState, setFollowState] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([])
      return
    }
    const timeout = setTimeout(() => {
      setIsSearching(true)
      axios.get(`/api/users/search?q=${encodeURIComponent(query)}`)
        .then((res) => {
          setResults(res.data)
          setFollowState((state) => {
            const next = { ...state }
            res.data.forEach((u: SearchUser) => {
              if (!(u.username in next)) next[u.username] = u.isFollowing
            })
            return next
          })
        })
        .catch(() => {})
        .finally(() => setIsSearching(false))
    }, 400)
    return () => clearTimeout(timeout)
  }, [query])

  const handleFollow = (username: string) => {
    axios.post(`/api/users/${encodeURIComponent(username)}/follow`)
      .then((res) => {
        setFollowState((state) => ({ ...state, [username]: res.data.isFollowing }))
        toast.success(res.data.isFollowing ? `Following ${username}!` : `Unfollowed ${username}.`, { position: "bottom-center" })
      })
      .catch(() => toast.error("Something went wrong.", { position: "bottom-center" }))
  }

  return (
    <div className="flex flex-col gap-4">
      <Input register={register} errors={errors} name="q" id="q" placeholder="Search by username" autoComplete="off" className="max-w-sm" />
      {isSearching && <p className="text-sm text-muted-foreground">Searching...</p>}
      <div className="flex flex-col gap-3">
        {results.map((result) => (
          <div key={result.username} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-neutral-700">
            <Link href={`/u/${result.username}`} className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 flex-shrink-0 rounded-full overflow-hidden relative" style={{ background: result.favColour || "#f44336" }}>
                {result.image && <Image src={result.image} alt="" fill className="object-cover" />}
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium">{result.username}</p>
                {result.bio && <p className="truncate text-xs text-muted-foreground">{result.bio}</p>}
              </div>
            </Link>
            <button type="button" onClick={() => handleFollow(result.username)} className="text-sm font-semibold text-[#F13C3C] hover:underline flex-shrink-0">
              {(followState[result.username] ?? result.isFollowing) ? "Following" : "Follow"}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default DiscoverUsers
