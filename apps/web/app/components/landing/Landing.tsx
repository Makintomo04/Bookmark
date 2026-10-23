import Image from 'next/image'
import Link from 'next/link'
import { FC } from 'react'
import { Button } from '../ui/button'
import {
  ArrowRight,
  BarChart3,
  ChevronDown,
  FileInput,
  Flame,
  Headphones,
  Lock,
  NotebookPen,
  Rss,
  Sparkles,
  Users,
} from 'lucide-react'

// Every claim here has to match something the app really does: no invented
// reader counts or testimonials. Add social proof once there are real numbers.
// The pitch is one app instead of two: readers keep one app for their stats and
// another for their friends. Tracking and reading together get equal space, and
// reading circles are the proof that the friends half is more than a feed.
// Don't claim spoiler-locked comments are unique: StoryGraph's buddy reads have them too.

const tracking = [
  {
    icon: BarChart3,
    title: "Stats you'll actually look at",
    description: "Books and pages by year, how you rate, and your top genres and authors, filled in as you finish each book.",
  },
  {
    icon: Flame,
    title: "Goals and streaks",
    description: "Set a goal for the year and watch it fill. Read a page a day to keep your streak, and pick up milestones along the way.",
  },
  {
    icon: NotebookPen,
    title: "Notes and quotes",
    description: "Keep the lines you underlined and the thoughts you had, with each book they came from.",
  },
  {
    icon: Headphones,
    title: "Audiobooks count",
    description: "Log an audiobook by minutes and it counts towards your stats and your goal like any other book.",
  },
]

const together = [
  {
    icon: Lock,
    title: "Reading circles where nobody gets spoiled",
    description: "A private chat for one book. Every comment is pinned to where its writer was, and stays locked until you've read that far.",
  },
  {
    icon: Users,
    title: "One link, any edition",
    description: "Friends join with their own copy, paperback, Kindle or audiobook, and don't need an account to open the invite.",
  },
  {
    icon: Rss,
    title: "See what your friends are reading",
    description: "Follow friends, see what they've started and finished in your feed, and send them a book you think they'd like.",
  },
]

const steps = [
  {
    title: "Bring your history",
    description: "Import your shelves, ratings, reviews and reading dates from Goodreads or StoryGraph in about a minute.",
  },
  {
    title: "Update once",
    description: "Log your page, or your minutes for an audiobook. Your stats, goal and streak move, and so does your place in every reading circle you're in.",
  },
  {
    title: "Bring your friends",
    description: "Follow the friends already here, or start a reading circle from any book on your shelf and share the link.",
  },
]

const faqs = [
  {
    question: "Is Bookmark really free?",
    answer: "Yes. Tracking, import, every stat, Wrapped, reading circles and export are free, and joining a circle is never limited. The free plan hosts one active circle at a time; the optional Plus plan lets you host more.",
  },
  {
    question: "How is Bookmark different from Goodreads and StoryGraph?",
    answer: "Lots of readers keep Goodreads because their friends are there and StoryGraph for its stats, and log every book in both. Bookmark does both jobs in one place: free stats, goals and Wrapped, alongside friends, a feed and private reading circles. Your friends don't have to move first, because anyone can open a reading circle invite without an account.",
  },
  {
    question: "Can I bring my Goodreads or StoryGraph history?",
    answer: "Yes, from either or both. Import your shelves, ratings, reviews and reading dates in about a minute, right after you sign up. Books already on your shelf are skipped, and you can export everything again whenever you like.",
  },
  {
    question: "None of my friends use Bookmark. Does that matter?",
    answer: "No. Bookmark works as a tracker on its own, and when you want to read with someone, send them a reading circle link. They can open the invite without an account, and signing up takes them straight into your circle.",
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
    question: "Who can see my shelf?",
    answer: "Your profile has its own public link, so friends can see what you're reading and follow you. Reading circles are private to their members.",
  },
]

const ctaClassName = "bg-brand-fill hover:bg-brand-fill-hover text-white h-12 px-7 text-base font-semibold w-full sm:w-auto"
const cardClassName = "rounded-[20px] border border-neutral-200 dark:border-neutral-800"
const mutedClassName = "text-neutral-600 dark:text-neutral-300/90"

// Stills of the two halves of the app, side by side in the hero: a year of tracking, then a circle.
const TrackerStill: FC = () => (
  <div className={`w-full p-5 text-left ${cardClassName} bg-background shadow-sm`} aria-hidden>
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your year</p>
    <div className="mt-3 grid grid-cols-3 gap-3">
      {[["31", "books"], ["9,840", "pages"], ["12", "day streak"]].map(([value, label]) => (
        <div key={label}>
          <p className="font-display text-2xl font-semibold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      ))}
    </div>
    <div className="mt-4">
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>Goal: 40 books</span><span>31 of 40</span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div className="h-full w-[77.5%] rounded-full bg-brand-fill" />
      </div>
    </div>
  </div>
)

const readers = [
  { name: "you", at: 42, colour: "#D92D2D" },
  { name: "Sam", at: 67, colour: "#2F80ED" },
  { name: "Priya", at: 24, colour: "#27AE60" },
]

const CircleStill: FC = () => (
  <div className={`w-full p-5 text-left ${cardClassName} bg-background shadow-sm`} aria-hidden>
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
    <div className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm text-muted-foreground">
      <Lock size={16} aria-hidden className="shrink-0" />
      2 comments ahead at <span className="font-semibold tabular-nums text-foreground">67%</span>
    </div>
  </div>
)

const FeatureCard: FC<{ icon: typeof Lock; title: string; description: string }> = ({ icon: Icon, title, description }) => (
  <div className={`flex flex-col items-start gap-3 p-6 ${cardClassName}`}>
    <div className="h-12 w-12 rounded-full bg-brand/10 flex items-center justify-center">
      <Icon size={24} className="text-brand" />
    </div>
    <h3 className="text-lg font-bold">{title}</h3>
    <p className={`text-sm ${mutedClassName}`}>{description}</p>
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
            {/* Names the habit the page is for, so readers who keep both apps recognise themselves at once. */}
            <p className="text-sm font-semibold text-brand-fill dark:text-brand mb-3">
              Goodreads for friends, StoryGraph for stats?
            </p>
            <h1 className="display-hero max-w-3xl">
              Your reading and your friends, in one app.
            </h1>
            <p className={`text-base md:text-lg mt-5 max-w-xl ${mutedClassName}`}>
              Stop logging every book twice. Bookmark tracks every book with free stats, goals and streaks, and lets you read the next one with friends in a private reading circle.
            </p>
            <Button asChild className={`${ctaClassName} mt-8`}>
              <Link href="/register">Start reading free</Link>
            </Button>
            <p className={`text-sm mt-4 ${mutedClassName}`}>
              No card needed. Import from Goodreads, StoryGraph, or both, in about a minute.
            </p>
          </div>
          <div className="flex flex-col gap-4 w-full max-w-md mx-auto lg:mr-0">
            <TrackerStill />
            <div className="sm:ml-10"><CircleStill /></div>
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
            <h2 className="text-lg md:text-xl font-bold">Using both? Bring both.</h2>
            <p className={`text-sm md:text-base mt-1 ${mutedClassName}`}>
              Import your shelves, ratings, reviews and reading dates from Goodreads and StoryGraph. Books already on your shelf are skipped, so nothing doubles up, and you can export it all again any time.
            </p>
          </div>
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-fill dark:text-brand hover:underline shrink-0"
          >
            Import my history <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </section>

      <section className="px-6 pt-20 md:pt-28 max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-12 md:mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Everything you track on your own</h2>
          <p className={`text-base md:text-lg mt-4 ${mutedClassName}`}>
            Log a book, update your page, and the rest fills itself in. Every stat is free, and stays free.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {tracking.map((f) => <FeatureCard key={f.title} {...f} />)}
        </div>
        <div className={`mt-6 p-6 md:p-8 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 ${cardClassName}`}>
          <div className="h-12 w-12 shrink-0 rounded-full bg-brand/10 flex items-center justify-center">
            <Sparkles size={24} className="text-brand" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Your year, wrapped</h3>
            <p className={`text-sm md:text-base mt-1 ${mutedClassName}`}>
              Every December, a look back at what you read, how much and what you loved, ready to share. Free, like everything above.
            </p>
          </div>
        </div>
      </section>

      <section className="px-6 py-20 md:py-28 max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-12 md:mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">And the friends you read with</h2>
          <p className={`text-base md:text-lg mt-4 ${mutedClassName}`}>
            React to the twist the moment it happens. Friends who are behind see only that you said something, not what.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {together.map((f) => <FeatureCard key={f.title} {...f} />)}
        </div>
      </section>

      <section className="px-6 pb-20 md:pb-28 max-w-5xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-center mb-12">From two apps to one</h2>
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
            <Link href="/register">Start reading free</Link>
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
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Bring your shelf. Bring your friends.</h2>
        <p className={`text-base md:text-lg mt-4 max-w-md ${mutedClassName}`}>
          Import your history, start a reading circle, and send the link to whoever&apos;s reading with you.
        </p>
        <Button asChild className={`${ctaClassName} mt-8`}>
          <Link href="/register">Start reading free</Link>
        </Button>
      </section>
    </div>
  )
}

export default Landing
