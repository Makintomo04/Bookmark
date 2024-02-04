import { ErrorMessage } from '@hookform/error-message'
import { FC } from 'react'
import { FieldErrors } from 'react-hook-form'

interface ErrorMessageComponentProps {
  errors:FieldErrors,
  name:string
}

const ErrorMessageComponent: FC<ErrorMessageComponentProps> = ({errors,name}) => {
  return (
    <ErrorMessage errors={errors} name={name}
           render={({ message }) => <p className='text-rose-500 text-sm'>{message}</p>}/>
  )
}

export default ErrorMessageComponent