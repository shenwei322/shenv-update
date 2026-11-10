import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import gsap from 'gsap'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { prefersReducedMotion } from '../lib/gsap'
import { dismissToast, getToasts, subscribeToasts, type ToastItem } from '../lib/toast'

const ICONS = {
  success: CircleCheck,
  error: CircleAlert,
  info: Info,
}

function ToastCard({ item }: { item: ToastItem }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const Icon = ICONS[item.kind]

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    if (prefersReducedMotion()) {
      gsap.set(element, { opacity: 1, x: 0, y: 0 })
      return
    }
    const tween = gsap.fromTo(
      element,
      { opacity: 0, x: 24, y: -6 },
      { opacity: 1, x: 0, y: 0, duration: 0.26, ease: 'power2.out' },
    )
    return () => {
      tween.kill()
    }
  }, [])

  useEffect(() => {
    const element = ref.current
    const timer = window.setTimeout(() => {
      if (!element || prefersReducedMotion()) {
        dismissToast(item.id)
        return
      }
      gsap.to(element, {
        opacity: 0,
        x: 20,
        duration: 0.2,
        ease: 'power2.in',
        onComplete: () => dismissToast(item.id),
      })
    }, 3800)
    return () => window.clearTimeout(timer)
  }, [item.id])

  return (
    <div className={`toast toast-${item.kind}`} ref={ref} role="alert">
      <Icon size={18} />
      <p className="toast-text">{item.message}</p>
      <button
        type="button"
        className="toast-close"
        aria-label="关闭提示"
        onClick={() => dismissToast(item.id)}
      >
        <X size={14} />
      </button>
    </div>
  )
}

export function ToastHost() {
  const items = useSyncExternalStore(subscribeToasts, getToasts)
  return (
    <div className="toast-host" aria-live="polite">
      {items.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  )
}
