"use client"
import getCurrentUser from '@/app/actions/getCurrentUser'
import { User } from '@prisma/client'
import { FC, useState } from 'react'
import Avatar from './Avatar'
import useSWR from 'swr'
import useUser from '@/app/hooks/useUser'
import Image from 'next/image'
import EditButton from './EditButton'
import ProfileHeadDetails from './ProfileHeadDetails'
import Loader from '../Loader'
import { Skeleton } from '../ui/skeleton'
import Container from '../Container'
import useEditProfileModal from '@/app/hooks/useEditProfileModal'
interface ProfileHeadProps {
//  imgSrc:string,
//   bannerSrc:string,
//   color?:string
}

const ProfileHead: FC<ProfileHeadProps> =  ({}) => {
 const {user,isError,isLoading} = useUser()
 const editProfileModal = useEditProfileModal()
 if (isLoading) {
  return (
    <div className="w-full relative mb-20">

      <Skeleton className="h-48 w-full rounded-[25px] relative"/>
      <div className="flex items-center space-x-4 relative h-full w-full">
        <Skeleton  className="animate-none w-32 h-32 rounded-[50px] border-background border-5 absolute -bottom-16 left-10"/>
        </div>
        <div className='mt-20 px-10 flex flex-col gap-2'>
          <div className="flex justify-between items-end">
          <div className="flex flex-col gap-3">
          <Skeleton className="w-48 h-9"/>
          <Skeleton className="w-80 h-8"/>
          </div>
          <Skeleton className="w-96 h-16"/>
          </div>
          <Skeleton className="w-40 h-6 mt-2"/>
        </div>
    </div>
  );
}

if (isError) {
  return <p>Error fetching user data!</p>;
}
  return (
  <>
  <div className='w-full relative'>
    <div className="h-48 overflow-hidden rounded-[25px] relative">
        <EditButton handleClick={editProfileModal.onOpen} className='absolute bottom-3 right-3'/>

      <div className="h-full w-full">
        {
          user?.banner ? <Image priority src={user?.banner} layout="fill" className='relative' objectFit="cover" alt="banner" /> : <div style={{background:`${user?.favColour}`}} className="w-full h-full"></div>
        }
        
      </div>
    {/* <div style={{background:`${user?.favColour}`}} className={`h-16 w-16 bg-[${user?.favColour}]`}></div> */}

    </div>
    <div className="absolute -bottom-16 left-10">
    <Avatar src={user?.image}/>
    </div>
  </div>
  <ProfileHeadDetails/>
  </>
  )
}

export default ProfileHead