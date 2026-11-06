import assert from "node:assert/strict";
import { test } from "node:test";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

const checkout = `${homedir()}/programming/pi`;
const { loadExtensions } = await import(pathToFileURL(`${checkout}/packages/coding-agent/dist/core/extensions/loader.js`));
const { Container, Text, visibleWidth } = await import(pathToFileURL(`${checkout}/packages/tui/dist/index.js`));
const { initTheme, theme } = await import(pathToFileURL(`${checkout}/packages/coding-agent/dist/modes/interactive/theme/theme.js`));
initTheme("dark");
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fixture() {
  const result = await loadExtensions([`${homedir()}/.pi/agent/extensions/custom-header.ts`], checkout);
  assert.deepEqual(result.errors, []);
  const ext = result.extensions[0];
  const root = new Container();
  const doc = new Container();
  const heading = new Container();
  const resources = new Container();
  const chat = new Container();
  root.addChild(doc);
  doc.addChild(heading);
  doc.addChild(resources);
  doc.addChild(chat);
  resources.addChild(new Text("resource info"));
  let renders = 0;
  let clears = 0;
  root.requestRender = () => renders++;
  root.terminal = { clearScreen: () => clears++ };
  const ctx = {
    mode: "tui", isIdle: () => true, hasPendingMessages: () => false,
    ui: {
      setHeader(factory) {
        heading.children.forEach(child => child.dispose?.());
        heading.clear();
        if (factory) heading.addChild(factory(root, theme));
      },
      setEditorText() {},
      notify() {},
    },
  };
  await ext.handlers.get("session_start")[0]({}, ctx);
  return { ext, root, doc, heading, resources, chat, ctx, get renders() { return renders; }, get clears() { return clears; } };
}

test("clear finds a status-only transcript, keeps resources and restarts greeting", async () => {
  const f = await fixture();
  f.chat.addChild(new Text("Session: status-only notification"));
  const previous = f.heading.children[0];
  previous.render(80);
  await f.ext.commands.get("clear").handler("", f.ctx);
  assert.equal(f.chat.children.length, 0);
  assert.equal(f.resources.children.length, 1);
  assert.equal(f.clears, 1);
  assert.notEqual(f.heading.children[0], previous);
  f.ext.handlers.get("session_shutdown")[0]({}, f.ctx);
});

test("clear also finds an empty transcript and refuses while busy", async () => {
  const f = await fixture();
  await f.ext.commands.get("clear").handler("", f.ctx);
  assert.equal(f.clears, 1);
  f.ctx.isIdle = () => false;
  f.chat.addChild(new Text("keep while busy"));
  await f.ext.commands.get("clear").handler("", f.ctx);
  assert.equal(f.clears, 1);
  assert.equal(f.chat.children.length, 1);
  f.ext.handlers.get("session_shutdown")[0]({}, f.ctx);
});

test("stroke assembly preserves layout and terminal width, then stops rendering", async () => {
  const f = await fixture();
  const header = f.heading.children[0];
  const first = header.render(80);
  await wait(1400);
  const last = header.render(80);
  assert.equal(first.length, last.length);
  const strip = (line) => line.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  assert.match(strip(last.at(-2)), /^  v\S+/);
  assert.doesNotMatch(strip(last.at(-2)), /pi/);
  assert.deepEqual(first.slice(1, 7).map(visibleWidth), last.slice(1, 7).map(visibleWidth));
  assert.ok(first.slice(1, 7).every(line => strip(line).trim() === ""));
  assert.deepEqual(last.slice(1, 7).map(line => strip(line).trimEnd()), [
    "   ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄", "  ▄▀▀██▀▀▀▀▀▀██▀▀▀▀▀",
    "     ██      ██", "     ██      ██", "    ▄██      ██▄", "   ▄██▀       ▀██▄",
  ]);
  for (const width of [1, 8, 20, 80]) {
    for (const line of header.render(width)) assert.ok(visibleWidth(line) <= width);
  }
  const count = f.renders;
  await wait(100);
  assert.equal(f.renders, count);
  f.ext.handlers.get("session_shutdown")[0]({}, f.ctx);
});

test("disconnected strokes assemble monotonically, joints close last, final has three tones", async (t) => {
  const f = await fixture();
  const header = f.heading.children[0];
  let now = 10000;
  t.mock.method(Date, "now", () => now);
  const strip = (line) => line.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  const frame = () => header.render(80).slice(1, 7).map(strip);
  let previous = frame();
  now = 10000 + 400;
  const middle = frame();
  assert.equal(middle[1][5], " ", "left joint is still disconnected");
  assert.notEqual(middle[5][4], " ", "left foot appears before the joint");
  assert.notEqual(middle[2][13], " ", "right stem grows separately");
  for (const elapsed of [400, 600, 800, 960, 1200]) {
    now = 10000 + elapsed;
    const next = frame();
    for (let y = 0; y < 6; y++) for (let x = 0; x < 20; x++) {
      if (previous[y][x] !== " ") assert.equal(next[y][x], previous[y][x], "revealed strokes never disappear");
    }
    previous = next;
  }
  const final = header.render(80);
  assert.deepEqual(header.render(80), final, "settled letter is static");
  const colors = final.slice(1, 7).join("").match(/\x1b\[(?:38;2;[\d;]+|38;5;\d+)m/g) ?? [];
  assert.equal(new Set(colors).size, 3, "only three relief tones, no grain");
  f.ext.handlers.get("session_shutdown")[0]({}, f.ctx);
});

test("shutdown and builtin-header cancel in-progress animation", async () => {
  for (const mode of ["shutdown", "builtin"]) {
    const f = await fixture();
    f.heading.children[0].render(80);
    if (mode === "shutdown") f.ext.handlers.get("session_shutdown")[0]({}, f.ctx);
    else await f.ext.commands.get("builtin-header").handler("", f.ctx);
    const count = f.renders;
    await wait(80);
    assert.equal(f.renders, count);
  }
});
