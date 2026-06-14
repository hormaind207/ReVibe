import { useRef, useCallback } from 'react'

/**
 * Mouse drag-to-scroll for horizontal carousels.
 * Attach ref to the scrollable container and spread the event handlers on it.
 * Call preventClickIfDragged on child click handlers to stop accidental clicks after drag.
 */
export function useDragScroll() {
  const ref = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const scrollLeft = useRef(0)
  const hasDragged = useRef(false)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    hasDragged.current = false
    startX.current = e.pageX - (ref.current?.offsetLeft ?? 0)
    scrollLeft.current = ref.current?.scrollLeft ?? 0
    if (ref.current) ref.current.style.cursor = 'grabbing'
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !ref.current) return
    e.preventDefault()
    const x = e.pageX - ref.current.offsetLeft
    const walk = x - startX.current
    if (Math.abs(walk) > 4) hasDragged.current = true
    ref.current.scrollLeft = scrollLeft.current - walk
  }, [])

  const onMouseUp = useCallback(() => {
    isDragging.current = false
    if (ref.current) ref.current.style.cursor = 'grab'
  }, [])

  const onMouseLeave = useCallback(() => {
    isDragging.current = false
    if (ref.current) ref.current.style.cursor = 'grab'
  }, [])

  const preventClickIfDragged = useCallback((e: React.MouseEvent) => {
    if (hasDragged.current) e.stopPropagation()
  }, [])

  return { ref, onMouseDown, onMouseMove, onMouseUp, onMouseLeave, preventClickIfDragged }
}
