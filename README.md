This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Error monitoring

Errors from the web server, the browser and the phone app go to Sentry, with personal data stripped first.
It's off unless these are set (on Vercel for the web, as EAS environment variables for the phone app). Never
commit the auth token. Setup, alerts and how to check it works: [`docs/ops/error-monitoring.md`](docs/ops/error-monitoring.md).

| Variable | Where | What it's for |
| --- | --- | --- |
| `NEXT_PUBLIC_SENTRY_DSN` | Vercel | The web project's DSN. Public |
| `EXPO_PUBLIC_SENTRY_DSN` | EAS | The mobile project's DSN. Public |
| `SENTRY_ORG`, `SENTRY_PROJECT` | Vercel and EAS | Which project source maps upload to (`bookmark-web`, `bookmark-mobile`) |
| `SENTRY_AUTH_TOKEN` | Vercel and EAS | **Secret.** Uploads source maps during builds |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | Vercel, optional | Share of requests traced for the 5xx alert (default 0.1 in production) |

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.
