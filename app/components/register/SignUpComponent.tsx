"use client"
import { FC, useEffect, useState } from 'react'
import { Input } from '../ui/input'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '../ui/button'
import SignInWithOAuthButton from '../signIn/SignInWithOAuthButton'
import { useRouter } from 'next/navigation'
import { motion,AnimatePresence  } from 'framer-motion'
import { FieldValues, SubmitHandler, useForm } from 'react-hook-form'
import axios from 'axios'
import { PASSWORD_MIN } from '@/lib/authSchemas'
import { toast } from 'react-toastify'
import CheckInboxNotice from '../signIn/CheckInboxNotice'
import { safeCallbackPath, withCallback } from '@/lib/callbackUrl'
interface SignUpComponentProps {
  
}

const SignUpComponent =  () => {
const router = useRouter()
const [isLoading, setIsLoading] = useState(false);
// Set once the account exists; it can't sign in until the emailed link is opened.
const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
// Where they were headed (e.g. an invite); kept through the verification email and sign-in.
const [callbackPath, setCallbackPath] = useState<string | null>(null);
useEffect(() => {
  setCallbackPath(safeCallbackPath(new URLSearchParams(window.location.search).get("callbackUrl"), window.location.origin))
}, [])
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
  if(data.password !== data.repeatPassword){
    alert("Passwords do not match.")
    return
  }
  if(data.password.length < PASSWORD_MIN){
    toast.error(`Password must be at least ${PASSWORD_MIN} characters.`,{ position: "bottom-center" })
    return
  }
  try {
    setIsLoading(true)
    await axios.post("/api/register", { email: data.email, password: data.password, callbackUrl: callbackPath })
    setRegisteredEmail(data.email)

  } catch (error) {
    toast.error(axios.isAxiosError(error) && error.response?.data?.error || "Something went wrong.")
  }
  finally{
    setIsLoading(false)
  }
}
let initial = {};
let animate = {};
let transition = {};
let exit = {};

if (typeof window !== "undefined") {
const isMobile = window.innerWidth < 640; 
if (!isMobile) {

    initial={ opacity: 1,y:50 },
    animate={ opacity: 1,y:0 },
    transition={ ease: "circIn" },
    exit={ opacity: 1,y:50 }
  
} 
} 

  return (
    <AnimatePresence>
    <motion.div
    {...{initial,animate,transition,exit}}
    className='w-screen h-screen sm:w-[500px] sm:h-auto rounded-none p-10 sm:p-6 bg-slate-100 dark:bg-background sm:rounded-lg'>
      <div className="flex justify-center items-center gap-3 cursor-pointer mb-6">
      <Image src='/logo.svg' width={40} height={40} alt='logo'/>
      {/* <h1 className="font-bold text-2xl">Bookmark</h1> */}
      </div>
    <div className="w-full">
    <h1 className="text-2xl font-bold mb-10 text-center">Create Account</h1>
    {/* <p className="text-gray-500">Sign in to your account</p> */}
  </div>
  {registeredEmail ? (
  <div className="">
    <CheckInboxNotice email={registeredEmail} title="Account created. Check your inbox"/>
    <p className='text-sm mt-4'>Confirmed your email? <Link href={withCallback(`/signin?email=${encodeURIComponent(registeredEmail)}`, callbackPath)} className='text-[#F13C3C] font-semibold cursor-pointer hover:underline hover:underline-offset-2 transition'>Sign in</Link></p>
  </div>
  ) : (
  <div className="">
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
      <Button disabled={isLoading} className="bg-red-500 text-white rounded-md py-2">{isLoading ? "Creating account…" : "Sign up"}</Button>
    </form>
    <div className="flex gap-3 items-center justify-center my-6">
      <hr className='border-1 border-slate-400/50 w-full'/>
      <span className='text-sm font-semibold text-slate-400'>OR</span>
      <hr className='border-1 border-slate-400/50 w-full'/>
    </div>
    <div className="mt-3 flex gap-2 w-full">
              <SignInWithOAuthButton provider="Google" callbackPath={callbackPath}/>
              <SignInWithOAuthButton provider="Github" callbackPath={callbackPath}/>
    </div>
    <p className='text-sm mt-4'>Already have an account? <Link href={withCallback("/signin", callbackPath)} className='text-[#F13C3C] font-semibold cursor-pointer hover:underline hover:underline-offset-2 transition'>Sign in</Link></p>
    <p className='text-xs text-muted-foreground mt-3'>By signing up, you agree to our <Link href="/terms" className='hover:underline'>Terms</Link> and <Link href="/privacy" className='hover:underline'>Privacy Policy</Link>.</p>
  </div>
  )}
  </motion.div>
  </AnimatePresence>
  )
}

export default SignUpComponent
