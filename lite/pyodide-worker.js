const PYODIDE_VERSION = "314.0.4";
let pyodide;

const ready = (async () => {
  self.postMessage({ type: "status", message: "Loading Pyodide…" });
  const { loadPyodide } = await import(
    `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.mjs`
  );
  pyodide = await loadPyodide();
  await pyodide.loadPackage(["micropip", "anyio"]);

  self.postMessage({ type: "status", message: "Installing example…" });
  const response = await fetch(new URL("./wheels.json", self.location.href));
  if (!response.ok)
    throw new Error(`wheel manifest returned ${response.status}`);
  const wheels = await response.json();
  const urls = Object.fromEntries(
    Object.entries(wheels).map(([name, path]) => [
      name,
      new URL(path, self.location.href).href,
    ]),
  );
  pyodide.globals.set("wheels_json", JSON.stringify(urls));
  return pyodide.runPythonAsync(`
import asyncio
import json
import micropip

wheels = json.loads(wheels_json)
await micropip.install([wheels["spaday"], "starlette", "uvicorn"])
await micropip.install(wheels["table"], deps=False)

from spaday_regular_table import example

pending_patches = []
native_publish = example.publish

def publish(*operations):
    patch = native_publish(*operations)
    pending_patches.append(patch)
    return patch

example.publish = publish

def flush_stream():
    patches = list(pending_patches)
    pending_patches.clear()
    return json.dumps(patches)

class LocalRequest:
    def __init__(self, action, body):
        self.path_params = {"action": action}
        self._body = body

    async def json(self):
        return self._body

async def call_endpoint(action, body_json):
    response = await example.table_action(LocalRequest(action, json.loads(body_json)))
    return json.dumps({
        "status": response.status_code,
        "body": json.loads(bytes(response.body).decode()),
    })

asyncio.create_task(example.stream_rows())

json.dumps({
    "tree": example.page.to_node(),
    "style": example.styles,
    "store": example.initial_store,
})
`);
})();

let queue = Promise.resolve();

async function handle(message) {
  const snapshot = await ready;
  if (message.type === "start") {
    self.postMessage({ type: "snapshot", payload: JSON.parse(snapshot) });
  } else if (message.type === "flush") {
    const patches = JSON.parse(pyodide.runPython("flush_stream()"));
    if (patches.length) self.postMessage({ type: "stream", patches });
  } else if (message.type === "endpoint") {
    pyodide.globals.set("action", message.action);
    pyodide.globals.set("body_json", JSON.stringify(message.body));
    const result = JSON.parse(
      await pyodide.runPythonAsync("await call_endpoint(action, body_json)"),
    );
    self.postMessage({ type: "endpoint", id: message.id, ...result });
  }
}

self.addEventListener("message", (event) => {
  queue = queue
    .then(() => handle(event.data))
    .catch((error) => {
      self.postMessage({ type: "error", message: String(error) });
    });
});
