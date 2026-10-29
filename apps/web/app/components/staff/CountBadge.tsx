// A small count on a tab or menu link, in the notification bell's style. The label is for screen readers.
const CountBadge = ({ count, label }: { count: number, label: string }) => (
  <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-fill px-[5px] text-[10px] font-bold leading-none tabular-nums text-white">
    <span aria-hidden>{count > 99 ? '99+' : count}</span>
    <span className="sr-only">, {label}</span>
  </span>
)

export default CountBadge
