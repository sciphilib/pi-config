import assert from "node:assert/strict";
import { test } from "node:test";
import extension, { formatStatus, plain } from "./index.ts";

function fixture() {
  let name;
  let branch = [];
  let command;
  const notifications = [];
  const ctx = {
    hasUI: true, cwd: "/project", thinkingLevel: "high",
    model: { provider: "test", id: "model" },
    isIdle: () => true, hasPendingMessages: () => false,
    getContextUsage: () => ({ tokens: 85000, contextWindow: 100000, percent: 85 }),
    sessionManager: {
      getBranch: () => branch, getSessionName: () => name,
      getSessionId: () => "session-id", getSessionFile: () => "/session.jsonl",
      getHeader: () => ({ timestamp: "2026-01-01T00:00:00Z" }),
    },
    ui: { notify: (...args) => notifications.push(args), input: async () => "New name" },
  };
  const pi = {
    registerCommand: (key, value) => { assert.equal(key, "status"); command = value; },
    getActiveTools: () => ["read", "bash"],
    setSessionName: (value) => { name = value; },
  };
  extension(pi);
  return { ctx, pi, notifications, command, setBranch: (value) => { branch = value; } };
}
const user = (content) => ({ type: "message", message: { role: "user", content } });

test("status shows session, branch prompts and window estimate without modifying the session", async () => {
  const f = fixture();
  f.setBranch([user("Initial task"), { type: "compaction" }, user([{ type: "image" }, { type: "text", text: "Current task" }])]);
  await f.command.handler("", f.ctx);
  const text = f.notifications[0][0];
  for (const expected of ["unnamed", "session-id", "Initial task", "Current task", "test/model", "85.0%", "High usage", "1 compactions", "Active tools: 2"]) assert.ok(text.includes(expected), expected);
  assert.equal(f.ctx.sessionManager.getSessionName(), undefined);
});

test("unknown tokens after compaction are not reported as zero", () => {
  const { ctx } = fixture();
  ctx.getContextUsage = () => ({ tokens: null, contextWindow: 100000, percent: null });
  const text = formatStatus(ctx, 0);
  assert.match(text, /Context: \? /);
  assert.doesNotMatch(text, /Window remaining/);
});

test("missing model, usage and persistent file are supported", () => {
  const { ctx } = fixture();
  ctx.model = undefined;
  ctx.getContextUsage = () => undefined;
  ctx.sessionManager.getSessionFile = () => undefined;
  const text = formatStatus(ctx, 0);
  assert.match(text, /none selected/);
  assert.match(text, /data unavailable/);
  assert.match(text, /ephemeral/);
  assert.match(text, /no user prompts yet/);
});

test("explicit rename uses session naming API and preserves spaces", async () => {
  const f = fixture();
  await f.command.handler("rename  New session topic ", f.ctx);
  assert.equal(f.ctx.sessionManager.getSessionName(), "New session topic");
  assert.match(formatStatus(f.ctx, 0), /Session: New session topic/);
});

test("rename dialog, cancel and empty input", async () => {
  const f = fixture();
  await f.command.handler("rename", f.ctx);
  assert.equal(f.ctx.sessionManager.getSessionName(), "New name");
  f.ctx.ui.input = async () => undefined;
  await f.command.handler("rename", f.ctx);
  assert.equal(f.ctx.sessionManager.getSessionName(), "New name");
  f.ctx.ui.input = async () => "  \n ";
  await f.command.handler("rename", f.ctx);
  assert.equal(f.ctx.sessionManager.getSessionName(), "New name");
  assert.equal(f.notifications.at(-1)[1], "warning");
});

test("unknown arguments and headless invocation do not rename", async () => {
  const f = fixture();
  await f.command.handler("renamed surprise", f.ctx);
  assert.equal(f.notifications.at(-1)[1], "warning");
  f.ctx.hasUI = false;
  await f.command.handler("rename surprise", f.ctx);
  assert.equal(f.ctx.sessionManager.getSessionName(), undefined);
});

test("session switch while dialog is open cancels rename", async () => {
  const f = fixture();
  f.ctx.ui.input = async () => {
    f.ctx.sessionManager.getSessionId = () => "another-session";
    return "Wrong session";
  };
  await f.command.handler("rename", f.ctx);
  assert.equal(f.ctx.sessionManager.getSessionName(), undefined);
});

test("terminal sequences are stripped and previews are bounded", () => {
  assert.equal(plain("\x1b[31mred\x1b[0m\x1b]0;title\x07\ntext"), "red text");
  const f = fixture();
  f.setBranch([user("😀".repeat(500))]);
  const line = formatStatus(f.ctx, 0).split("\n").find((value) => value.startsWith("First prompt:"));
  assert.equal(Array.from(line.slice("First prompt: ".length)).length, 180);
  assert.ok(line.endsWith("…"));
});

test("image-only prompts are represented and overflow has no negative remaining tokens", () => {
  const f = fixture();
  f.setBranch([user([{ type: "image" }])]);
  f.ctx.getContextUsage = () => ({ tokens: 110, contextWindow: 100, percent: 110 });
  const text = formatStatus(f.ctx, 0);
  assert.match(text, /image or attachment/);
  assert.match(text, /Window remaining ≈ 0 tokens/);
});

test("rename completion does not complete unrelated arguments", () => {
  const { command } = fixture();
  assert.equal(command.getArgumentCompletions("ren")[0].value, "rename");
  assert.equal(command.getArgumentCompletions("rename new"), null);
});
