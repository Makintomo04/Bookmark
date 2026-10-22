import Image from 'next/image'
import Link from 'next/link'
import { FC } from 'react'
import { Button } from '../ui/button'
import {
  ArrowRight,
  ChevronDown,
  FileInput,
  Headphones,
  Lock,
  Users,
} from 'lucide-react'

// Every claim here has to match something the app really does: no invented
// reader counts or testimonials. Add social proof once there are real numbers.
// The cards sell reading together; solo tracking gets one line, so the page
// doesn't read like another tracker.

const features = [
  {
    icon: Lock,
    title: "Nobody gets spoiled",
    description: "Every comment in a reading circle is pinned to where its writer was in the book. You see it only once you've read that far. Your own are always open.",
  },
  {
    icon: Users,
    title: "One link, any edition",
    description: "Share an invite link and friends join with their own copy. Paperback, Kindle or audiobook, you'll always know who's ahead.",
  },
  {
    icon: Headphones,
    title: "Audiobooks count",
    description: "Listening counts as reading. Log an audiobook by minutes and it sits in the circle, your stats and your goal like any other book.",
  },
]

const steps = [
  {
    title: "Pick the book",
    description: "Search for it, or bring it over from Goodreads or StoryGraph.",
  },
  {
    title: "Start a reading circle and share the link",
    description: "One tap on the book page. Your friends don't need to be on Bookmark yet: anyone can open the invite, and a quick sign-up drops them straight into the circle.",
  },
  {
    title: "Read, and talk as you go",
    description: "Post at the point you've reached. Everyone sees where the others are, and comments ahead of you stay locked until you catch up.",
  },
]

const faqs = [
  {
    question: "Is Bookmark really free?",
    answer: "Yes. Tracking, import, every stat, reading circles, Wrapped and export are free, and joining a circle is never limited. An optional Plus plan adds extras, such as hosting more than one circle at a time.",
  },
  {
    question: "None of my friends use Bookmark. Does that matter?",
    answer: "No. Send them the link anyway. They can open the invite without an account, and signing up takes them straight into your circle.",
  },
  {
    question: "How do spoilers stay hidden in a reading circle?",
    answer: "Each comment is locked to the percent its writer had reached. Until your own progress passes that point, you see only that something is there, not what it says.",
  },
  {
    question: "Do we all need the same edition?",
    answer: "No. Everyone reads their own copy, and progress is tracked as a percent of it. A friend on the audiobook sees the same track as one on the paperback.",
  },
  {
    question: "Can I bring my Goodreads or StoryGraph history?",
    answer: "Yes. Import your shelves, ratings, reviews and reading dates in about a minute, right after you sign up.",
  },
  {

    question: "Who can see my shelf?",
    answer: "Your profile has its own public link, so friends can see what you're reading and follow you. Reading circles are private to their members.",
  },
]

const ctaClassName = "bg-brand-fill hover:bg-brand-fill-hover text-white h-12 px-7 text-base font-semibold w-full sm:w-auto"
const cardClassName = "rounded-[20px] border border-neutral-200 dark:border-neutral-800"
const mutedClassName = "text-neutral-600 dark:text-neutral-300/90"

// A still of what a circle looks like: three readers on one track, a locked comment ahead.
const readers = [
  { name: "you", at: 42, colour: "#D92D2D" },
  { name: "Sam", at: 67, colour: "#2F80ED" },
  { name: "Priya", at: 24, colour: "#27AE60" },
]

const CircleStill: FC = () => (
  <div className={`w-full max-w-md p-5 text-left ${cardClassName} bg-background shadow-sm`} aria-hidden>
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reading circle</p>
        <p className="font-bold truncate">The Night We Read Together</p>
      </div>
      <span className="shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 text-xs font-medium">3 readers</span>
    </div>
    <ul className="mt-4 flex flex-col gap-2.5">
      {readers.map((r) => (
        <li key={r.name} className="grid grid-cols-[52px_1fr_40px] items-center gap-3 text-sm">
          <span className="truncate font-medium">{r.name}</span>
          <span className="relative h-2 rounded-full bg-neutral-200 dark:bg-neutral-800">
            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${r.at}%`, background: r.colour }} />
          </span>
          <span className="text-right tabular-nums text-muted-foreground">{r.at}%</span>
        </li>
      ))}
    </ul>
    <div className="mt-4 flex flex-col gap-2">
      <div className="rounded-xl bg-neutral-100 dark:bg-neutral-900 px-3 py-2 text-sm">
        <p className="text-xs text-muted-foreground">Priya · at 24%</p>
        <p>Okay the letter in chapter 6. I had to put it down for a minute.</p>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm text-muted-foreground">
        <Lock size={16} aria-hidden className="shrink-0" />
        2 comments ahead at <span className="font-semibold tabular-nums text-foreground">67%</span>
      </div>
    </div>
  </div>
)

const Landing: FC = () => {
  return (
    <div className="w-full">
      {/* Hero: one promise, one action. Sign in already lives in the header. */}
      <section className="px-6 pt-12 pb-16 md:pt-20 md:pb-24 max-w-6xl mx-auto">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <Image src="/logo.svg" width={48} height={48} alt="Bookmark logo" className="mb-6" />
            <h1 className="display-hero max-w-3xl">
              Read with your friends.<br className="hidden sm:block" /> Nobody gets spoiled.
            </h1>
            <p className={`text-base md:text-lg mt-5 max-w-xl ${mutedClassName}`}>
              The group chat for your book, minus the &lsquo;don&apos;t read past chapter 12&rsquo;. Everyone reads at their own pace, and comments stay hidden until you catch up.
            </p>
            <Button asChild className={`${ctaClassName} mt-8`}>
              <Link href="/register">Start a reading circle — it&apos;s free</Link>
            </Button>
            <p className={`text-sm mt-4 ${mutedClassName}`}>
              Paperback, ebook or audiobook: everyone reads their own copy.
            </p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <CircleStill />
          </div>
        </div>
      </section>

      {/* Switching is the biggest hurdle for anyone who already tracks their reading elsewhere. */}
      <section className="px-6">
        <div className={`max-w-5xl mx-auto p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-5 md:gap-8 ${cardClassName}`}>
          <div className="h-12 w-12 shrink-0 rounded-full bg-brand/10 flex items-center justify-center">
            <FileInput size={24} className="text-brand" />
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
            Sign up and import <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </section>

      <section className="px-6 py-20 md:py-28 max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-12 md:mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Talk about the book without ruining it</h2>
          <p className={`text-base md:text-lg mt-4 ${mutedClassName}`}>
            A reading circle is a private chat for one book, where everyone&apos;s place in the story is shown.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
        <p className={`mt-10 text-center text-sm md:text-base max-w-2xl mx-auto ${mutedClassName}`}>
          It&apos;s still the tracker you&apos;d use on your own, too: goals, stats, notes, quotes and a Wrapped at the end of the year, all free.
        </p>
      </section>

      <section className="px-6 pb-20 md:pb-28 max-w-5xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-center mb-12">A reading circle in three steps</h2>
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
            <Link href="/register">Start a reading circle — it&apos;s free</Link>
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
                <ChevronDown size={20} aria-hidden className="shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <p className={`text-sm md:text-base mt-3 ${mutedClassName}`}>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="flex flex-col items-center text-center px-6 py-16 md:py-24 border-t border-neutral-200 dark:border-neutral-800">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Your friends are waiting on chapter one</h2>
        <p className={`text-base md:text-lg mt-4 max-w-md ${mutedClassName}`}>
          Create a free account, pick the book, and send one link.
        </p>
        <Button asChild className={`${ctaClassName} mt-8`}>
          <Link href="/register">Start a reading circle — it&apos;s free</Link>
        </Button>
      </section>
    </div>
  )
}

export default Landing
