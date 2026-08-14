import "regular-table";
import type { RegularTableElement } from "regular-table";

type Row = Record<string, unknown>;
type ColumnInput = string | { key: string; label?: string };
type Column = { key: string; label: string };
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

/** Viewport-virtualized record rows backed by a native regular-table. */
export class SpadayRegularTable extends HTMLElement {
  #table: RegularTableElement | null = null;
  #rows: Row[] = [];
  #columns: Column[] = [];
  #explicitColumns = false;
  #virtualMode: VirtualMode = "both";
  #rowHeader: string | null = null;
  #rowHeight: number | undefined;
  #drawQueued = false;

  connectedCallback(): void {
    this.style.display ||= "block";
    this.style.position ||= "relative";
    this.#ensureTable();
    this.#scheduleDraw(false);
  }

  get rows(): Row[] {
    return this.#rows;
  }

  set rows(value: Row[] | null) {
    this.#rows = Array.isArray(value) ? value : [];
    if (!this.#explicitColumns) this.#inferColumns();
    this.#scheduleDraw(true);
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
            : { key: column.key, label: column.label ?? column.key },
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
  }
}

if (!customElements.get("spaday-regular-table")) {
  customElements.define("spaday-regular-table", SpadayRegularTable);
}
