import { useEffect, useRef } from 'react'
import { animate, useReducedMotion } from 'framer-motion'

/** Counts smoothly to a new value when it changes (instant for reduced-motion users). */
export default function AnimatedNumber({ value, format = (n) => Math.round(n).toLocaleString('en-IN'), duration = 0.5 }) {
  const ref = useRef(null)
  const previous = useRef(value)
  const reduce = useReducedMotion()

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    if (reduce) {
      node.textContent = format(value)
      previous.current = value
      return undefined
    }
    const controls = animate(previous.current, value, {
      duration,
      ease: [0.2, 0, 0, 1],
      onUpdate: (v) => {
        node.textContent = format(v)
      },
    })
    previous.current = value
    return () => controls.stop()
  }, [value, duration, format, reduce])

  return (
    <span ref={ref} className="tabular">
      {format(value)}
    </span>
  )
}
