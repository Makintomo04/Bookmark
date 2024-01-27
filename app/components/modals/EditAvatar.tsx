import { FC } from 'react'

interface EditAvatarProps {
  src:string
}

const EditAvatar: FC<EditAvatarProps> = ({src}) => {
  return (
    <div className="cursor-pointer w-20 h-20 rounded-[50px]  overflow-hidden">
      {/* Avatar */}
      <div className="w-full h-full relative overflow-hidden">
        {src ? <img src={src} alt="avatar" className="w-full h-full object-cover  overflow-hidden "/>
        : <img src="/images/avatar.jpg" alt="avatar" className="w-full h-full object-cover  "/>}
        </div>
    </div>
    )
}

export default EditAvatar