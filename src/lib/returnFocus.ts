/**
 * Radix's modal Dialog restores focus to its `DialogTrigger` on close. Our dialogs are opened from
 * state (a row button, the CTA, a banner "View"), so there is no trigger and focus would land on
 * <body>. Capture the opener when opening and hand it back in `onCloseAutoFocus`.
 */
let opener: HTMLElement | null = null

export function rememberOpener(): void {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
}

export function restoreOpenerFocus(event: Event): void {
  event.preventDefault()
  if (opener?.isConnected) opener.focus({ preventScroll: true })
  opener = null
}
