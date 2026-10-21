import Image from 'next/image'
import Link from 'next/link'
import { FC } from 'react'
import { Button } from '../ui/button'
import {
  TbArrowRight,
  TbBook2,
  TbChartBar,
  TbChevronDown,
  TbEyeOff,
  TbFileImport,
  TbMedal,
  TbSparkles,
  TbTarget,
} from 'react-icons/tb'

// Every claim here has to match something the app really does: no invented
// reader counts or testimonials. Add social proof once there are real numbers.

const features = [
  {
    icon: TbBook2,
    title: "Track every page",
    description: "Log what you're reading, follow your progress page by page, and keep notes and favourite quotes as you go.",
  },
  {
    icon: TbTarget,
    title: "Hit your yearly goal",
    description: "Set a target for the year and watch the bar fill as you finish each book.",
  },
  {
    icon: TbEyeOff,
    title: "Buddy reads, no spoilers",
    description: "Read a book with friends. Everyone's progress sits in one place, and comments stay hidden until you reach them.",
  },
  {
    icon: TbMedal,
    title: "Seasonal quests",
    description: "Take on a reading challenge and finish it before the season ends to earn a limited-edition medal.",
  },
  {
    icon: TbChartBar,
    title: "Every stat, free",
    description: "Books and pages by month, ratings, genres, authors, re-reads and your streak. No upgrade, no paywall.",
  },
  {
    icon: TbSparkles,
    title: "Your year, Wrapped",
    description: "When the year ends, get a recap of everything you read, ready to share with friends.",
  },
]

const steps = [
  {
    title: "Sign up in seconds",
    description: "Use Google, GitHub or your email. No credit card, nothing to install.",
  },
  {
    title: "Add your books",
    description: "Search for what you're reading now, or import your whole Goodreads or StoryGraph library.",
  },
  {
    title: "Set a goal and read",
    description: "Pick a number for the year, update your page as you go, and let Bookmark keep count.",
  },
]

const faqs = [
  {
    question: "Is Bookmark really free?",
    answer: "Yes. Every feature, including your full reading stats, is free. There's no paid plan and nothing locked behind an upgrade.",
  },
  {
    question: "Can I bring my Goodreads or StoryGraph history?",
    answer: "Yes. Import your shelves, ratings, reviews and reading dates in about a minute, right after you sign up.",
  },
  {
    question: "Will buddy-read comments spoil the book?",
    answer: "No. Comments stay hidden until you reach the part of the book they're about, so you can read at your own pace.",
  },
  {
    question: "Who can see my shelf?",
    answer: "Your profile has its own public link, so friends can see what you're reading and follow you.",
  },
]

const ctaClassName = "bg-brand-fill hover:bg-brand-fill-hover text-white h-12 px-7 text-base font-semibold w-full sm:w-auto"
const cardClassName = "rounded-[20px] border border-neutral-200 dark:border-neutral-800"
const mutedClassName = "text-slate-600 dark:text-gray-300/90"

const Landing: FC = () => {
  return (
    <div className="w-full">
      {/* Hero: one promise, one action. Sign in already lives in the header. */}
      <section className="flex flex-col items-center text-center px-6 pt-12 pb-16 md:pt-20 md:pb-24">
        <Image src="/logo.svg" width={48} height={48} alt="Bookmark logo" className="mb-6" />
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.08] tracking-tight max-w-3xl">
          Read more books, and remember every one.
        </h1>
        <p className={`text-base md:text-lg mt-5 max-w-xl ${mutedClassName}`}>
          Bookmark logs your reading, keeps you on track for your yearly goal, and turns it all into stats and a year-end Wrapped. Free, with no paywall.
        </p>
        <Button asChild className={`${ctaClassName} mt-8`}>
          <Link href="/register">Start your shelf — it&apos;s free</Link>
        </Button>
        <p className={`text-sm mt-4 ${mutedClassName}`}>
          Coming from Goodreads or StoryGraph? Bring your books with you.
        </p>
      </section>

      {/* Switching is the biggest hurdle for anyone who already tracks their reading elsewhere. */}
      <section className="px-6">
        <div className={`max-w-5xl mx-auto p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-5 md:gap-8 ${cardClassName}`}>
          <div className="h-12 w-12 shrink-0 rounded-full bg-brand/10 flex items-center justify-center">
            <TbFileImport size={24} className="text-brand" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg md:text-xl font-bold">Your reading history comes with you</h2>
            <p className={`text-sm md:text-base mt-1 ${mutedClassName}`}>
              Import your shelves, ratings, reviews and reading dates from Goodreads or StoryGraph in about a minute. Nothing to start over.
            </p>
          </div>
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-fill dark:text-brand hover:underline shrink-0"
          >
            Sign up and import <TbArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </section>

      <section className="px-6 py-20 md:py-28 max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-12 md:mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Everything a reader needs, nothing they don&apos;t</h2>
          <p className={`text-base md:text-lg mt-4 ${mutedClassName}`}>
            A clean place to keep track of your books, with a little push to read the next one.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map(({ icon: Icon, title, description }) => (
            <div key={title} className={`flex flex-col items-start gap-3 p-6 ${cardClassName}`}>
              <div className="h-12 w-12 rounded-full bg-brand/10 flex items-center justify-center">
                <Icon size={24} className="text-brand" />
              </div>
              <h3 className="text-lg font-bold">{title}</h3>
              <p className={`text-sm ${mutedClassName}`}>{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 pb-20 md:pb-28 max-w-5xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-center mb-12">Up and running in three steps</h2>
        <ol className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
          {steps.map(({ title, description }, i) => (
            <li key={title} className="flex flex-col items-center text-center md:items-start md:text-left gap-3">
              <span className="h-10 w-10 rounded-full bg-brand-fill text-white font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <h3 className="text-lg font-bold">{title}</h3>
              <p className={`text-sm ${mutedClassName}`}>{description}</p>
            </li>
          ))}
        </ol>
        <div className="flex justify-center mt-12">
          <Button asChild className={ctaClassName}>
            <Link href="/register">Start your shelf — it&apos;s free</Link>
          </Button>
        </div>
      </section>

      <section className="px-6 pb-20 md:pb-28 max-w-3xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-center mb-10">Questions readers ask</h2>
        <div className="flex flex-col gap-3">
          {faqs.map(({ question, answer }) => (
            <details key={question} className={`group px-6 py-5 ${cardClassName}`}>
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-semibold [&::-webkit-details-marker]:hidden">
                {question}
                <TbChevronDown size={20} aria-hidden className="shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <p className={`text-sm md:text-base mt-3 ${mutedClassName}`}>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="flex flex-col items-center text-center px-6 py-16 md:py-24 border-t border-neutral-200 dark:border-neutral-800">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Your next book is waiting</h2>
        <p className={`text-base md:text-lg mt-4 max-w-md ${mutedClassName}`}>
          Create a free account and log the book you&apos;re reading right now.
        </p>
        <Button asChild className={`${ctaClassName} mt-8`}>
          <Link href="/register">Start your shelf — it&apos;s free</Link>
        </Button>
      </section>
    </div>
  )
}

export default Landing
