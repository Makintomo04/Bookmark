"use client"
import { useState } from 'react'
import { PasswordInput } from '../ui/password-input'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '../ui/button'
import { motion,AnimatePresence } from 'framer-motion'
import { FieldValues, SubmitHandler, useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import axios from 'axios'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PASSWORD_MAX, PASSWORD_MIN } from '@/lib/authSchemas'
import { afterSignInPath } from '@/lib/callbackUrl'

const ResetPasswordComponent = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams?.get('token') ?? null
  const email = searchParams?.get('email') ?? null
  const [isLoading, setIsLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState:{errors},
  } = useForm<FieldValues>({
    defaultValues: { password: "" },
  })

  const onSubmit:SubmitHandler<FieldValues> = async (data) => {
    if(!token || !email) return
    setServerError(null)
    try {
      setIsLoading(true)
      await axios.post("/api/auth/reset-password", { token, email, password: data.password })
    } catch (error) {
      setServerError(axios.isAxiosError(error) && error.response?.data?.error || "Something went wrong. Please try again.")
      setIsLoading(false)
      return
    }
    // They've just proved the inbox and typed the new password, so sign straight in.
    const res = await signIn("credentials", { redirect: false, email, password: data.password }).catch(() => null)
    toast.success("Password updated.",{ position: "bottom-center" })
    router.push(res?.ok ? afterSignInPath(null) : `/signin?email=${encodeURIComponent(email)}`)
  }

  return (
    <AnimatePresence>
    <motion.div
    initial={{ opacity: 1,y:-50 }}
    animate={{ opacity: 1,y:0 }}
    transition={{ ease: "circIn" }}
    className='w-screen h-screen sm:w-[500px] sm:h-auto rounded-none p-10 sm:p-6 bg-slate-100 dark:bg-background sm:rounded-lg'>
      <div className="flex justify-center items-center gap-3 mb-6">
      <Image src='/logo.svg' width={40} height={40} alt='Bookmark'/>
      </div>
    <div className="w-full">
    <h1 className="text-2xl font-bold mb-4 text-center">Set a new password</h1>
  </div>
  <div className="">
    {!token || !email ? (
      <p className='text-center text-sm'>This reset link is invalid or has expired. <Link href="/forgot-password" className='text-[#F13C3C] font-semibold hover:underline'>Request a new one</Link>.</p>
    ) : (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 w-full" noValidate>
      {serverError && (
        <p role="alert" className="rounded-md bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm px-3 py-2">
          {serverError} {serverError.includes("invalid or has expired") && <Link href="/forgot-password" className="font-semibold underline">Request a new link</Link>}
        </p>
      )}
      {/* Lets password managers save the new password against the right account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <div className="flex flex-col gap-2">
        <label htmlFor="password">New password</label>
        <PasswordInput
          register={register}
          errors={errors}
          inputValidation={{
            required:true,
            message:"Choose a new password.",
            minLength:{ value:PASSWORD_MIN, message:`Use at least ${PASSWORD_MIN} characters.` },
            maxLength:{ value:PASSWORD_MAX, message:`Use ${PASSWORD_MAX} characters or fewer.` },
          }}
          name="password" id="password" autoComplete="new-password" className="w-full"/>
        {!errors.password && <p className='text-xs text-muted-foreground'>At least {PASSWORD_MIN} characters.</p>}
      </div>
      <Button disabled={isLoading} className="bg-red-500 text-white rounded-md py-2">{isLoading ? "Saving…" : "Save and sign in"}</Button>
    </form>
    )}
  </div>
  </motion.div>
  </AnimatePresence>
  )
}

export default ResetPasswordComponent
