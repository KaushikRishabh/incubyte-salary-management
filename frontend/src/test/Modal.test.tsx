import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Modal } from '../Modal'

/** Verify the React lifecycle contract independently of the browser's native focus trap. */
describe('modal shell', () => {
  it('falls back to main when a background refresh removed the original opener', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const { rerender } = render(
      <div>
        <main id="main-content" tabIndex={-1} />
        <Modal title="Example" onClose={vi.fn()}>
          <button>Inside</button>
        </Modal>
      </div>,
    )
    opener.remove()
    rerender(
      <div>
        <main id="main-content" tabIndex={-1} />
      </div>,
    )
    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('names the dialog and closes only for a click outside its bounds', () => {
    const close = vi.fn()
    render(
      <Modal title="Example" description="Helpful context" onClose={close}>
        <p>Content</p>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Example' })
    expect(dialog).toHaveAccessibleDescription('Helpful context')
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({
      x: 20,
      y: 20,
      left: 20,
      right: 220,
      top: 20,
      bottom: 220,
      width: 200,
      height: 200,
      toJSON: () => ({}),
    })
    fireEvent.click(dialog, { clientX: 50, clientY: 50 })
    fireEvent.click(screen.getByText('Content'), { clientX: 50, clientY: 50 })
    expect(close).not.toHaveBeenCalled()
    fireEvent.click(dialog, { clientX: 10, clientY: 10 })
    expect(close).toHaveBeenCalledTimes(1)
  })
})
