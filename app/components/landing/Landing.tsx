import Image from 'next/image'
import Link from 'next/link'
import { FC } from 'react'
import { Button } from '../ui/button'
import { TbBook2, TbTarget, TbUsers } from 'react-icons/tb'

const features = [
  {
    icon: TbBook2,
    title: "Track your progress",
    description: "Log every book you're reading, see how far you've gotten, and mark books off as you finish them.",
  },
  {
    icon: TbTarget,
    title: "Hit your reading goals",
    description: "Set a yearly target and watch your progress bar fill up as you complete books throughout the year.",
  },
  {
    icon: TbUsers,
    title: "Follow friends' shelves",
    description: "Follow other readers, see what they're reading, and share your own shelf with a public profile link.",
  },
]

const Landing: FC = () => {
  return (
    <div className="w-full">
      <section className="flex flex-col items-center text-center px-6 pt-16 pb-12 md:pt-24 md:pb-20">
        <Image src="/logo.svg" width={56} height={56} alt="Bookmark logo" className="mb-6" />
        <h1 className="text-4xl md:text-6xl font-bold max-w-3xl leading-tight">
          Track every book you read.
        </h1>
        <p className="text-base md:text-lg text-slate-600 dark:text-gray-300/90 mt-5 max-w-xl">
          Bookmark is a simple way to log your reading, hit your yearly goals, and see what your friends are reading too.
        </p>
        <div className="flex gap-3 mt-8">
          <Button asChild className="bg-[#F13C3C] hover:bg-[#d93333] text-white px-6 py-6 text-base">
            <Link href="/register">Get started — it&apos;s free</Link>
          </Button>
          <Button asChild variant="outline" className="px-6 py-6 text-base">
            <Link href="/signin">Sign in</Link>
          </Button>
        </div>
      </section>

      <section className="px-6 pb-8">
        <div className="max-w-sm mx-auto rounded-[20px] overflow-hidden shadow-2xl border border-neutral-800">
          <Image
            src="/images/landing-hero.jpg"
            width={773}
            height={1079}
            alt="A Bookmark profile showing reading stats, a yearly goal, and a shelf of books"
            className="w-full h-auto"
            priority
          />
        </div>
      </section>

      <section className="px-6 py-16 md:py-24 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex flex-col items-start gap-3 p-6 rounded-[20px] border border-neutral-800">
              <div className="h-12 w-12 rounded-full bg-[#F13C3C]/10 flex items-center justify-center">
                <Icon size={24} className="text-[#F13C3C]" />
              </div>
              <h3 className="text-lg font-bold">{title}</h3>
              <p className="text-sm text-slate-600 dark:text-gray-300/90">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col items-center text-center px-6 py-16 md:py-20 border-t border-neutral-800">
        <h2 className="text-2xl md:text-3xl font-bold">Ready to start tracking?</h2>
        <p className="text-sm md:text-base text-slate-600 dark:text-gray-300/90 mt-3 max-w-md">
          Create a free account in a few seconds and add your first book.
        </p>
        <Button asChild className="bg-[#F13C3C] hover:bg-[#d93333] text-white px-6 py-6 text-base mt-6">
          <Link href="/register">Get started — it&apos;s free</Link>
        </Button>
      </section>
    </div>
  )
}

export default Landing
