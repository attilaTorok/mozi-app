interface Props {
  value: number
  /** When provided the stars become clickable (clicking the active star clears the rating). */
  onChange?: (value: number) => void
}

export default function RatingStars({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-0.5" role={onChange ? 'radiogroup' : 'img'} aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value
        const star = (
          <span className={filled ? 'text-primary' : 'text-line'} aria-hidden>
            ★
          </span>
        )
        if (!onChange) return <span key={n}>{star}</span>
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === value}
            aria-label={`${n}`}
            className="flex h-11 w-9 items-center justify-center text-2xl"
            onClick={() => onChange(n === value ? 0 : n)}
          >
            {star}
          </button>
        )
      })}
    </div>
  )
}

