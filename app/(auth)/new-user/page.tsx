"use client"
import Container from '@/app/components/Container'
import Heading from '@/app/components/new-user/Heading'
import NewUserComponent from '@/app/components/new-user/NewUserComponent'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { UploadButton } from '@/utils/uploadthing'
import Image from 'next/image'
import { FC, use, useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { IoCloudUploadOutline } from "react-icons/io5";
import { Textarea } from '@/app/components/ui/textarea'
import ColorPickerComponent from '@/app/components/ColorPickerComponent'
import { BlockPicker, ChromePicker, Color, SketchPicker } from 'react-color'
import { cn } from '@/lib/utils'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/app/components/ui/form'
import { useForm, FieldValues, SubmitHandler, set } from 'react-hook-form'
import * as z from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { error } from 'console'
import axios from 'axios'
import { useRouter } from 'next/navigation'
import { STEPS } from '@/utils/helpers'
import getCurrentUser from '@/app/actions/getCurrentUser'
interface pageProps {
  
}

interface RGBAColor {
  r: number; // Red channel, value between 0 and 255
  g: number; // Green channel, value between 0 and 255
  b: number; // Blue channel, value between 0 and 255
  a: number; // Alpha channel (opacity), value between 0 (transparent) and 1 (opaque)
}

const Page: FC<pageProps> = ({}) => {
  const [step, setStep] = useState(STEPS.START);
  const [imageLink, setImageLink] = useState("");
  const [coverImageLink, setCoverImageLink] = useState("");
  const [color, setColor] = useState<RGBAColor>({ r: 241, g: 60, b: 60, a: 1
  });
  const [selectedColor, setSelectedColor] = useState("#F13C3C");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);


  const formSchema = z.object({
    username: z.string().min(2).max(50),
  })
  
  
    // 1. Define your form.
    const { 
      register,
      handleSubmit,
      setValue,
      watch,
      getValues,
      formState:{errors},
      reset} = useForm<FieldValues>({
      defaultValues: {
        username: "",
        imageSrc:"",
        bannerSrc:"",
        bio:"",
        color:"rgba(241, 60, 60, 1)"
      },
    })
    const imageSrc = watch("imageSrc");
    const bannerSrc = watch("bannerSrc");
    const bio = watch("bio");
    const colorSrc = watch("colorSrc");
   
    const router = useRouter()
    // 2. Define a submit handler.
    const onSubmit:SubmitHandler<FieldValues> =(data) =>{
      if (step !== STEPS.COLOUR) {
        console.log("@@@@",data);
        return onNext();
      }
      
      axios.post("/api/new-user",data).then((res)=>{
        setIsLoading(true)
        toast.success("Profile Created!",{ position: "bottom-center" })
        router.push("/")
        reset();
        setStep(STEPS.START)
        console.log(res);
        setIsLoading(false);
      }).catch((err)=>{
        toast.error("Something went wrong!",{ position: "bottom-center" })
        console.log(err);
      }).finally(()=>{
        console.log("Done");
        setIsLoading(false);
      })
    }
  

  
  const onNext = () => {
    // if(step === STEPS.USERNAME) {
    //   // form.handleSubmit(onSubmit)
    //   console.log("Submitted",getValues())
    // }
    setStep((step)=>step + 1)
  }
  const onBack = () => {
    if(step === STEPS.START) {
      return
    }
    setStep((step)=>step - 1)
  }
  useEffect(() => {
    // console.log("COLOURRR",color);
  }, [color])

  const setCustomValue = (id: string, value: any) => {
    setValue(id, value, {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true
    });
  }

  let bodyContent = (
    <div className="">
    <div className="flex justify-center items-center gap-3 cursor-pointer mb-6">
      <Image src='/logo.svg' width={40} height={40} alt='logo'/>
      {/* <h1 className="font-bold text-2xl">Bookmark</h1> */}
      </div>
    <div className="w-full">
   <Heading title="Welcome" subtitle="Ready to dive into Bookmark? Complete these steps and let's personalize your Bookmark experience."/>
    {/* <p className="text-gray-500">Sign in to your account</p> */}
  </div>

  </div>
  )

  if(step === STEPS.USERNAME) {
    bodyContent = (
      <div className="">
      <div className="flex justify-center items-center gap-3 cursor-pointer mb-6">
        <Image src='/logo.svg' width={40} height={40} alt='logo'/>
        {/* <h1 className="font-bold text-2xl">Bookmark</h1> */}
        </div>
      <div className="w-full">
     <Heading title="What shall we call you?" subtitle=""/>
      {/* <p className="text-gray-500">Sign in to your account</p> */}
    </div>
    <div className="min-w-96">
     
      {/* <FormLabel>Username</FormLabel> */}
        <Input register={register} errors={errors} id="username" inputValidation={{required:true, message:"Username required"}} placeholder="e.g. Bookworm99" autoComplete='off' required  />
      <p className='text-sm text-slate-600 mt-2'>This is your public display name. (you can change this later)</p>
      {/* <FormMessage /> */}

    </div>
    </div>
    )

  }

  
  if(step === STEPS.IMAGE) {
    bodyContent = (
      <div className="">
    <div className="flex justify-center items-center gap-3 cursor-pointer mb-6">
      <Image src='/logo.svg' width={40} height={40} alt='logo'/>
      </div>
    <div className="w-full">
   <Heading title="Upload Profile Picture" subtitle="(you can change this later)"/>
    {/* <p className="text-gray-500">Sign in to your account</p> */}
  </div>
  <div className="">
  <div className="flex items-center justify-center mb-4">
    <div className="h-32 w-32 relative">
    <Image fill className='rounded-full h-full w-full object-cover' src={imageLink === "" ? "/images/pfp.png": imageLink} alt='profile image'/>
    </div>
  </div>
  <div className="min-w-96">

  <UploadButton
        // appearance={{button:{
        //   backgroundColor: "#F13C3C",
        // }}}
        className='ut-button:bg-[#F13C3C]'
        endpoint="imageUploader"
        onUploadBegin={() => {
          setIsLoading(true);
        }}
        onClientUploadComplete={(res) => {
          // Do something with the response
          console.log("Files: ", res);
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
          alert(`ERROR! ${error.message}`);
        }}
        />
  </div>
  </div>
  </div>
    )
    
  }
  if(step === STEPS.BANNER) {
    bodyContent = (
      <div className="">
    <div className="flex justify-center items-center gap-3 cursor-pointer mb-6">
      <Image src='/logo.svg' width={40} height={40} alt='logo'/>
      </div>
    <div className="w-full">
   <Heading title="Upload Cover Photo" subtitle="(you can change this later)"/>
    {/* <p className="text-gray-500">Sign in to your account</p> */}
  </div>
  <div className="">
  <div className="flex items-center justify-center mb-4">
    {
      coverImageLink && coverImageLink !== "" && <div className="h-32 w-full relative">
     <Image fill className='rounded-md h-full w-full object-cover' src={coverImageLink} alt='cover image'/>
      
    </div>
      }
  </div>
  <div className="min-w-96">

  <UploadButton
        className='ut-button:bg-[#F13C3C] ut-button:ut-uploading:bg-[#ae1818]'
        endpoint="imageUploader"
        onUploadBegin={() => {
          setIsLoading(true);
        }}
        onClientUploadComplete={(res) => {
          // Do something with the response
          console.log("Files: ", res);
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
          alert(`ERROR! ${error.message}`);
        }}
      />
  </div>
  </div>
  </div>
    )

  }
  if(step === STEPS.BIO) {
    bodyContent = (
      <div className="">
    <div className="flex justify-center items-center gap-3 cursor-pointer mb-6">
      <Image src='/logo.svg' width={40} height={40} alt='logo'/>
      </div>
    <div className="w-full">
   <Heading title="Write your Bio" subtitle="Time to shine! Tell us about you."/>
    {/* <p className="text-gray-500">Sign in to your account</p> */}
  </div>
  <div className="">
  
  </div>
  <div className="min-w-96">

  <form action="" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {/* <label htmlFor="username">What shall we call you?</label> */}
          <Textarea register={register} errors={errors} name="bio" id="bio" autoComplete='off' className="" placeholder=''/>
        </div>
        
      </form>
  </div>
  </div>

    )

  }


  const handleChangeComplete = (color:any) => {
    setSelectedColor(color.hex);
  }
  
  const handleClick = () => {
    setShowColorPicker((state) => !state)
  };

  const handleClose = () => {
    setShowColorPicker(false)
  };
  const popover = {
    position: 'absolute',
    zIndex: '2',
  }
  const cover =( {
    position: 'fixed',
    top: '0px',
    right: '0px',
    bottom: '0px',
    left: '0px',
  })

  const onChangeMethod = (color:any) => {
    // console.log([...color.rgb]);
    // console.log(color.rgb.r,color.rgb.b,color.rgb.g,color.rgb.a);
    console.log(color.rgb.r);
    setColor({
      r: color.rgb.r,
      g: color.rgb.g,
      b: color.rgb.b,
      a: color.rgb.a
    });
    setCustomValue("color",`rgba(${color.rgb.r},${color.rgb.g},${color.rgb.b},${color.rgb.a})`)
  };
  // console.log(color);
  if(step === STEPS.COLOUR) {
    bodyContent = (
      <div className="">
    <div className="flex justify-center items-center gap-3 cursor-pointer mb-6">
      <Image src='/logo.svg' width={40} height={40} alt='logo'/>
      </div>
    <div className="w-full">
   <Heading title="What's your favourite colour?" subtitle="Click and select a colour."/>
    {/* <p className="text-gray-500">Sign in to your account</p> */}
  </div>
  <div className="">
  
  </div>
  <div className="min-w-96">
      {/* <ColorPickerComponent/> */}
  {/* <BlockPicker
  className='w-[100%_!important]'
  color={ selectedColor }
  onChangeComplete={ handleChangeComplete }
  /> */}
  <div className="grid place-items-center w-full">
  <div 
  style={ {background: `rgba(${ color.r }, ${ color.g }, ${color.b }, ${ color.a })`,
}}
  className={cn(`hover:scale-105 transition cursor-pointer text-center h-24 w-24 ring-4 ring-[#f13c3c] ring-offset-4 rounded-full -mt-3 `)} onClick={handleClick}></div>

  </div>
  { showColorPicker ? <div style={{position: 'absolute',
    zIndex: '2'} }>
          <div style={{position: 'fixed',
    top: '0px',
    right: '0px',
    bottom: '0px',
    left: '0px'}} onClick={ handleClose }/>
          <ChromePicker color={color} onChange={onChangeMethod}/>
        </div> : null }

     
  </div>
  </div>

    )

  }

  return (
    <div className="w-screen h-screen bg-red-400">
      <Container>
        <div className="w-full h-screen flex justify-center items-center">
          <div className="">
          
     <NewUserComponent
     step={step}
     body={bodyContent}
     onSubmit={handleSubmit(onSubmit)}
     handleBack={onBack}
     disabled={isLoading}
     />
      </div>
      </div>
      </Container>
     </div>
  )
}

export default Page