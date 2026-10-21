"use client"
import { FC, useState } from 'react'
import { IoIosStar, IoIosStarOutline } from "react-icons/io"

interface StarRatingProps {
  value?: number
  onChange: (value: number) => void
  disabled?: boolean
}

const StarRating: FC<StarRatingProps> = ({ value, onChange, disabled }) => {
  const [hovered, setHovered] = useState<number | null>(null)
  const display = hovered ?? value ?? 0

  return (
    <div className="flex gap-1" onMouseLeave={() => setHovered(null)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <div
          key={n}
          className={disabled ? "" : "cursor-pointer"}
          onMouseEnter={() => !disabled && setHovered(n)}
          onClick={() => !disabled && onChange(n)}
        >
          {display >= n ? <IoIosStar size={28} color="#f44336" /> : <IoIosStarOutline size={28} color="#f44336" />}
        </div>
      ))}
    </div>
  )
}

export default StarRating
