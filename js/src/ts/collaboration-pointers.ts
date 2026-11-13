interface Pointer {
  record: string;
  field: "Title" | "Note" | null;
  x: number;
  y: number;
}
interface Target {
  record: string;
  field: Pointer["field"];
  element: Element;
}

// Cursor positions are relative to record rows or fields, never the sender's viewport.
export function connectPointers(
  rows: () => Target[],
  changed: () => void,
  draw: (cursors: unknown[]) => void,
) {
  let pointer: Pointer | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;
  let last = "";
  let peers: { peer: string; user: string; pointer?: unknown }[] = [];
  const targets = () => [
    ...rows(),
    ...Array.from(document.querySelectorAll(".editor:not([hidden]) input")).map(
      (element) => ({
        element,
        record: element.closest(".editor")!.getAttribute("data-record-id")!,
        field: element.getAttribute("aria-label") as Pointer["field"],
      }),
    ),
  ];
  const visible = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < innerHeight &&
      rect.left < innerWidth
    );
  };
  const render = () => {
    frame = 0;
    const candidates = targets();
    const cursors = peers.flatMap(({ peer, user, pointer: value }) => {
      if (!value || typeof value !== "object") return [];
      const p = value as Partial<Pointer>;
      if (
        typeof p.record !== "string" ||
        (p.field !== null && p.field !== "Title" && p.field !== "Note") ||
        typeof p.x !== "number" ||
        !Number.isFinite(p.x) ||
        p.x < 0 ||
        p.x > 1 ||
        typeof p.y !== "number" ||
        !Number.isFinite(p.y) ||
        p.y < 0 ||
        p.y > 1
      )
        return [];
      const target = candidates.find(
        (target) => target.record === p.record && target.field === p.field,
      );
      if (!target || !visible(target.element)) return [];
      const rect = target.element.getBoundingClientRect();
      const x = rect.left + rect.width * p.x;
      const y = rect.top + rect.height * p.y;
      // A virtualized/clipped row must not leave a cursor floating outside its viewport.
      let hit = document.elementFromPoint(x, y);
      while (hit?.shadowRoot) {
        const inner = hit.shadowRoot.elementFromPoint(x, y);
        if (!inner || inner === hit) break;
        hit = inner;
      }
      if (!hit || !(hit === target.element || target.element.contains(hit)))
        return [];
      let left = Math.max(0, rect.left),
        top = Math.max(0, rect.top);
      let right = Math.min(innerWidth, rect.right),
        bottom = Math.min(innerHeight, rect.bottom);
      let ancestor: Element | null = target.element;
      while (ancestor) {
        const root = ancestor.getRootNode();
        ancestor =
          ancestor.parentElement ??
          (root instanceof ShadowRoot ? root.host : null);
        if (!ancestor) break;
        const style = getComputedStyle(ancestor);
        const clip = ancestor.getBoundingClientRect();
        if (style.overflowX !== "visible") {
          left = Math.max(left, clip.left + ancestor.clientLeft);
          right = Math.min(
            right,
            clip.left + ancestor.clientLeft + ancestor.clientWidth,
          );
        }
        if (style.overflowY !== "visible") {
          top = Math.max(top, clip.top + ancestor.clientTop);
          bottom = Math.min(
            bottom,
            clip.top + ancestor.clientTop + ancestor.clientHeight,
          );
        }
      }
      return [
        {
          peer,
          name: user[0].toUpperCase() + user.slice(1),
          className: `remote-pointer person-${user}`,
          style: `left:${x}px;top:${y}px`,
          boxStyle: `left:${left}px;top:${top}px;width:${Math.max(0, right - left)}px;height:${Math.max(0, bottom - top)}px`,
        },
      ];
    });
    const encoded = JSON.stringify(cursors);
    if (encoded !== last) {
      last = encoded;
      draw(cursors);
    }
    observe();
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };
  const observer = new MutationObserver(schedule);
  const roots = new Set<Node>();
  const resize = new ResizeObserver(schedule);
  const resized = new WeakSet<Element>();
  const observe = () => {
    for (const element of document.querySelectorAll(
      "main, #people, .workspace",
    )) {
      if (!resized.has(element)) {
        resized.add(element);
        resize.observe(element);
      }
    }
    for (const root of [
      document.querySelector(".workspace"),
      document.querySelector("#records file-tree-container")?.shadowRoot,
    ]) {
      if (!root || roots.has(root)) continue;
      roots.add(root);
      root.addEventListener("scroll", layout, true);
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
      });
    }
  };
  const move = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    const path = event.composedPath();
    const target = targets().find((target) => path.includes(target.element));
    if (target && visible(target.element)) {
      const rect = target.element.getBoundingClientRect();
      pointer = {
        record: target.record,
        field: target.field,
        x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
      };
      if (!timer)
        timer = setTimeout(() => {
          timer = undefined;
          changed();
        }, 40);
    } else clear();
  };
  const clear = () => {
    clearTimeout(timer);
    timer = undefined;
    if (pointer) {
      pointer = null;
      changed();
    }
  };
  const layout = () => {
    clear();
    schedule();
  };
  const visibility = () => {
    if (document.hidden) clear();
  };
  document.addEventListener("pointermove", move);
  document.documentElement.addEventListener("pointerleave", clear);
  document.addEventListener("scroll", layout, true);
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("resize", layout);
  window.addEventListener("blur", clear);
  window.addEventListener("pagehide", clear);
  observe();
  return {
    current: () => pointer,
    render(values: typeof peers) {
      peers = values;
      schedule();
    },
    disconnect() {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      for (const root of roots)
        root.removeEventListener("scroll", layout, true);
      document.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", clear);
      document.removeEventListener("scroll", layout, true);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("resize", layout);
      window.removeEventListener("blur", clear);
      window.removeEventListener("pagehide", clear);
      draw([]);
    },
  };
}
