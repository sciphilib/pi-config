import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const HELP = "Commands: /status · /status rename [new name] · /name <name>";
const number = (value: number) => Math.round(value).toLocaleString("en-US");

/** Keep session text and paths from injecting terminal control sequences. */
export function plain(value: string): string {
  return value
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x1f\x7f-\x9f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function preview(value: string): string {
  const chars = Array.from(plain(value));
  return chars.length > 180 ? `${chars.slice(0, 179).join("")}…` : chars.join("");
}

export function formatStatus(ctx: ExtensionContext, activeTools: number): string {
  const sm = ctx.sessionManager;
  // Read the active path, not abandoned branches, and retain pre-compaction prompts.
  const branch = sm.getBranch();
  const prompts: string[] = [];
  let assistants = 0;
  let toolResults = 0;
  let compactions = 0;
  for (const entry of branch) {
    if (entry.type === "compaction") compactions++;
    if (entry.type !== "message") continue;
    const message = entry.message;
    if (message.role === "assistant") assistants++;
    if (message.role === "toolResult") toolResults++;
    if (message.role !== "user") continue;
    const text = typeof message.content === "string"
      ? message.content
      : message.content.filter((block) => block.type === "text").map((block) => block.text).join(" ");
    prompts.push(preview(text) || "[message without text: image or attachment]");
  }

  const header = sm.getHeader();
  const lines = [
    `Session: ${plain(sm.getSessionName() ?? "") || "unnamed"}`,
    `ID: ${plain(sm.getSessionId())}`,
    `File: ${plain(sm.getSessionFile() ?? "not persisted (ephemeral session)")}`,
    `Directory: ${plain(ctx.cwd)}`,
  ];
  if (header) lines.push(`Created: ${plain(header.timestamp)}`);
  if (prompts.length) {
    lines.push(`First prompt: ${prompts[0]}`);
    if (prompts.length > 1) lines.push(`Last prompt: ${prompts[prompts.length - 1]}`);
  } else {
    lines.push("Topic: no user prompts yet");
  }
  lines.push(
    `State: ${ctx.isIdle() ? "waiting for input" : "working"}${ctx.hasPendingMessages() ? "; messages queued" : ""}`,
    `Model: ${ctx.model ? plain(`${ctx.model.provider}/${ctx.model.id}`) : "none selected"}`,
    `Thinking: ${ctx.thinkingLevel}`,
  );

  const usage = ctx.getContextUsage();
  if (usage && usage.contextWindow > 0) {
    if (usage.tokens === null) {
      lines.push(`Context: ? / ${number(usage.contextWindow)} tokens (estimate available after the next model response)`);
    } else {
      const percent = (usage.tokens / usage.contextWindow) * 100;
      lines.push(`Context ≈ ${number(usage.tokens)} / ${number(usage.contextWindow)} tokens (${percent.toFixed(1)}%)`);
      lines.push(`Window remaining ≈ ${number(Math.max(0, usage.contextWindow - usage.tokens))} tokens`);
      if (percent >= 80) lines.push("High usage: consider running /compact; the model's reply also needs room in the window.");
    }
  } else {
    lines.push("Context: data unavailable");
  }
  lines.push(
    `Current branch: ${prompts.length} prompts, ${assistants} replies, ${toolResults} tool results, ${compactions} compactions`,
    `Active tools: ${activeTools}`,
    HELP,
  );
  return lines.join("\n");
}

export default function sessionStatus(pi: ExtensionAPI) {
  pi.registerCommand("status", {
    description: "Current session, its topic and context; /status rename [name] to rename",
    getArgumentCompletions: (prefix) => {
      return "rename".startsWith(prefix) ? [{ value: "rename", label: "rename", description: "Rename the current session" }] : null;
    },
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const command = args.trim();
      if (!command) {
        // Notifications neither call the model nor add messages to its context.
        ctx.ui.notify(formatStatus(ctx, pi.getActiveTools().length), "info");
        return;
      }
      const rename = /^rename(?:\s+([\s\S]*))?$/.exec(command);
      if (!rename) {
        ctx.ui.notify(HELP, "warning");
        return;
      }
      const sessionId = ctx.sessionManager.getSessionId();
      const input = rename[1] ?? await ctx.ui.input("New session name", ctx.sessionManager.getSessionName() ?? "E.g.: Auth refactoring");
      if (input === undefined) return; // Escape cancels without changing metadata.
      if (ctx.sessionManager.getSessionId() !== sessionId) {
        ctx.ui.notify("Session changed; rename cancelled.", "warning");
        return;
      }
      const name = plain(input);
      if (!name) {
        ctx.ui.notify("The name must not be empty.", "warning");
        return;
      }
      // Official API persists session_info and emits session_info_changed.
      pi.setSessionName(name);
      ctx.ui.notify(`Session renamed: ${name}`, "info");
    },
  });
}
