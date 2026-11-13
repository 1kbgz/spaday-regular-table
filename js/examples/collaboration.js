import { elementGeometry } from "/components/collab/cdn/index.js";

// Only target identity and component geometry are specific to this example.
function targets() {
  const inputs = () =>
    Array.from(document.querySelectorAll(".editor:not([hidden]) input"));
  const key = (record, field = null) => JSON.stringify([record, field]);
  const inputKey = (el) =>
    key(el.closest(".editor").dataset.recordId, el.getAttribute("aria-label"));
  const rows = () => Array.from(document.querySelectorAll("#records tbody tr"));
  const rowKey = (el) =>
    key(
      document.querySelector("#records").getMeta(el.querySelector("td"))?.row
        ?.id,
    );
  return {
    hitTest(x, y) {
      const input = inputs().find((el) => elementGeometry(el).hit(x, y));
      if (input) return inputKey(input);
      const row = rows().find((el) => elementGeometry(el).hit(x, y));
      return row ? rowKey(row) : null;
    },
    resolve(id) {
      const element =
        inputs().find((el) => inputKey(el) === id) ??
        rows().find((el) => rowKey(el) === id);
      return element ? elementGeometry(element) : undefined;
    },
    roots: () => [document.querySelector("main")],
  };
}
const users = /* @__PURE__ */ new Set(["alice", "bob", "viewer"]);
function presence(value) {
  if (!value || typeof value !== "object") return null;
  const state = value;
  if (typeof state.user !== "string" || !users.has(state.user)) return null;
  return {
    user: state.user,
    pointer: state.pointer,
    record: typeof state.record === "string" ? state.record : null,
    field:
      state.field === "Title" || state.field === "Note" ? state.field : null,
  };
}
document.addEventListener("spaday:wire-client", (event) => {
  const { namespace, store } = event.detail;
  if (namespace !== "board") return;
  const user = String(store.get("user"));
  if (!users.has(user)) return;
  const peers = () =>
    new Map(
      (store.get("remote_activity") ?? []).map(({ peer, state }) => [
        peer,
        state,
      ]),
    );
  const records = () => store.get("board.records") ?? [];
  const current = () => {
    const selected = store.get("selected");
    const record = records().some((row) => row.id === selected)
      ? String(selected)
      : null;
    const input = document.activeElement;
    const field =
      record &&
      input instanceof HTMLInputElement &&
      !input.readOnly &&
      input.closest(".editor")?.getAttribute("data-record-id") === record
        ? input.getAttribute("aria-label")
        : null;
    return { user, record, field, pointer: store.get("pointer") };
  };
  const person = (state, local = false) => {
    const record = records().some((row) => row.id === state.record)
      ? state.record
      : null;
    return {
      user: state.user,
      name:
        state.user[0].toUpperCase() +
        state.user.slice(1) +
        (local ? " (you)" : ""),
      initial: state.user[0].toUpperCase(),
      className: `person person-${state.user}`,
      status:
        local && !store.get("board.connected")
          ? "Offline"
          : record
            ? `${state.field && state.user !== "viewer" ? `Editing ${state.field.toLowerCase()}` : "Viewing"} \xB7 ${record}`
            : "Choosing a record",
    };
  };
  let lastPeople = "";
  const render = () => {
    store.set(
      "cursors",
      [...peers()].flatMap(([peer, value]) => {
        const state = presence(value);
        return state
          ? [
              {
                peer,
                pointer: state.pointer,
                label: state.user[0].toUpperCase() + state.user.slice(1),
                color: { alice: "#f4a261", bob: "#90c2ff", viewer: "#a7d9a4" }[
                  state.user
                ],
              },
            ]
          : [];
      }),
    );
    const others = [...peers().values()].flatMap((value) => {
      const state = presence(value);
      return state ? [person(state)] : [];
    });
    const groups = /* @__PURE__ */ new Map();
    for (const entry of [person(current(), true), ...others]) {
      const group = groups.get(entry.user) ?? [];
      group.push(entry);
      groups.set(entry.user, group);
    }
    const people = [...groups.values()].map((group) => ({
      ...group[0],
      name:
        group[0].name + (group.length > 1 ? ` \xB7 ${group.length} tabs` : ""),
      status: [...new Set(group.map((entry) => entry.status))].join("; "),
    }));
    const encodedPeople = JSON.stringify(people);
    if (encodedPeople !== lastPeople) {
      lastPeople = encodedPeople;
      store.set("people", people);
    }
  };
  let active = true;
  let last = "";
  const publish = () => {
    if (!active) return;
    const state = current();
    const encoded = JSON.stringify(state);
    if (encoded !== last) {
      last = encoded;
      store.set("activity", state);
    }
    render();
  };
  queueMicrotask(() => {
    if (active)
      Object.assign(document.querySelector("spaday-pointers"), {
        adapter: targets(),
      });
  });
  const focus = () => queueMicrotask(publish);
  const stops = [
    store.subscribe("remote_activity", render),
    store.subscribe("pointer", publish),
    store.subscribe("selected", publish),
    store.subscribe("board.records", publish),
    store.subscribe("board.connected", render),
  ];
  document.addEventListener("focusin", focus);
  document.addEventListener("focusout", focus);
  publish();
  window.addEventListener("pagehide", (event2) => {
    if (event2.persisted) return;
    active = false;
    stops.forEach((stop) => stop());
    document.removeEventListener("focusin", focus);
    document.removeEventListener("focusout", focus);
  });
});
