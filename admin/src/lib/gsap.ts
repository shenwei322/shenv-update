import { useLayoutEffect, type RefObject } from 'react'
import gsap from 'gsap'

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function usePageEnter(ref: RefObject<HTMLElement | null>, key: unknown): void {
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    gsap.killTweensOf(element)
    if (prefersReducedMotion()) {
      gsap.set(element, { opacity: 1, y: 0 })
      return
    }
    const tween = gsap.fromTo(
      element,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' },
    )
    return () => {
      tween.kill()
    }
  }, [ref, key])
}

export function useStaggerIn(ref: RefObject<HTMLElement | null>, key: unknown): void {
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-stagger]'))
    if (!targets.length) return
    if (prefersReducedMotion()) {
      gsap.set(targets, { opacity: 1, y: 0 })
      return
    }
    const tween = gsap.fromTo(
      targets,
      { opacity: 0, y: 12 },
      {
        opacity: 1,
        y: 0,
        duration: 0.28,
        stagger: 0.045,
        ease: 'power2.out',
        overwrite: true,
        clearProps: 'transform',
      },
    )
    return () => {
      tween.kill()
    }
  }, [ref, key])
}

export function useBarGrow(ref: RefObject<HTMLElement | null>, key: unknown): void {
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const bars = Array.from(root.querySelectorAll<HTMLElement>('[data-bar]'))
    if (!bars.length) return
    if (prefersReducedMotion()) {
      gsap.set(bars, { scaleY: 1 })
      return
    }
    const tween = gsap.fromTo(
      bars,
      { scaleY: 0 },
      {
        scaleY: 1,
        transformOrigin: 'bottom center',
        duration: 0.55,
        stagger: 0.02,
        ease: 'power3.out',
        overwrite: true,
      },
    )
    return () => {
      tween.kill()
    }
  }, [ref, key])
}

export function countUpElement(
  element: HTMLElement | null,
  value: number,
  format: (input: number) => string,
): () => void {
  if (!element) return () => undefined
  if (prefersReducedMotion()) {
    element.textContent = format(value)
    return () => undefined
  }
  const state = { value: 0 }
  element.textContent = format(0)
  const tween = gsap.to(state, {
    value,
    duration: 0.9,
    ease: 'power2.out',
    onUpdate: () => {
      element.textContent = format(state.value)
    },
  })
  return () => {
    tween.kill()
  }
}

export function shakeElement(element: HTMLElement | null): void {
  if (!element || prefersReducedMotion()) return
  const timeline = gsap.timeline()
  timeline
    .to(element, { x: -9, duration: 0.06, ease: 'power2.out' })
    .to(element, { x: 8, duration: 0.07, ease: 'power2.inOut' })
    .to(element, { x: -6, duration: 0.07, ease: 'power2.inOut' })
    .to(element, { x: 4, duration: 0.06, ease: 'power2.inOut' })
    .to(element, { x: -2, duration: 0.05, ease: 'power2.inOut' })
    .to(element, { x: 0, duration: 0.08, ease: 'power2.out' })
}

export function pulseElement(element: HTMLElement | null): void {
  if (!element || prefersReducedMotion()) return
  gsap.fromTo(element, { scale: 0.97 }, { scale: 1, duration: 0.34, ease: 'back.out(2)' })
}
