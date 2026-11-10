import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { prefersReducedMotion } from '../lib/gsap'

interface SkeletonProps {
  rows?: number
}

export function Skeleton({ rows = 3 }: SkeletonProps) {
  const ref = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || prefersReducedMotion()) return
    const tween = gsap.to(element, {
      opacity: 0.45,
      repeat: -1,
      yoyo: true,
      duration: 0.9,
      ease: 'sine.inOut',
    })
    return () => {
      tween.kill()
    }
  }, [])

  return (
    <div className="skeleton" ref={ref} aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <span className="skeleton-bar" key={index} />
      ))}
    </div>
  )
}
