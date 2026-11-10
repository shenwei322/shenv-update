import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { prefersReducedMotion } from '../lib/gsap'

interface SwitchProps {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label: string
}

const TRAVEL = 16

export function Switch({ checked, onChange, disabled = false, label }: SwitchProps) {
  const knobRef = useRef<HTMLSpanElement | null>(null)
  const initialized = useRef(false)

  useLayoutEffect(() => {
    const knob = knobRef.current
    if (!knob) return
    const x = checked ? TRAVEL : 0
    if (!initialized.current || prefersReducedMotion()) {
      gsap.set(knob, { x })
      initialized.current = true
      return
    }
    const tween = gsap.to(knob, { x, duration: 0.18, ease: 'power2.out' })
    return () => {
      tween.kill()
    }
  }, [checked])

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={checked ? 'switch is-on' : 'switch'}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" ref={knobRef} />
    </button>
  )
}
