/** Joins truthy class names. Accepts strings, falsy values and nested arrays. */
export function cn(...args) {
  return args.flat(Infinity).filter(Boolean).join(' ')
}
