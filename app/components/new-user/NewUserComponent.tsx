"use client"
import React, { FC, useCallback, useEffect, useState } from 'react'
import { Input } from '../ui/input'
import { getCsrfToken, getProviders, signIn, useSession } from 'next-auth/react'
import { GetServerSidePropsContext, InferGetServerSidePropsType } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import Image from 'next/image'
import { Button } from '../ui/button'
import { useRouter } from 'next/navigation'
import { motion,AnimatePresence } from 'framer-motion'
import Heading from './Heading'
import { STEPS } from '@/utils/helpers'
interface NewUserComponentProps {
  body: React.ReactNode,
  step:number
  onSubmit:()=>void,
  handleBack:()=>void
  disabled?:boolean
}


const NewUserComponent:FC<NewUserComponentProps> =  ({body,step,disabled,onSubmit,handleBack}) => {
  
const router = useRouter();
const handleSubmit = useCallback(()=>{
  // console.log("HEYY");
 onSubmit();
},[onSubmit])

  return (
    <AnimatePresence>
    <motion.div
    // initial={{ opacity: 1,y:-50 }}
    // animate={{ opacity: 1,y:0 }}
    // transition={{ ease: "circIn" }}
    // exit={{ opacity: 1,y:-50 }} 
    className='p-6 bg-slate-100 rounded-lg'>
      {body}
      <div className="w-full flex items-center justify-between gap-6 mt-12">
    {step > STEPS.START && <Button disabled={disabled} onClick={handleBack} variant="outline" className="w-full border-slate-700 rounded-md py-2">Back</Button>}
      <Button onClick={handleSubmit} disabled={disabled} className="w-full bg-red-500 text-white rounded-md py-2">{step ===  STEPS.COLOUR ? "Finish":"Continue"}</Button>
      </div>
  </motion.div>
  </AnimatePresence>
  )
}

export default NewUserComponent
