import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TuiMouseEvent } from "@earendil-works/pi-tui";

/**
 * Editor without the horizontal border lines and without the built-in
 * "Working..." row. The busy state is shown by minimal-footer.ts instead.
 * Compaction and retry status still appear in their own row.
 */
class BorderlessEditor extends CustomEditor {
  private visibleRows(): number {
    // Private in the base Editor (TS-only), set by every render.
    return (this as unknown as { renderedVisibleLineCount: number }).renderedVisibleLineCount;
  }

  render(width: number): string[] {
    const lines = super.render(width);
    const rows = this.visibleRows();
    // Layout from Editor.render: [top border, ...rows, bottom border, ...autocomplete].
    return [...lines.slice(1, 1 + rows), ...lines.slice(2 + rows)];
  }

  handleMouse(event: TuiMouseEvent) {
    // Base hit-testing assumes both border rows; shift the event to match.
    const shift = event.y < this.visibleRows() ? 1 : 2;
    return super.handleMouse({ ...event, y: event.y + shift });
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setWorkingVisible(false);
    ctx.ui.setEditorComponent((tui, theme, keybindings) => new BorderlessEditor(tui, theme, keybindings));
  });
}
