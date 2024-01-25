"use client"
import { signIn, useSession } from 'next-auth/react'
import { FC, useEffect } from 'react'
import { Button } from '../ui/button'
import { FaGithub, FaGoogle, FaTwitter } from "react-icons/fa";
import { useRouter } from 'next/navigation';

interface SignInButtonProps {
  provider:String
}

const SignInWithOAuthButton: FC<SignInButtonProps> = ({provider}) => {
  const router = useRouter()
  const { data: session, status } = useSession();

  useEffect(() => {
      // if (!(status === "loading") && !session) void signIn("google");
      if (session) window.close();
  }, [session, status]);

  const popupCenter = (url:string, title:string) => {
    const dualScreenLeft = window.screenLeft ?? window.screenX;
    const dualScreenTop = window.screenTop ?? window.screenY;

    const width =
      window.innerWidth ?? document.documentElement.clientWidth ?? screen.width;

    const height =
      window.innerHeight ??
      document.documentElement.clientHeight ??
      screen.height;

    const systemZoom = width / window.screen.availWidth;

    const left = (width - 500) / 2 / systemZoom + dualScreenLeft;
    const top = (height - 550) / 2 / systemZoom + dualScreenTop;

    const newWindow = window.open(
      url,
      title,
      `width=${500 / systemZoom},height=${550 / systemZoom
      },top=${top},left=${left}`
    );

    newWindow?.focus();
  };
  const onSubmit = () => {
    // e.preventDefault()
    console.log("@@@@@");
    signIn(provider.toLowerCase(),
      { callbackUrl: 'http://localhost:3000/' }
    )
    // popupCenter("https://accounts.google.com/o/oauth2/v2/auth/oauthchooseaccount?client_id=321426932384-3g17vdealskg87civvfcp6sf8k5tnk56.apps.googleusercontent.com&scope=openid%20email%20profile&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fcallback%2Fgoogle&state=HOKGZnvLf8jKi6rPM8pgiGONqCsGjSv7ApqERCi2PTA&code_challenge=1Wx-I5BlAGTRtcwrRCHiVcjGYpqHuKk6-2XU07AGCPQ&code_challenge_method=S256&service=lso&o2v=2&theme=glif&flowName=GeneralOAuthFlow", "Sample Sign In")
    // sign in
  }
  return <div className='w-full'><Button variant="outline" size={'lg'} className='w-full flex gap-3' onClick={()=>onSubmit()} >
  <span></span> {provider === "Google" ? <FaGoogle/> : <FaGithub/> }
</Button></div>
}

export default SignInWithOAuthButton