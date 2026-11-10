import { useLayoutEffect, useRef } from 'react'
import { countUpElement } from '../lib/gsap'
import { formatCount } from '../lib/format'

interface CountUpProps {
  value: number
}

export function CountUp({ value }: CountUpProps) {
  const ref = useRef<HTMLSpanElement | null>(null)

  useLayoutEffect(() => countUpElement(ref.current, value, formatCount), [value])

  return <span ref={ref}>{formatCount(value)}</span>
}
