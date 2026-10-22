import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

/** Shared dialog shell. The native top layer traps focus and makes the page inert.
 * The caller owns open/closed state; busy prevents dismissal while a write is pending.
 */
export function Modal({
  title,
  description,
  onClose,
  busy = false,
  wide = false,
  children,
}: {
  title: string
  description?: string
  onClose: () => void
  busy?: boolean
  wide?: boolean
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  // Capture the opener before showModal moves focus; restore it after cancel/close.
  const previousActive = useRef<HTMLElement | null>(
    document.activeElement as HTMLElement | null,
  )
  // Per-instance IDs connect the dialog's accessible name/description without collisions.
  const titleId = useId()
  const descriptionId = useId()
  useEffect(() => {
    const previous = previousActive.current
    const dialog = ref.current
    dialog?.showModal()
    return () => {
      dialog?.close()
      // Refreshing after a conflict can replace the opener's row. Never focus a detached node.
      if (previous?.isConnected) previous.focus()
      else document.querySelector<HTMLElement>('#main-content')?.focus()
    }
  }, [])
  // A body portal avoids clipping/stacking contexts from the directory card.
  return createPortal(
    <dialog
      ref={ref}
      className={`dialog ${wide ? 'dialog-wide' : ''}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        // Keep React as the source of truth instead of letting Escape silently close the DOM.
        event.preventDefault()
        if (!busy) onClose()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget || busy) return
        // Native backdrop clicks target the dialog too. Bounds distinguish backdrop from padding.
        const box = event.currentTarget.getBoundingClientRect()
        if (
          event.clientX < box.left ||
          event.clientX > box.right ||
          event.clientY < box.top ||
          event.clientY > box.bottom
        )
          onClose()
      }}
    >
      <header className="dialog-heading">
        <div>
          <span className="eyebrow">ACME · PEOPLE OPERATIONS</span>
          <h2 id={titleId}>{title}</h2>
          {description && <p id={descriptionId}>{description}</p>}
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Close dialog"
        >
          <Icon name="close" />
        </button>
      </header>
      {children}
    </dialog>,
    document.body,
  )
}
