'use client'

// Bordered card that can be in one of three states: idle, hovered,
// selected. Used for the payment-processor cards, merge-keep choices, and
// any pick-one-of-two flow. Use as a `<button>` for click-to-select or
// just as a `<div>` for layout (`as="div"`).

import { forwardRef } from 'react'

type CommonProps = {
  selected?: boolean
  className?: string
  children: React.ReactNode
}

type AsButton = CommonProps & {
  as?: 'button'
} & React.ButtonHTMLAttributes<HTMLButtonElement>

type AsDiv = CommonProps & {
  as: 'div'
} & React.HTMLAttributes<HTMLDivElement>

export type SelectableCardProps = AsButton | AsDiv

const SelectableCard = forwardRef<
  HTMLButtonElement | HTMLDivElement,
  SelectableCardProps
>(function SelectableCard({ selected, className = '', children, ...rest }, ref) {
  const base = [
    'border rounded p-5 text-left transition-colors duration-150 ease-out-soft',
    selected
      ? 'border-accent bg-accent-soft/40'
      : 'border-line hover:border-line-strong',
    className,
  ].join(' ')

  if ((rest as AsDiv).as === 'div') {
    const { as: _ignore, ...divRest } = rest as AsDiv
    return (
      <div
        ref={ref as React.Ref<HTMLDivElement>}
        className={base}
        aria-pressed={selected}
        {...divRest}
      >
        {children}
      </div>
    )
  }

  const { as: _ignore, ...btnRest } = rest as AsButton
  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      type="button"
      className={base + ' focus-ring'}
      aria-pressed={selected}
      {...btnRest}
    >
      {children}
    </button>
  )
})

export default SelectableCard
