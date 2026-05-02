'use client'

export default function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg
      className="animate-spin text-hm-nav"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
      />
    </svg>
  )
}

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <Spinner size={28} />
    </div>
  )
}
