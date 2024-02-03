import { FC } from 'react'
import { Oval } from 'react-loader-spinner'

interface LoaderProps {
  
}

const Loader: FC<LoaderProps> = ({}) => {
  return (
    <div className="h-full w-screen relative flex justify-center items-center">
      <Oval color='#F13C3C' secondaryColor="#F13C3C"strokeWidth={2.5} height={100} width={100} ariaLabel="oval-loading" />
    </div>
  )
}

export default Loader