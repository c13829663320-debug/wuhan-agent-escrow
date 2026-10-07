import type { ButtonHTMLAttributes, HTMLAttributes, PointerEvent } from 'react'
import './Glass.css'

function followLight(event: PointerEvent<HTMLElement>) {
  if (event.pointerType === 'touch') return
  const rect = event.currentTarget.getBoundingClientRect()
  event.currentTarget.style.setProperty('--light-x', `${((event.clientX - rect.left) / rect.width) * 100}%`)
  event.currentTarget.style.setProperty('--light-y', `${((event.clientY - rect.top) / rect.height) * 100}%`)
}

/** 液态玻璃卡片：浅色拟态 + 边缘高光 + 跟随鼠标的径向高光。 */
export function Glass({ children, className = '', onPointerMove, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={`glass-surface ${className}`}
      onPointerMove={event => {
        followLight(event)
        onPointerMove?.(event)
      }}
    >
      <span className="glass-edge" aria-hidden="true" />
      {children}
    </div>
  )
}

export function GlassButton({
  children,
  className = '',
  onPointerMove,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      type={type}
      className={`glass-surface glass-button ${className}`}
      onPointerMove={event => {
        followLight(event)
        onPointerMove?.(event)
      }}
    >
      <span className="glass-edge" aria-hidden="true" />
      {children}
    </button>
  )
}
