/**
 * Registry of table landmarks the FX overlay flies cards between.
 * Module-level is fine: only one table is ever mounted.
 */
const anchors = new Map<string, HTMLElement>()

export function anchorRef(key: string) {
  return (el: HTMLElement | null) => {
    if (el) anchors.set(key, el)
    else anchors.delete(key)
  }
}

export function anchorRect(key: string): DOMRect | null {
  return anchors.get(key)?.getBoundingClientRect() ?? null
}
