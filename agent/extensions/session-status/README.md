# Session status

Global pi extension. After installing, run `/reload` or restart pi.

```text
/status
/status rename
/status rename Auth work
```

`/status` shows the session name, ID, file and directory, creation time, the first and last user prompts of the current branch, agent state, model, thinking level, an estimate of context window usage, and counts of messages / compactions / active tools.

The topic is shown as excerpts of the prompts (up to 180 characters), not an AI summary, so there are no extra provider requests or costs. Original prompts remain available after history compaction; discarded branches are ignored. The status is a UI notification and is not added to the model context.

Context usage is pi's estimate (`ctx.getContextUsage()`), not an exact measurement of the next HTTP request. Right after a compaction the value may be unknown until the next model response. The remaining room in the window is not the same as the budget for the next request: the model's reply also takes space.

Renaming uses `pi.setSessionName()`: the name is stored by pi's standard mechanism, shows up in `/resume` and is compatible with `/name`. Calling it without a name opens a dialog; Escape cancels and an empty name is rejected. The session file and ID do not change.

## How it works

`index.ts` exports a factory taking an `ExtensionAPI`. pi calls it on load, and `registerCommand("status", ...)` registers a local slash-command handler. Data comes from the `ctx` passed on each call; there is no separate state, timers or subscriptions. So `/new`, `/resume`, `/tree` and `/reload` need no manual state restoration.

pi loads TypeScript via jiti with no separate build step. The `ExtensionAPI` import is type-only and disappears at runtime. The extension could also be written in JavaScript. TypeScript helps with checking the API, session entry types and handlers; it provides no isolation, since extensions run inside the pi process with the user's privileges.

## Testing

Requires Node.js with TypeScript type stripping:

```sh
node --test ~/.pi/agent/extensions/session-status/status.test.mjs
```

The tests cover formatting and the handler with a mock API. Loading through the real loader and TypeScript checking must be verified separately when the pi version changes.
