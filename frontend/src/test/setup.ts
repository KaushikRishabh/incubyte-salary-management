import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom has no native modal top layer. This small shim enables open/close/focus
// assertions only; browser QA is still required for inertness, trapping, Escape, and layout.
Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
  configurable: true,
  value: function () {
    this.setAttribute('open', '')
    this.querySelector('[autofocus], input, textarea, button')?.focus()
  },
})
Object.defineProperty(HTMLDialogElement.prototype, 'close', {
  configurable: true,
  value: function () {
    this.removeAttribute('open')
  },
})
// Unmount portals and remove global fetch stubs after every test to prevent order dependence.
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
