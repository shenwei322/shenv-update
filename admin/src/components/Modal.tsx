import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import gsap from 'gsap'
import { X } from 'lucide-react'
import { prefersReducedMotion } from '../lib/gsap'

interface ModalProps {
  title: string
  subtitle?: string
  icon?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}

export function Modal({ title, subtitle, icon, onClose, children, footer, width = 640 }: ModalProps) {
  const layerRef = useRef<HTMLDivElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const closingRef = useRef(false)

  useLayoutEffect(() => {
    const layer = layerRef.current
    const dialog = dialogRef.current
    if (!layer || !dialog) return
    dialog.focus()
    if (prefersReducedMotion()) {
      gsap.set([layer, dialog], { opacity: 1 })
      gsap.set(dialog, { y: 0, scale: 1 })
      return
    }
    const timeline = gsap.timeline()
    timeline.fromTo(layer, { opacity: 0 }, { opacity: 1, duration: 0.18, ease: 'power2.out' }, 0)
    timeline.fromTo(
      dialog,
      { opacity: 0, y: 14, scale: 0.97 },
      { opacity: 1, y: 0, scale: 1, duration: 0.26, ease: 'power3.out' },
      0,
    )
    return () => {
      timeline.kill()
    }
  }, [])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const requestClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    const layer = layerRef.current
    const dialog = dialogRef.current
    if (!layer || !dialog || prefersReducedMotion()) {
      onClose()
      return
    }
    const timeline = gsap.timeline({ onComplete: onClose })
    timeline.to(dialog, { opacity: 0, y: 10, scale: 0.98, duration: 0.16, ease: 'power2.in' }, 0)
    timeline.to(layer, { opacity: 0, duration: 0.18, ease: 'power2.in' }, 0)
  }, [onClose])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [requestClose])

  const handleLayerClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) requestClose()
  }

  return createPortal(
    <div className="modal-layer" ref={layerRef} onClick={handleLayerClick}>
      <div
        className="modal-card"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{ maxWidth: `${width}px` }}
      >
        <div className="modal-head">
          <div className="modal-head-main">
            {icon ? <span className="modal-icon">{icon}</span> : null}
            <div className="modal-head-text">
              <h2 className="modal-title">{title}</h2>
              {subtitle ? <p className="modal-subtitle">{subtitle}</p> : null}
            </div>
          </div>
          <button type="button" className="icon-btn" aria-label="关闭弹窗" onClick={requestClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}
