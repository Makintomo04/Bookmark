"use client"
import { useState } from 'react'
import { Input } from '../ui/input'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '../ui/button'
import { motion,AnimatePresence } from 'framer-motion'
import { FieldValues, SubmitHandler, useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import axios from 'axios'
import { useRouter, useSearchParams } from 'next/navigation'

const ResetPasswordComponent = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams?.get('token') ?? null
  const email = searchParams?.get('email') ?? null
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    getValues,
    formState:{errors},
  } = useForm<FieldValues>({
    defaultValues: { password: "", repeatPassword: "" },
  })

  const onSubmit:SubmitHandler<FieldValues> = async (data) => {
    if(data.password !== data.repeatPassword){
      toast.error("Passwords do not match.")
      return
    }
    if(!token || !email){
      toast.error("This reset link is invalid.")
      return
    }
    try {
      setIsLoading(true)
      await axios.post("/api/auth/reset-password", { token, email, password: data.password })
      toast.success("Password updated. You can now sign in.",{ position: "bottom-center" })
      router.push("/signin")
    } catch (error:any) {
      toast.error(error?.response?.data?.error || "Something went wrong.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AnimatePresence>
    <motion.div
    initial={{ opacity: 1,y:-50 }}
    animate={{ opacity: 1,y:0 }}
    transition={{ ease: "circIn" }}
    className='w-screen h-screen sm:w-[500px] sm:h-auto rounded-none p-10 sm:p-6 bg-slate-100 dark:bg-background sm:rounded-lg'>
      <div className="flex justify-center items-center gap-3 cursor-pointer mb-6">
      <Image src='/logo.svg' width={40} height={40} alt='logo'/>
      </div>
    <div className="w-full">
    <h1 className="text-2xl font-bold mb-4 text-center">Set a new password</h1>
  </div>
  <div className="">
    {!token || !email ? (
      <p className='text-center text-sm'>This reset link is invalid or has expired. <Link href="/forgot-password" className='text-[#F13C3C] font-semibold hover:underline'>Request a new one</Link>.</p>
    ) : (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 w-full">
      <div className="flex flex-col gap-2">
        <label htmlFor="password">New password</label>
        <Input register={register} errors={errors} inputValidation={{required:true, message:"Password Required", minLength:{value:8,message:"At least 8 characters"}}} type="password" name="password" id="password" className="w-full" required/>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="repeatPassword">Repeat new password</label>
        <Input register={register} errors={errors} inputValidation={{required:true, message:"Password Confirmation Required"}} type="password" name="repeatPassword" id="repeatPassword" className="w-full" required/>
      </div>
      <Button disabled={isLoading} className="bg-red-500 text-white rounded-md py-2">Reset password</Button>
    </form>
    )}
  </div>
  </motion.div>
  </AnimatePresence>
  )
}

export default ResetPasswordComponent
