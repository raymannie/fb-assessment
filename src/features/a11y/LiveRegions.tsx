import { useAppSelector } from '@/app/hooks'

import { selectAssertive, selectPolite } from './announcerSlice'

/** Persistent live regions. Keyed by id so the same message can be announced twice. */
export function LiveRegions() {
  const polite = useAppSelector(selectPolite)
  const assertive = useAppSelector(selectAssertive)
  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="live-polite">
        <span key={polite.id}>{polite.text}</span>
      </div>
      <div
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
        data-testid="live-assertive"
      >
        <span key={assertive.id}>{assertive.text}</span>
      </div>
    </>
  )
}
