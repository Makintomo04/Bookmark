"use client"
import { FC, useEffect, useState } from 'react'
import { Input } from '../ui/input'
import { signIn } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import SignInWithOAuthButton from './SignInWithOAuthButton'
import { Button } from '../ui/button'
import { useRouter } from 'next/navigation'
import { motion,AnimatePresence } from 'framer-motion'
import { FieldValues, SubmitHandler, useForm } from 'react-hook-form'
import { toast } from 'react-toastify'

interface SignInComponentProps {
  
}

const SignInComponent =  () => {

  const router = useRouter()

  // Until hydration, a click would submit the form natively instead of through onSubmit
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // NextAuth sends failed Google/GitHub sign-ins back here as ?error=...
  const [authError, setAuthError] = useState<string | null>(null)
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error")
    if (!code) return
    setAuthError(code === "OAuthAccountNotLinked"
      ? "An account with this email already exists. Sign in with the method you used to create it."
      : "Sign-in failed. Please try again.")
  }, [])

  const { 
    register,
    handleSubmit,
    setValue,
    watch,
    getValues,
    formState:{errors, isSubmitting},
    reset} = useForm<FieldValues>({
    defaultValues: {
      email: "",
      password:"",
    },
  })

  const onSubmit:SubmitHandler<FieldValues> = async (data) => {
    try {
      const res = await signIn("credentials", {
        redirect: false,
        email: data.email,
        password: data.password,
      })
      if(res?.ok){
        router.push("/")
      }
      else{
        toast.error(res?.error || "Invalid email or password",{position:"bottom-center"})
      }
    }
    catch (error) {
      toast.error("Invalid email or password",{position:"bottom-center"})
    }
  }
  let initial = {};
  let animate = {};
  let transition = {};
  let exit = {};

  if (typeof window !== "undefined") {

    const isMobile = window.innerWidth < 640;

  if (!isMobile) {

      initial={ opacity: 1,y:-50 },
      animate={ opacity: 1,y:0 },
      transition={ ease: "circIn" },
      exit={ opacity: 1,y:-50 }
    
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
    <h1 className="text-2xl font-bold mb-10 text-center">Welcome Back</h1>
    {/* <p className="text-gray-500">Sign in to your account</p> */}
  </div>
  <div className="">
    {authError && <p role="alert" className="mb-4 rounded-md bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm px-3 py-2">{authError}</p>}
    <form method="post" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 w-full">
      <div className="flex flex-col gap-2">
        <label htmlFor="email">Email</label>
        <Input register={register} errors={errors} inputValidation={{required:true, message:"Email Required"}} type="email" name="email" id="email" className="w-full" required/>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="password">Password</label>
        <Input register={register} errors={errors} inputValidation={{required:true, message:"Password Required"}} type="password" name="password" id="password" className="w-full" required/>
      </div>
      <Link href="/forgot-password" className='text-sm text-[#F13C3C] hover:underline self-end -mt-2'>Forgot password?</Link>
      <Button type="submit" disabled={!mounted || isSubmitting} className="bg-red-500 text-white rounded-md py-2">{isSubmitting ? "Signing in…" : "Sign in"}</Button>
    </form>
    <div className="flex gap-3 items-center justify-center my-6 w-full">
      <hr className='border-1 border-slate-400/50 w-full'/>
      <span className='text-sm font-semibold text-slate-400'>OR</span>
      <hr className='border-1 border-slate-400/50 w-full'/>
    </div>
    <div className="mt-3 flex gap-2 w-full">
              <SignInWithOAuthButton provider="Google"/>
              <SignInWithOAuthButton provider="Github"/>
    </div>
    <p className='text-sm mt-4'>First time using Bookmark? <Link href="/register" className='text-[#F13C3C] font-semibold cursor-pointer hover:underline hover:underline-offset-2 transition'>Create an account</Link></p>
  </div>
  </motion.div>
  </AnimatePresence>
  )
}

export default SignInComponent
