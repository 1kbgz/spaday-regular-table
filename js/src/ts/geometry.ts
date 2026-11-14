export interface TableItemBounds {
  bounds: DOMRectReadOnly;
  visibleBounds: DOMRectReadOnly;
}

/** Clip a rendered table item against its scrolling ancestors and the viewport. */
export function itemBounds(element: Element): TableItemBounds | undefined {
  if (
    !element.checkVisibility({
      visibilityProperty: true,
      opacityProperty: true,
    })
  )
    return undefined;
  const bounds = element.getBoundingClientRect();
  let left = Math.max(0, bounds.left),
    right = Math.min(innerWidth, bounds.right);
  let top = Math.max(0, bounds.top),
    bottom = Math.min(innerHeight, bounds.bottom);
  let parent: Element | null = element;
  while (parent) {
    const root = parent.getRootNode();
    parent =
      parent.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
    if (!parent) break;
    const style = getComputedStyle(parent),
      clip = parent.getBoundingClientRect();
    if (style.overflowX !== "visible") {
      left = Math.max(left, clip.left + parent.clientLeft);
      right = Math.min(
        right,
        clip.left + parent.clientLeft + parent.clientWidth,
      );
    }
    if (style.overflowY !== "visible") {
      top = Math.max(top, clip.top + parent.clientTop);
      bottom = Math.min(
        bottom,
        clip.top + parent.clientTop + parent.clientHeight,
      );
    }
  }
  if (right <= left || bottom <= top) return undefined;
  return {
    bounds,
    visibleBounds: new DOMRect(left, top, right - left, bottom - top),
  };
}
