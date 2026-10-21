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

const ForgotPasswordComponent = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const {
    register,
    handleSubmit,
    formState:{errors},
  } = useForm<FieldValues>({
    defaultValues: { email: "" },
  })

  const onSubmit:SubmitHandler<FieldValues> = async (data) => {
    try {
      setIsLoading(true)
      await axios.post("/api/auth/forgot-password", data)
      setIsSubmitted(true)
    } catch (error) {
      toast.error(axios.isAxiosError(error) && error.response?.data?.error || "Something went wrong.")
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
    <h1 className="text-2xl font-bold mb-4 text-center">Forgot your password?</h1>
  </div>
  <div className="">
    {isSubmitted ? (
      <p className='text-center text-sm'>If an account exists for that email, we&apos;ve sent a link to reset your password. Check your inbox.</p>
    ) : (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 w-full">
      <p className='text-sm text-slate-600 dark:text-slate-400 -mt-2'>Enter the email on your account and we&apos;ll send you a link to reset your password.</p>
      <div className="flex flex-col gap-2">
        <label htmlFor="email">Email</label>
        <Input register={register} errors={errors} inputValidation={{required:true, message:"Email Required"}} type="email" name="email" id="email" className="w-full" required/>
      </div>
      <Button disabled={isLoading} className="bg-red-500 text-white rounded-md py-2">Send reset link</Button>
    </form>
    )}
    <p className='text-sm mt-4 text-center'><Link href="/signin" className='text-[#F13C3C] font-semibold cursor-pointer hover:underline hover:underline-offset-2 transition'>Back to sign in</Link></p>
  </div>
  </motion.div>
  </AnimatePresence>
  )
}

export default ForgotPasswordComponent
