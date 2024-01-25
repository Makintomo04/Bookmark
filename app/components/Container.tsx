import { FC } from 'react'

interface ContainerProps {
  children: React.ReactNode
}

const Container: FC<ContainerProps> = ({children}) => {
  return (
    <div className='container mx-auto px-4'>
      {children}
    </div>
  )
}

export default Container