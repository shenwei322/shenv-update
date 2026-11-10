import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import gsap from 'gsap'
import {
  CircleAlert,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  RefreshCw,
  User,
} from 'lucide-react'
import { api, errorMessage } from '../lib/api'
import type { Captcha } from '../lib/types'
import { prefersReducedMotion, shakeElement } from '../lib/gsap'
import { toast } from '../lib/toast'

interface LoginPageProps {
  siteName: string
  onSuccess: (result: { token: string; username: string }) => void
}

export function LoginPage({ siteName, onSuccess }: LoginPageProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const captchaRef = useRef<HTMLButtonElement | null>(null)

  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [captcha, setCaptcha] = useState<Captcha | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-login-item]'))
    if (!items.length) return
    if (prefersReducedMotion()) {
      gsap.set(items, { opacity: 1, y: 0 })
      return
    }
    const tween = gsap.fromTo(
      items,
      { opacity: 0, y: 18 },
      {
        opacity: 1,
        y: 0,
        duration: 0.45,
        stagger: 0.08,
        ease: 'power3.out',
        clearProps: 'transform',
      },
    )
    return () => {
      tween.kill()
    }
  }, [])

  const loadCaptcha = useCallback(async () => {
    try {
      const data = await api.captcha()
      setCaptcha(data)
      setCaptchaAnswer('')
    } catch (caught) {
      toast.error(errorMessage(caught))
    }
  }, [])

  useEffect(() => {
    void loadCaptcha()
  }, [loadCaptcha])

  const refreshCaptcha = useCallback(() => {
    const box = captchaRef.current
    if (box && !prefersReducedMotion()) {
      gsap.fromTo(box, { rotate: -8 }, { rotate: 0, duration: 0.35, ease: 'power3.out' })
    }
    void loadCaptcha()
  }, [loadCaptcha])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (loading) return

    const name = username.trim()
    if (!name || !password) {
      setError('请输入账号与密码')
      return
    }
    if (!captcha) {
      setError('验证码还在加载，请稍候重试')
      void loadCaptcha()
      return
    }
    if (!captchaAnswer.trim()) {
      setError('请输入人机验证码')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await api.login({
        username: name,
        password,
        captchaId: captcha.id,
        captchaAnswer: captchaAnswer.trim(),
      })
      onSuccess({ token: result.token, username: result.username || name })
    } catch (caught) {
      setError(errorMessage(caught))
      void loadCaptcha()
      shakeElement(cardRef.current)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login" ref={rootRef}>
      <section className="login-card" ref={cardRef} data-login-item>
        <header className="login-card-head">
          <p className="login-eyebrow">Turf Launcher</p>
          <h2>{siteName}</h2>
          <p>管理员登录 · 同 IP 连续失败 5 次将锁定 10 分钟。</p>
        </header>

        <form className="login-form" onSubmit={submit} noValidate>
          <div className="field">
            <label className="field-label" htmlFor="login-username">
              账号
            </label>
            <div className="input-affix">
              <User size={16} className="input-icon" />
              <input
                id="login-username"
                className="input"
                value={username}
                autoComplete="username"
                autoFocus
                onChange={(event) => setUsername(event.target.value)}
                placeholder="admin"
              />
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="login-password">
              密码
            </label>
            <div className="input-affix has-action">
              <Lock size={16} className="input-icon" />
              <input
                id="login-password"
                className="input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="输入登录密码"
              />
              <button
                type="button"
                className="input-action"
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="login-captcha">
              人机验证码
            </label>
            <div className="captcha-row">
              <div className="input-affix">
                <KeyRound size={16} className="input-icon" />
                <input
                  id="login-captcha"
                  className="input"
                  value={captchaAnswer}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setCaptchaAnswer(event.target.value)}
                  placeholder="输入图中字符"
                />
              </div>
              <button
                type="button"
                ref={captchaRef}
                className="captcha-box"
                aria-label="点击刷新验证码"
                title="点击刷新验证码"
                onClick={refreshCaptcha}
              >
                {captcha ? (
                  <span className="captcha-svg" dangerouslySetInnerHTML={{ __html: captcha.svg }} />
                ) : (
                  <span className="captcha-placeholder">
                    <RefreshCw size={16} />
                    加载中
                  </span>
                )}
              </button>
            </div>
          </div>

          {error ? (
            <p className="form-error" role="alert">
              <CircleAlert size={16} />
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? '登录中…' : '登录'}
          </button>
        </form>
      </section>
    </div>
  )
}
