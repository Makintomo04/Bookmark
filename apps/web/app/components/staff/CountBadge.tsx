// A small count on a tab or menu link, in the notification bell's style. The label is for screen readers.
const CountBadge = ({ count, label }: { count: number, label: string }) => (
  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-fill px-1 text-[11px] font-semibold leading-none tabular-nums text-white">
    <span aria-hidden>{count > 99 ? '99+' : count}</span>
    <span className="sr-only">, {label}</span>
  </span>
)

export default CountBadge
