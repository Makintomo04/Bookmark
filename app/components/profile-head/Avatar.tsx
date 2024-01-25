import { FC, useState } from 'react'
import { Lightbox } from "react-modal-image";

interface AvatarProps {
  src: string
}

const Avatar: FC<AvatarProps> = ({src}) => {
  const [showLightbox, setShowLightbox] = useState(false)
  const closeLightBox = () => setShowLightbox(false)
  return (
    <>
    <div onClick={()=>setShowLightbox(true)} className="cursor-pointer w-32 h-32 rounded-[50px] border-[5px] border-white  overflow-hidden">
      {/* Avatar */}
      <div className="w-full h-full relative overflow-hidden">
        {src ? <img src={src} alt="avatar" className="w-full h-full object-cover  overflow-hidden "/>
        : <img src="/images/avatar.jpg" alt="avatar" className="w-full h-full object-cover  "/>}
        </div>
    </div>
    {showLightbox && <Lightbox
    className='cursor-pointer'
    small={src}
    large={src}
    alt="Display Photo"
    hideDownload={true}
   /** @ts-ignore */
    onClose={closeLightBox}
  />}
  </>
  )
}

export default Avatar