import Container from '../../../components/Container'
import AppHandoffLanding from '@/app/components/signIn/AppHandoffLanding'

const Page = () => {
  return (
    <div className="w-full min-h-dvh bg-background">
      <Container>
        <div className="w-full min-h-dvh flex justify-center items-start sm:items-center sm:py-10">
          <AppHandoffLanding/>
        </div>
      </Container>
    </div>
  )
}

export default Page
