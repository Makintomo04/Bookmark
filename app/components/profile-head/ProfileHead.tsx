"use client"
import getCurrentUser from '@/app/actions/getCurrentUser'
import { User } from '@prisma/client'
import { FC, useState } from 'react'
import Avatar from './Avatar'
import useSWR from 'swr'
import useUser from '@/app/hooks/useUser'
import Image from 'next/image'
import EditButton from './EditButton'
interface ProfileHeadProps {
 imgSrc:string,
  bannerSrc:string,
  color?:string
}

const ProfileHead: FC<ProfileHeadProps> =  ({imgSrc,bannerSrc, color}) => {
 const {user,isError,isLoading} = useUser()
//  const [colour,setColour] = useState<string>(user.favColour)
 console.log("@@@@",user.favColour);
  return (<div className='w-full relative'>
    <div className="h-48 overflow-hidden rounded-[25px] relative">
        <EditButton/>

      <div className="h-full w-full">
        {
          bannerSrc ? <Image src={bannerSrc} layout="fill" objectFit="cover" alt="banner" /> : <div style={{background:`${user.favColour}`}} className="w-full h-full"></div>
        }
        
      </div>
    <div style={{background:`${color}`}} className={`h-16 w-16 bg-[${color}]`}></div>

    </div>
    <div className="absolute -bottom-16 left-10">
    <Avatar src={imgSrc}/>
    </div>

    {/* <h1>M1keyFtw</h1> */}
  </div>)
}

export default ProfileHead