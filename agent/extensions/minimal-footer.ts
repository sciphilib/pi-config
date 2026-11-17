import { homedir } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type TUI, rgbColor, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const BUSY = "π";
const ORANGE = rgbColor(255, 140, 0);

/** Minimal footer: working directory on the left, orange block on the right while the agent works. */
export default function (pi: ExtensionAPI) {
  let busy = false;
  let tui: TUI | undefined;
  const setBusy = (value: boolean) => {
    busy = value;
    tui?.requestRender();
  };

  pi.on("agent_start", () => setBusy(true));
  pi.on("agent_settled", () => setBusy(false));
  pi.on("session_shutdown", () => { tui = undefined; });

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    busy = !ctx.isIdle();
    ctx.ui.setFooter((ui, theme) => {
      tui = ui;
      return {
        invalidate() {},
        render(width: number): string[] {
          const home = homedir();
          const cwd = ctx.cwd === home ? "~" : ctx.cwd.startsWith(home + "/") ? "~" + ctx.cwd.slice(home.length) : ctx.cwd;
          const indicatorWidth = visibleWidth(BUSY);
          const left = truncateToWidth(
            theme.fg("dim", cwd.replace(/[\x00-\x1f\x7f]/g, "")),
            Math.max(0, width - indicatorWidth - 1),
          );
          if (width < indicatorWidth + 1) return [truncateToWidth(left, width)];
          const gap = " ".repeat(Math.max(1, width - visibleWidth(left) - indicatorWidth));
          const right = busy ? theme.style(BUSY, { fg: ORANGE }) : " ".repeat(indicatorWidth);
          return [left + gap + right];
        },
      };
    });
  });
}
