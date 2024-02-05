"use client"
import { FC, useEffect } from 'react'
import { Input } from '../ui/input'
import { getCsrfToken, getProviders, signIn, useSession } from 'next-auth/react'
import { GetServerSidePropsContext, InferGetServerSidePropsType } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import SignInWithGoogleButton from './SignInWithOAuthButton'
import Image from 'next/image'
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
    },
  })

  const onSubmit:SubmitHandler<FieldValues> = async (data) => {
    try {
      await signIn("credentials", {
        redirect: false,
        email: data.email,
        password: data.password,
        
      }).then((res)=>{
        console.log("22222",res)
        if(res?.ok){
          router.push("/")
        }
        else{
          console.log("11111",res?.error);
          toast.error(res?.error,{position:"bottom-center"})
        }
      }).catch((error:Error)=>{
      })
    }
    catch (error) {
      console.log(error);
      toast.error("Invalid email or password",{position:"bottom-center"})
    }
  }
  return (
    <AnimatePresence>
    <motion.div
    initial={{ opacity: 1,y:-50 }}
    animate={{ opacity: 1,y:0 }}
    transition={{ ease: "circIn" }}
    exit={{ opacity: 1,y:-50 }} className='p-6 bg-slate-100 dark:bg-background rounded-lg'>
      <div className="flex justify-center items-center gap-3 cursor-pointer mb-6">
      <Image src='/logo.svg' width={40} height={40} alt='logo'/>
      {/* <h1 className="font-bold text-2xl">Bookmark</h1> */}
      </div>
    <div className="w-full">
    <h1 className="text-2xl font-bold mb-10 text-center">Welcome Back</h1>
    {/* <p className="text-gray-500">Sign in to your account</p> */}
  </div>
  <div className="min-w-96">
  {/* {providers &&
              Object.values(providers).map(provider => (
                <div key={provider.name} style={{ marginBottom: 0 }}> */}
                  {/* <button onClick={() => signIn()} >
                    Sign in with
                  </button> */}
                {/* </div>
              ))} */}
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="email">Email</label>
        <Input register={register} errors={errors} inputValidation={{required:true, message:"Email Required"}} type="email" name="email" id="email" className="" required/>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="password">Password</label>
        <Input register={register} errors={errors} inputValidation={{required:true, message:"Password Required"}} type="password" name="password" id="password" className="w-full" required/>
      </div>
      <Button className="bg-red-500 text-white rounded-md py-2">Sign in</Button>
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
    <p className='text-sm mt-4'>First time using Bookmark? <span onClick={()=>router.push("/register")} className='text-[#F13C3C] font-semibold cursor-pointer hover:underline hover:underline-offset-2 transition'>Create an account</span></p>
  </div>
  </motion.div>
  </AnimatePresence>
  )
}

export default SignInComponent
