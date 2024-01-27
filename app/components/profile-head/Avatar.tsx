import useUser from '@/app/hooks/useUser';
import { FC, useState } from 'react'
import { Lightbox } from "react-modal-image";

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
        {user?.image ? <img src={user?.image} alt="avatar" className="w-full h-full object-cover  overflow-hidden "/>
        : <img src="/images/avatar.jpg" alt="avatar" className="w-full h-full object-cover  "/>}
        </div>
    </div>
    {showLightbox && <Lightbox
    className='cursor-pointer'
    small={user?.image}
    large={user?.image}
    alt="Display Photo"
    hideDownload={true}
   /** @ts-ignore */
    onClose={closeLightBox}
  />}
  </>
  )
}

export default Avatar