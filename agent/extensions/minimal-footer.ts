import { homedir } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

/** Minimal footer: working directory only, without quota polling or statistics. */
export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setFooter((_tui, theme) => ({
      invalidate() {},
      render(width: number): string[] {
        const home = homedir();
        const cwd = ctx.cwd === home ? "~" : ctx.cwd.startsWith(home + "/") ? "~" + ctx.cwd.slice(home.length) : ctx.cwd;
        return [truncateToWidth(theme.fg("dim", cwd.replace(/[\x00-\x1f\x7f]/g, "")), width)];
      },
    }));
  });
}
