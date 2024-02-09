import useUser from '@/app/hooks/useUser';
import { FC, useState } from 'react'
import { Lightbox } from "react-modal-image";
import Image from 'next/image'

interface AvatarProps {
  src: string
}

const Avatar: FC<AvatarProps> = ({src}) => {
  const {user, isLoading, isError, mutate} = useUser()
  const [showLightbox, setShowLightbox] = useState(false)
  const closeLightBox = () => setShowLightbox(false)
  return (
    <>
    <div onClick={()=>setShowLightbox(true)} className="cursor-pointer w-32 h-32 rounded-[50px] border-[5px] border-white dark:border-background  overflow-hidden">
      {/* Avatar */}
      <div className="w-full h-full relative overflow-hidden">
        {user?.image ? <Image sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw" priority src={user?.image} alt="avatar" layout="fill" objectFit="cover" className="w-full h-full object-cover  overflow-hidden "/>
        : <Image sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw" priority src="/images/avatar.jpg" alt="avatar" layout="fill" objectFit="cover" className="w-full h-full object-cover"/>}
        </div>
    </div>
    {showLightbox && <Lightbox
    className='cursor-pointer'
    small={user?.image || "/images/avatar.jpg"}
    large={user?.image || "/images/avatar.jpg"}
    alt="Display Photo"
    hideDownload={true}
   /** @ts-ignore */
    onClose={closeLightBox}
  />}
  </>
  )
}

export default Avatar