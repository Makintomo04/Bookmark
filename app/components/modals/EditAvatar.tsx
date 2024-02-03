import { FC } from 'react'
import Image from 'next/image'
interface EditAvatarProps {
  src:string
}

const EditAvatar: FC<EditAvatarProps> = ({src}) => {
  return (
    <div className="cursor-pointer w-20 h-20 rounded-[50px]  overflow-hidden">
      {/* Avatar */}
      <div className="w-full h-full relative overflow-hidden">
        {src ? <Image priority src={src} alt="avatar" layout="fill" objectFit="cover" className="w-full h-full object-cover overflow-hidden"/>
        : <Image priority src="/images/avatar.jpg" alt="avatar" layout="fill" objectFit="cover" className="w-full h-full object-cover"/>}
        </div>
    </div>
    )
}

export default EditAvatar