import "regular-table";
import type { RegularTableElement } from "regular-table";

type Row = Record<string, unknown>;
type CellRenderer = {
  tag?: string;
  class?: string;
  cell_class?: string;
  title?: string;
  event?: string;
  attributes?: Record<string, string>;
  format?: "number" | "percent";
  digits?: number;
  signed?: boolean;
  positive_class?: string;
  negative_class?: string;
};
type ColumnInput =
  | string
  | {
      key: string;
      label?: string;
      cell?: CellRenderer;
    };
type Column = { key: string; label: string; cell?: CellRenderer };
type RowOperation =
  | { type: "update"; index: number; changes: Row }
  | { type: "insert"; index: number; row: Row }
  | { type: "remove"; index: number };
type RowPatch = {
  revision?: string | number;
  operations: RowOperation[];
};
type VirtualMode = "both" | "horizontal" | "vertical" | "none";
type CellScalar = string | number | boolean | null;
type CellMetadata = {
  type: string;
  value: unknown;
  x?: number;
  y?: number;
};
type CellDetail = CellMetadata & {
  column?: string;
  row?: Row;
};
type DataResponse = {
  num_rows: number;
  num_columns: number;
  data: CellScalar[][];
  column_headers: CellScalar[][];
  row_headers?: CellScalar[][];
  row_height?: number;
};

function cellValue(value: unknown): CellScalar {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return value === undefined ? "" : JSON.stringify(value);
}

function formattedCell(value: unknown, renderer?: CellRenderer): string {
  if (!renderer?.format) return String(cellValue(value) ?? "");
  const number = Number(value);
  if (!Number.isFinite(number)) return String(cellValue(value) ?? "");
  const digits = Math.max(
    0,
    renderer.digits ?? (renderer.format === "percent" ? 2 : 0),
  );
  const displayedNumber = renderer.signed ? Math.abs(number) : number;
  const text =
    renderer.format === "number"
      ? displayedNumber.toLocaleString(undefined, {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        })
      : `${Math.abs(number).toFixed(digits)}%`;
  if (!renderer.signed || number === 0)
    return number < 0 && renderer.format === "percent" ? `-${text}` : text;
  return `${number > 0 ? "+" : "-"}${text}`;
}

/** Viewport-virtualized record rows backed by a native regular-table. */
export class SpadayRegularTable extends HTMLElement {
  #table: RegularTableElement | null = null;
  #rows: Row[] = [];
  #columns: Column[] = [];
  #explicitColumns = false;
  #virtualMode: VirtualMode = "both";
  #rowHeader: string | null = null;
  #rowHeight: number | undefined;
  #rowPatch: RowPatch | null = null;
  #patchRevision: string | number | undefined;
  #streamUrl: string | null = null;
  #stream: EventSource | null = null;
  #drawQueued = false;

  connectedCallback(): void {
    this.style.display ||= "block";
    this.style.position ||= "relative";
    this.#ensureTable();
    this.#connectStream();
    this.#scheduleDraw(false);
  }

  disconnectedCallback(): void {
    this.#stream?.close();
    this.#stream = null;
  }

  get rows(): Row[] {
    return this.#rows;
  }

  set rows(value: Row[] | null) {
    this.#rows = Array.isArray(value) ? value : [];
    if (!this.#explicitColumns) this.#inferColumns();
    this.#scheduleDraw(true);
  }

  /** Apply a small, serializable batch of row operations from a bound Python model. */
  get rowPatch(): RowPatch | null {
    return this.#rowPatch;
  }

  set rowPatch(value: RowPatch | null) {
    this.#rowPatch = value;
    if (!value || !Array.isArray(value.operations)) return;
    if (value.revision !== undefined && value.revision === this.#patchRevision)
      return;
    if (
      typeof value.revision === "number" &&
      typeof this.#patchRevision === "number" &&
      value.revision < this.#patchRevision
    )
      return;
    this.#patchRevision = value.revision;
    for (const operation of value.operations) {
      if (operation.type === "update")
        this.updateRow(operation.index, operation.changes);
      if (operation.type === "insert")
        this.insertRow(operation.index, operation.row);
      if (operation.type === "remove") this.removeRow(operation.index);
    }
    if (value.operations.length) {
      this.dispatchEvent(
        new CustomEvent("row-patch", {
          bubbles: true,
          composed: true,
          detail: value,
        }),
      );
    }
  }

  /** SSE endpoint whose messages are serializable row patches. */
  get streamUrl(): string | null {
    return this.#streamUrl;
  }

  set streamUrl(value: string | null) {
    this.#streamUrl = value || null;
    this.#connectStream();
  }

  /** Merge fields into one row without replacing the full dataset. */
  updateRow(index: number, changes: Row): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= this.#rows.length) {
      return false;
    }
    this.#rows[index] = { ...this.#rows[index], ...changes };
    this.#rowsMutated(index === 0);
    return true;
  }

  /** Insert one row at an exact virtual index. */
  insertRow(index: number, row: Row): boolean {
    if (!Number.isInteger(index) || index < 0 || index > this.#rows.length) {
      return false;
    }
    this.#rows.splice(index, 0, row);
    this.#rowsMutated(index === 0);
    return true;
  }

  /** Remove and return one row at an exact virtual index. */
  removeRow(index: number): Row | undefined {
    if (!Number.isInteger(index) || index < 0 || index >= this.#rows.length) {
      return undefined;
    }
    const [removed] = this.#rows.splice(index, 1);
    this.#rowsMutated(index === 0);
    return removed;
  }

  /** Resolve a rendered cell back to its virtual coordinates and source row. */
  getMeta(element: HTMLElement): CellDetail | undefined {
    if (!this.#table) return undefined;
    const cell = element.closest("td,th");
    if (!(cell instanceof HTMLElement)) return undefined;
    const meta = this.#table.getMeta(cell) as CellMetadata | undefined;
    if (!meta) return undefined;
    return {
      ...meta,
      column: meta.x === undefined ? undefined : this.#columns[meta.x]?.key,
      row: meta.y === undefined ? undefined : this.#rows[meta.y],
    };
  }

  get columns(): Column[] {
    return this.#columns;
  }

  set columns(value: ColumnInput[] | null) {
    this.#explicitColumns = Array.isArray(value) && value.length > 0;
    this.#columns = this.#explicitColumns
      ? value!.map((column) =>
          typeof column === "string"
            ? { key: column, label: column }
            : {
                key: column.key,
                label: column.label ?? column.key,
                cell: column.cell,
              },
        )
      : [];
    if (!this.#explicitColumns) this.#inferColumns();
    this.#table?.resetAutoSize();
    this.#scheduleDraw(false);
  }

  get virtualMode(): VirtualMode {
    return this.#virtualMode;
  }

  set virtualMode(value: VirtualMode) {
    this.#virtualMode = ["both", "horizontal", "vertical", "none"].includes(
      value,
    )
      ? value
      : "both";
    this.#configureListener();
    this.#scheduleDraw(false);
  }

  get rowHeader(): string | null {
    return this.#rowHeader;
  }

  set rowHeader(value: string | null) {
    this.#rowHeader = value || null;
    this.#table?.resetAutoSize();
    this.#scheduleDraw(false);
  }

  get rowHeight(): number | undefined {
    return this.#rowHeight;
  }

  set rowHeight(value: number | undefined) {
    this.#rowHeight = value && value > 0 ? value : undefined;
    this.#table?.resetAutoSize({
      row_height: true,
      auto: false,
      override: false,
      indices: false,
    });
    this.#scheduleDraw(true);
  }

  #ensureTable(): void {
    if (this.#table) return;
    this.#table = document.createElement("regular-table");
    this.#table.addEventListener("click", (event) => this.#emitCell(event));
    this.#table.addStyleListener(() => {
      this.#renderCells();
      this.dispatchEvent(
        new CustomEvent("table-draw", {
          bubbles: true,
          composed: true,
        }),
      );
    });
    this.appendChild(this.#table);
    this.#configureListener();
  }

  #connectStream(): void {
    this.#stream?.close();
    this.#stream = null;
    if (!this.isConnected || !this.#streamUrl) return;
    this.#stream = new EventSource(this.#streamUrl);
    this.#stream.addEventListener("message", (event) => {
      try {
        const patch = JSON.parse(event.data) as RowPatch;
        if (!patch || !Array.isArray(patch.operations)) throw new Error();
        this.rowPatch = patch;
      } catch {
        this.dispatchEvent(
          new CustomEvent("row-stream-error", {
            bubbles: true,
            composed: true,
            detail: { data: event.data },
          }),
        );
      }
    });
  }

  #inferColumns(): void {
    const first = this.#rows[0];
    this.#columns = first
      ? Object.keys(first)
          .filter((key) => key !== this.#rowHeader)
          .map((key) => ({ key, label: key }))
      : [];
  }

  #rowsMutated(firstRowChanged: boolean): void {
    if (!this.#explicitColumns && firstRowChanged) {
      this.#inferColumns();
      this.#table?.resetAutoSize();
      this.#scheduleDraw(false);
      return;
    }
    this.#scheduleDraw(true);
  }

  #configureListener(): void {
    if (!this.#table) return;
    this.#table.setDataListener(
      async (x0, y0, x1, y1) => this.#slice(x0, y0, x1, y1),
      { virtual_mode: this.#virtualMode, column_classes: true },
    );
  }

  #slice(x0: number, y0: number, x1: number, y1: number): DataResponse {
    const startRow = Math.max(0, y0);
    const endRow = Math.min(this.#rows.length, y1);
    const visibleColumns = this.#columns.slice(x0, x1);
    const data = visibleColumns.map(({ key }) => {
      const values: CellScalar[] = [];
      for (let y = startRow; y < endRow; y += 1) {
        values.push(cellValue(this.#rows[y]?.[key]));
      }
      return values;
    });
    const response: DataResponse = {
      num_rows: this.#rows.length,
      num_columns: this.#columns.length,
      data,
      column_headers: visibleColumns.map(({ label }) => [label]),
    };
    if (this.#rowHeader) {
      response.row_headers = this.#rows
        .slice(startRow, endRow)
        .map((row) => [cellValue(row[this.#rowHeader!])]);
    }
    if (this.#rowHeight) response.row_height = this.#rowHeight;
    return response;
  }

  #scheduleDraw(preserveWidth: boolean): void {
    if (!this.isConnected || !this.#table || this.#drawQueued) return;
    this.#drawQueued = true;
    requestAnimationFrame(() => {
      this.#drawQueued = false;
      void this.#table?.draw({ preserve_width: preserveWidth });
    });
  }

  #renderCells(): void {
    if (!this.#table) return;
    for (const cell of this.#table.querySelectorAll("tbody td")) {
      const element = cell as HTMLElement;
      const priorClasses =
        element.dataset.spadayClasses?.split(" ").filter(Boolean) ?? [];
      element.classList.remove(...priorClasses);
      delete element.dataset.spadayClasses;

      const meta = this.#table.getMeta(element) as CellMetadata | undefined;
      if (meta?.x === undefined) continue;
      const renderer = this.#columns[meta.x]?.cell;
      if (!renderer) continue;

      const classes = [renderer.cell_class];
      const number = Number(meta.value);
      if (Number.isFinite(number)) {
        classes.push(
          number >= 0 ? renderer.positive_class : renderer.negative_class,
        );
      }
      const appliedClasses = classes.filter((name): name is string =>
        Boolean(name),
      );
      element.classList.add(...appliedClasses);
      if (appliedClasses.length)
        element.dataset.spadayClasses = appliedClasses.join(" ");

      const text = formattedCell(meta.value, renderer);
      if (!renderer.tag) {
        element.textContent = text;
        continue;
      }
      const content = document.createElement(renderer.tag);
      if (renderer.class) content.className = renderer.class;
      if (renderer.title) content.title = renderer.title;
      for (const [name, value] of Object.entries(renderer.attributes ?? {})) {
        content.setAttribute(name, value);
      }
      content.textContent = text;
      element.replaceChildren(content);
    }
  }

  #emitCell(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const detail = this.getMeta(target);
    if (!detail) return;
    this.dispatchEvent(
      new CustomEvent("cell-click", {
        bubbles: true,
        composed: true,
        detail,
      }),
    );
    const renderer =
      detail.x === undefined ? undefined : this.#columns[detail.x]?.cell;
    if (renderer?.event && renderer.event !== "cell-click") {
      this.dispatchEvent(
        new CustomEvent(renderer.event, {
          bubbles: true,
          composed: true,
          detail,
        }),
      );
    }
  }
}

if (!customElements.get("spaday-regular-table")) {
  customElements.define("spaday-regular-table", SpadayRegularTable);
}
