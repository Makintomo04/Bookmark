// Shared SWR fetcher. Non-2xx responses throw, so SWR reports them through `error`
// rather than handing `{ error: "..." }` bodies to components as if they were data.
export class FetchError extends Error {
  status: number
  info: unknown

  constructor(status: number, info: unknown) {
    const message = info && typeof info === "object" && "error" in info && typeof info.error === "string"
      ? info.error
      : `Request failed with status ${status}`
    super(message)
    this.status = status
    this.info = info
  }
}

// Returns `any` like the inline fetchers it replaces, so hooks without a type argument keep their loose typing.
export async function fetcher(url: string): Promise<any> {
  const res = await fetch(url)
  if (!res.ok) {
    const info = await res.json().catch(() => null)
    throw new FetchError(res.status, info)
  }
  return res.json()
}

export const isUnauthorized = (error: unknown) => error instanceof FetchError && error.status === 401

// Retrying a 401 or 404 won't change the answer, so only retry server and network errors.
export const swrOptions = {
  shouldRetryOnError: (error: unknown) => !(error instanceof FetchError && error.status >= 400 && error.status < 500),
}
