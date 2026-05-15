import { useEffect, useState } from 'react'

type ToastNotification = {
  message: string
  type: 'success' | 'error'
  seq: number
}

type Props = {
  notification: ToastNotification | null
}

export default function HfToast({ notification }: Props) {
  const [visible, setVisible] = useState(false)
  const [current, setCurrent] = useState<ToastNotification | null>(null)

  useEffect(() => {
    if (!notification) return
    setCurrent(notification)
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), 3200)
    return () => clearTimeout(timer)
  }, [notification?.seq]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!current) return null

  return (
    <div
      className={`hf-toast hf-toast--${current.type}${visible ? ' hf-toast--visible' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="hf-toast-dot" aria-hidden />
      {current.message}
    </div>
  )
}
