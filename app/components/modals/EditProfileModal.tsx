"use client"
import { FC, use, useEffect, useState } from 'react'
import Modal from './Modal'
import EditAvatar from './EditAvatar'
import useUser from '@/app/hooks/useUser'
import { User } from '@prisma/client'
import { Textarea } from '../ui/textarea'
import { FieldValues, SubmitHandler, useForm } from 'react-hook-form'
import { Input } from '../ui/input'
import { Label } from '@radix-ui/react-label'
import { ChromePicker } from 'react-color'
import { cn } from '@/lib/utils'
import { UploadButton } from '@/utils/uploadthing'
import { toast } from 'react-toastify'
import Image from 'next/image'
import { Button } from '../ui/button'
import axios from 'axios'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import Loader from '../Loader'
import useEditProfileModal from '@/app/hooks/useEditProfileModal'
import { set } from 'zod'

interface EditProfileModalProps {
  
}

const EditProfileModal: FC<EditProfileModalProps> = ({}) => {
  const {user,isLoading:isUserLoading,isError,mutate} = useUser()
  const editProfileModal = useEditProfileModal()
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    getValues,
    formState:{errors},
    reset} = useForm<FieldValues>({
    defaultValues: async ()=>{
      return {
        username: user?.username,
        bio: user?.bio,
        imageSrc: user?.image,
        bannerSrc: user?.banner,
        color: user?.favColour,
      }
    },
  },)
  const imageSrc = watch("imageSrc");
  const bannerSrc = watch("bannerSrc");
  const colorSrc = watch("color");
  const [color, setColor] = useState(colorSrc);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [coverImageLink, setImageLink] = useState(user?.image || "");
  const [imageLink, setCoverImageLink] = useState(user?.banner || "");
  const [isLoading, setIsLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter()

  const handleDeleteAccount = () => {
    setIsDeleting(true)
    axios.delete("/api/user")
      .then(() => {
        signOut({ callbackUrl: `${window.location.origin}/` })
      })
      .catch(() => {
        toast.error("Something went wrong deleting your account.", { position: "bottom-center" })
        setIsDeleting(false)
      })
  }
  useEffect(() => {
    let defaultValues:FieldValues = {};
    defaultValues.username = user?.username;
    defaultValues.bio = user?.bio;
    defaultValues.imageSrc = user?.image;
    defaultValues.bannerSrc = user?.banner;
    defaultValues.color = user?.favColour;
    reset({ ...defaultValues });
    if (user?.favColour) setColor(user.favColour as any);

  },[user?.username,user?.bio,user?.image,user?.banner,user?.favColour])
  const handleClick = () => {
    setShowColorPicker((state) => !state)
  };

  const handleClose = () => {
    setShowColorPicker(false)
  };
  const onSubmit:SubmitHandler<FieldValues> =(data) =>{
    axios.post("/api/user",data).then((res)=>{
      setIsLoading(true)
      if(res?.data?.id){
      toast.success("Profile Updated!",{ position: "bottom-center" })
    }
      if(res?.data?.message){
        toast.info(res.data.message,{ position: "bottom-center" })

      }
      if(res?.data?.id){
        mutate({...data})
      }
      setIsLoading(false);
    }).catch((err)=>{
      toast.error("Something went wrong!",{ position: "bottom-center" })
    }).finally(()=>{
      setIsLoading(false);
    })
  }
  const setCustomValue = (id: string, value: any) => {
    setValue(id, value, {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true
    });
  }

  const onChangeMethod = (color:any) => {
    setColor({
      r: color.rgb.r,
      g: color.rgb.g,
      b: color.rgb.b,
      a: color.rgb.a
    });
    setCustomValue("color",`rgba(${color.rgb.r},${color.rgb.g},${color.rgb.b},${color.rgb.a})`)
  };
  const footer = (
    <div className="w-full p-6">
      <div className="flex items-center gap-3 justify-end">
      <Button style={{background:`${colorSrc}`}} onClick={editProfileModal.onClose}>Cancel</Button>
      <Button style={{background:`${colorSrc}`}} onClick={handleSubmit(onSubmit)}>Save</Button>
      </div>
    </div>
  )
  
  const body = (
    isUserLoading ? <p className="px-6 text-sm text-muted-foreground">Loading…</p>:<div
      className="w-full h-full px-6"
    >
      <div className="h-full w-full flex flex-col sm:flex-row gap-6">
        <div className="h-full w-full">
          <div className="flex flex-col mb-8">
            <h2 className='font-bold text-md mb-2'>Display Picture</h2>
            <div className="flex items-center gap-6">

            <EditAvatar src={imageSrc} favColour={colorSrc}/>
            <UploadButton
            appearance={{
              button({ ready, isUploading,uploadProgress }) {
                return {
                  background: colorSrc,
              }}}}
        className={`mt-6 items-start`}
        endpoint="imageUploader"
        onUploadBegin={() => {
          setIsLoading(true);
        }}
        onClientUploadComplete={(res) => {
          // Do something with the response
          setImageLink(res[0]?.url)
          setCustomValue("imageSrc",res[0]?.url)
          toast.success("Upload completed",{
            position: "bottom-center"
          })
          setIsLoading(false);
          // alert("Upload Completed");
        }}
        onUploadError={(error: Error) => {
          // Do something with the error.
          toast(error.message)
          // alert(`ERROR! ${error.message}`);
        }}
        />
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
            <Label className="text-md font-bold" htmlFor="username">Username</Label>
            <Input register={register} errors={errors} name="username" id="username" autoComplete='off' className=""/>
            </div>
            <div className="flex flex-col gap-2">
            <Label className="text-md font-bold" htmlFor="bio">Bio</Label>
          <Textarea register={register} errors={errors} name="bio" id="bio" autoComplete='off' className=""/>
            </div> 
            </div> 
        </div>
        <div className=" h-full w-full">
        <div className="flex flex-col mb-8">
            <h2 className='text-md font-bold mb-2'>Favourite Colour</h2>
            <div 
  style={ {background: colorSrc,
}}
  className={cn(`hover:scale-105 transition cursor-pointer text-center h-16 w-16 ring-4  ring-slate-300/50 rounded-full mt-3 `)} onClick={handleClick}></div>

  </div>
  { showColorPicker ? <div style={{position: 'fixed', zIndex: 60, top: '50%', left: '50%', transform: 'translate(-50%, -50%)'} }>
          <div style={{position: 'fixed',
    top: '0px',
    right: '0px',
    bottom: '0px',
    left: '0px'}} onClick={ handleClose }/>
          <div style={{position: 'relative'}}>
          <ChromePicker color={color} onChange={onChangeMethod}/>
          </div>
        </div> : null }
  <div className="flex flex-col mb-8">
            <h2 className='text-md font-bold mb-2'>Banner</h2>
            <div>
              <div className="flex items-center justify-center mb-4">
              {bannerSrc &&
      <div className="h-32 w-full relative">
     <Image priority layout="fill" objectFit="cover"  className='rounded-md h-full w-full object-cover' src={bannerSrc} alt='cover image'/>
      
    </div>
      }
              </div>
            <UploadButton
            appearance={{
              button({ ready, isUploading,uploadProgress }) {
                return {
                  background: colorSrc,
              }}}}
        className='items-start'
        endpoint="imageUploader"
        onUploadBegin={() => {
          setIsLoading(true);
        }}
        onClientUploadComplete={(res) => {
          // Do something with the response
          setCoverImageLink(res[0]?.url)
          setCustomValue("bannerSrc",res[0]?.url)
          toast.success("Upload completed",{
            position: "bottom-center"
          })
          setIsLoading(false);
          // alert("Upload Completed");
        }}
        onUploadError={(error: Error) => {
          // Do something with the error.
          toast.error(error.message,
            {
              position: "bottom-center"
            })
        }}
      />
            </div>
            </div>
  </div>
  <div className="flex flex-col gap-2 border border-red-500/30 rounded-lg p-4">
    <h2 className="text-md font-bold text-red-500">Danger Zone</h2>
    {!showDeleteConfirm ? (
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Permanently delete your account and all your data.</p>
        <Button type="button" variant="outline" className="border-red-500 text-red-500 hover:bg-red-500/10 flex-shrink-0" onClick={() => setShowDeleteConfirm(true)}>Delete Account</Button>
      </div>
    ) : (
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">This can&apos;t be undone. All your books, notes, goals, and followers will be permanently deleted. Are you sure?</p>
        <div className="flex gap-2">
          <Button type="button" disabled={isDeleting} className="bg-red-600 hover:bg-red-700 text-white" onClick={handleDeleteAccount}>{isDeleting ? "Deleting..." : "Yes, delete my account"}</Button>
          <Button type="button" variant="outline" disabled={isDeleting} onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
        </div>
      </div>
    )}
  </div>
          </div>

      </div>
  )
  return (
    <Modal
      title="Edit Profile"
      body={body}
      footer={footer}
      onClose={editProfileModal.onClose}
      isOpen={editProfileModal.isOpen}
    />
  )
}

export default EditProfileModal