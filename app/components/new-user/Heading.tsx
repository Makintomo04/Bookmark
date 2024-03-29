import { FC } from 'react'

interface HeadingProps {
  title:String,
  subtitle:String
}

const Heading: FC<HeadingProps> = ({title,subtitle}) => {
  return (
    <div className="flex flex-col mb-10 text-center items-center justify-center w-full">
    <h1 className="text-2xl font-bold mb-2 w-full max-w-xs text-center">{title}</h1>
    <h3 className='max-w-md'>{subtitle}</h3>
      </div>
  )
}

export default Heading