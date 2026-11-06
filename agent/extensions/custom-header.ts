import { VERSION, type ExtensionAPI, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import { Container, type Component, type TUI, rgbColor, truncateToWidth } from "@earendil-works/pi-tui";

// Same 20 × 6 envelope, with a lifted left terminal and asymmetric feet.
const LOGO = [
  "   ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄",
  "  ▄▀▀██▀▀▀▀▀▀██▀▀▀▀▀",
  "     ██      ██",
  "     ██      ██",
  "    ▄██      ██▄",
  "   ▄██▀       ▀██▄",
];

type RGB = readonly [number, number, number];
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
function blend(a: RGB, b: RGB, t: number): RGB {
  const mix = (i: number) => Math.round(a[i] + (b[i] - a[i]) * clamp(t));
  return [mix(0), mix(1), mix(2)];
}
const occupied = (x: number, y: number) => Boolean(LOGO[y]?.[x] && LOGO[y][x] !== " ");

// Separate strokes become a letter, rather than a light sweeping a full mask.
// No randomness: the feet, stems and disconnected lintel fragments assemble
// in place, and the two joints close last. Nothing moves outside the envelope.
const STROKES = LOGO.map((row, y) => Array.from(row.padEnd(20), (glyph, x) => {
  let delay: number;
  if (y <= 1) {
    delay = 0.04 + 0.46 * (1 - clamp(Math.abs(x - 10) / 8));
    if (y === 1 && (x === 5 || x === 6 || x === 13 || x === 14)) delay = 0.69;
  } else {
    delay = x < 10 ? 0.08 + (5 - y) * 0.10 : 0.18 + (y - 2) * 0.09;
  }
  const face = !occupied(x, y - 1) ? 0 : !occupied(x + 1, y) ? 2 : 1;
  return { glyph, delay, face };
}));

function buildHeader(width: number, theme: Theme, progress = 1): string[] {
  const lightTheme = theme.appearance === "light";
  // Just three quiet tones: a lit edge, a matte face, a recessed right edge.
  const palette: RGB[] = lightTheme
    ? [[163, 113, 48], [133, 93, 44], [97, 76, 48]]
    : [[222, 181, 113], [189, 145, 82], [127, 98, 62]];
  const onset: RGB = lightTheme ? [196, 178, 150] : [69, 57, 40];
  const logo = STROKES.map(row => row.map(({ glyph, delay, face }) => {
    if (glyph === " " || progress <= delay) return " ";
    const settled = smooth((progress - delay) / 0.15);
    return theme.style(glyph, { fg: rgbColor(...blend(onset, palette[face], settled)) });
  }).join(""));
  const title = "  " + theme.fg("dim", `v${VERSION}`);
  return ["", ...logo, "", title, ""].map(line => truncateToWidth(line, width));
}

// The extension API has no clear-transcript method. Inspect public Container
// children, anchored to our header in pi's document layout, with message-based
// fallback. The structural anchor is version-dependent; fail closed if ambiguous.
const MESSAGE_COMPONENTS = new Set([
  "UserMessageComponent", "AssistantMessageComponent", "ToolExecutionComponent",
  "BashExecutionComponent", "CustomMessageComponent",
]);

function findTranscripts(root: Component, header?: Component): Container[] {
  const found: Container[] = [];
  const seen = new Set<Component>();
  function visit(node: Component) {
    if (seen.has(node)) return;
    seen.add(node);
    if (!(node instanceof Container)) return;
    // Current pi document layout: header, loaded resources, transcript. Anchor
    // to our exact header instance so status-only/empty transcripts are found,
    // without mistaking header/footer/resource Text components for chat.
    if (header && node.children.length === 3 && node.children.every(child => child instanceof Container)) {
      const [headerContainer, , transcript] = node.children as Container[];
      if (headerContainer.children.includes(header)) {
        found.push(transcript);
        return;
      }
    }
    if (node.children.some(child => MESSAGE_COMPONENTS.has(child.constructor.name))) {
      found.push(node);
      return; // Do not descend into message internals.
    }
    for (const child of node.children) visit(child);
  }
  visit(root);
  return found;
}

export default function (pi: ExtensionAPI) {
  let tui: TUI | undefined;
  let header: (Component & { dispose(): void }) | undefined;

  function installHeader(ctx: ExtensionContext) {
    header?.dispose();
    ctx.ui.setHeader((ui, theme) => {
      tui = ui;
      let started: number | undefined;
      let timer: ReturnType<typeof setInterval> | undefined;
      let disposed = false;
      const duration = 960;
      const stop = () => {
        if (timer !== undefined) clearInterval(timer);
        timer = undefined;
      };
      header = {
        render(width: number) {
          if (started === undefined && !disposed) {
            // Start on the first actual render, not during session loading.
            started = Date.now();
            timer = setInterval(() => {
              if (Date.now() - started! >= duration) stop();
              ui.requestRender();
            }, 1000 / 30);
            timer.unref?.();
          }
          const t = disposed ? 1 : Math.min(1, Math.max(0, (Date.now() - (started ?? Date.now())) / duration));
          return buildHeader(width, theme, t);
        },
        invalidate() {},
        dispose() { disposed = true; stop(); },
      };
      return header;
    });
  }

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode === "tui") installHeader(ctx);
  });
  pi.on("session_shutdown", () => {
    header?.dispose();
    header = undefined;
    tui = undefined;
  });

  pi.registerCommand("clear", {
    description: "Clear the visible transcript and show the welcome header, keeping context",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui" || !tui) {
        ctx.ui.notify("/clear is only available in an interactive terminal.", "warning");
        return;
      }
      if (!ctx.isIdle() || ctx.hasPendingMessages()) {
        ctx.ui.notify("Wait for the reply and the message queue to finish before /clear.", "warning");
        return;
      }
      const transcripts = findTranscripts(tui, header);
      if (transcripts.length !== 1) {
        ctx.ui.notify("Could not unambiguously locate the transcript. Screen unchanged.", "warning");
        return;
      }
      // Only UI components are cleared. No session entries/messages are changed.
      transcripts[0]?.clear();
      installHeader(ctx);
      ctx.ui.setEditorText("");
      tui.terminal.clearScreen();
      tui.requestRender(true);
    },
  });

  pi.registerCommand("builtin-header", {
    description: "Restore the built-in startup header",
    handler: async (_args, ctx) => {
      header?.dispose();
      header = undefined;
      ctx.ui.setHeader(undefined);
    },
  });
}
