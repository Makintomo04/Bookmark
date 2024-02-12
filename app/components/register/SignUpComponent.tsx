"use client"
import { FC, useState } from 'react'
import { Input } from '../ui/input'
import { getCsrfToken, getProviders, signIn } from 'next-auth/react'
import { GetServerSidePropsContext, InferGetServerSidePropsType } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import Image from 'next/image'
import { Button } from '../ui/button'
import SignInWithOAuthButton from '../signIn/SignInWithOAuthButton'
import { useRouter } from 'next/navigation'
import { motion,AnimatePresence  } from 'framer-motion'
import { FieldValues, SubmitHandler, useForm } from 'react-hook-form'
import axios from 'axios'
import { toast } from 'react-toastify'
interface SignUpComponentProps {
  
}

const SignUpComponent =  () => {
const router = useRouter()
const [isLoading, setIsLoading] = useState(false);
const { 
  register,
  handleSubmit,
  setValue,
  watch,
  getValues,
  formState:{errors},
  reset} = useForm<FieldValues>({
  defaultValues: {
    email: "",
    password:"",
    repeatPassword:"",
  },
})

const onSubmit:SubmitHandler<FieldValues> = async (data) => {
  console.log(data);
  if(data.password !== data.repeatPassword){
    alert("Passwords do not match.")
    return
  }
  try {
    setIsLoading(true)
console.log("666666666666666666",data.email,data.password);
    await axios.post("/api/register", data)
    toast.success("Account created.",{ position: "bottom-center" })
    signIn("credentials",
    { email:data.email,password:data.password,callbackUrl: `${window.location.origin}/new-user` }
  )
    
  } catch (error) {
    toast.error("Something went wrong.")
    console.log(error);
  } 
  finally{
    setIsLoading(false)
  }
}
let initial = {};
let animate = {};
let transition = {};
let exit = {};

const isMobile = window.innerWidth < 640; //Add the width you want to check for here (now 768px)
if (!isMobile) {

    initial={ opacity: 1,y:50 },
    animate={ opacity: 1,y:0 },
    transition={ ease: "circIn" },
    exit={ opacity: 1,y:50 }
  
} 
  return (
    <AnimatePresence>
    <motion.div
    {...{initial,animate,transition,exit}}
    className='w-screen h-dvh sm:w-[500px] sm:h-auto rounded-none p-10 sm:p-6 bg-slate-100 dark:bg-background sm:rounded-lg'>
      <div className="flex justify-center items-center gap-3 cursor-pointer mb-6">
      <Image src='/logo.svg' width={40} height={40} alt='logo'/>
      {/* <h1 className="font-bold text-2xl">Bookmark</h1> */}
      </div>
    <div className="w-full">
    <h1 className="text-2xl font-bold mb-10 text-center">Create Account</h1>
    {/* <p className="text-gray-500">Sign in to your account</p> */}
  </div>
  <div className="">
  {/* {providers &&
              Object.values(providers).map(provider => (
                <div key={provider.name} style={{ marginBottom: 0 }}> */}
                  {/* <button onClick={() => signIn()} >
                    Sign in with
                  </button> */}
                {/* </div>
              ))} */}
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <p>{}</p>
      <div className="flex flex-col gap-2">
        <label htmlFor="email">Email</label>
        <Input register={register} required inputValidation={{required:true,message:"Email Required"}} errors={errors} type="email" name="email" id="email" className=""/>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="password">Password</label>
        <Input register={register} required inputValidation={{required:true,message:"Password Required"}} errors={errors} type="password" name="password" id="password" className="w-full"/>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="repeatPassword">Repeat Password</label>
        <Input register={register} required inputValidation={{required:true,message:"Password Confirmation Required"}} errors={errors} type="password" name="repeatPassword" id="repeatPassword" className="w-full"/>
      </div>
      <Button className="bg-red-500 text-white rounded-md py-2">Sign up</Button>
    </form>
    <div className="flex gap-3 items-center justify-center my-6">
      <hr className='border-1 border-slate-400/50 w-full'/>
      <span className='text-sm font-semibold text-slate-400'>OR</span>
      <hr className='border-1 border-slate-400/50 w-full'/>
    </div>
    <div className="mt-3 flex gap-2 w-full">
              <SignInWithOAuthButton provider="Google"/>
              <SignInWithOAuthButton provider="Github"/>
    </div>
    <p className='text-sm mt-4'>Already have an account? <span onClick={()=>router.push("/signin")} className='text-[#F13C3C] font-semibold cursor-pointer hover:underline hover:underline-offset-2 transition'>Sign in</span></p>
  </div>
  </motion.div>
  </AnimatePresence>
  )
}

export default SignUpComponent
