import { cn } from '@/lib/utils/cn'

/** The product mark: a shield with a closed loop and a check, drawn in currentColor on an accent tile. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-md bg-linear-to-br from-[#3d6bff] to-[#1a3fb8] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[62%]">
        <path
          d="M12 2.75 4.75 5.5v5.62c0 4.6 3.05 8.62 7.25 10.13 4.2-1.51 7.25-5.53 7.25-10.13V5.5L12 2.75Z"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinejoin="round"
        />
        <path
          d="m8.6 12.1 2.4 2.4 4.6-4.8"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}
