"use client"
import { useState } from 'react'
import { Input } from '../ui/input'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '../ui/button'
import { motion,AnimatePresence } from 'framer-motion'
import { FieldValues, SubmitHandler, useForm } from 'react-hook-form'
import { notify, apiError } from '@/lib/notify'
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
      notify.error(apiError(error, "Couldn't send the reset email. Try again."))
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
    className='w-full min-h-dvh sm:w-[500px] sm:min-h-0 rounded-none py-10 sm:p-6 bg-background sm:bg-popover sm:border sm:rounded-xl'>
      <div className="flex justify-center items-center gap-3 mb-6">
      <Link href="/" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Image src='/logo.svg' width={40} height={40} alt='Bookmark home'/></Link>
      </div>
    <div className="w-full">
    <h1 className="page-title mb-4 text-center">Forgot your password?</h1>
  </div>
  <div className="">
    {isSubmitted ? (
      <div role="status" className='text-center text-sm flex flex-col gap-3'>
        <p>If an account exists for that email, we&apos;ve sent you an email. Check your inbox.</p>
        {/* Google/GitHub accounts have no password, so they get a reminder of how they sign in instead. */}
        <p className='text-muted-foreground'>Signed up with Google or GitHub? There&apos;s no password to reset, so the email says how you sign in. You can also email yourself a sign-in link from the sign-in page.</p>
      </div>
    ) : (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 w-full">
      <p className='text-sm text-neutral-600 dark:text-neutral-400 -mt-2'>Enter the email on your account and we&apos;ll send you a link to reset your password.</p>
      <div className="flex flex-col gap-2">
        <label htmlFor="email">Email</label>
        <Input register={register} errors={errors} inputValidation={{required:true, message:"Email Required"}} type="email" name="email" id="email" autoComplete="email" className="w-full" required/>
      </div>
      <Button loading={isLoading} className="rounded-md py-2">Send reset link</Button>
    </form>
    )}
    <p className='text-sm mt-4 text-center'><Link href="/signin" className='text-brand-text font-semibold cursor-pointer hover:underline hover:underline-offset-2 transition'>Back to sign in</Link></p>
  </div>
  </motion.div>
  </AnimatePresence>
  )
}

export default ForgotPasswordComponent
