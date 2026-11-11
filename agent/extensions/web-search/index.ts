import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@mariozechner/pi-tui";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawn, execFileSync } from "node:child_process";

interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

interface StructuredSearchArgs {
	query?: string;
	exactPhrases?: string[];
	excludeTerms?: string[];
	site?: string;
	count?: number;
}

interface BuiltSearchQuery {
	query: string;
	baseQuery?: string;
	exactPhrases: string[];
	excludeTerms: string[];
	site?: string;
}

// ---------------------------------------------------------------------------
// Local SearXNG, started on demand and stopped after idle time
// ---------------------------------------------------------------------------

const SEARXNG_DIR = path.join(os.homedir(), ".pi", "agent", "searxng");
const SEARXNG_SRC = path.join(SEARXNG_DIR, "src");
const SEARXNG_PYTHON = path.join(SEARXNG_DIR, "venv", "bin", "python");
const SEARXNG_SETTINGS = path.join(SEARXNG_DIR, "settings.yml");
const SEARXNG_LOG = path.join(SEARXNG_DIR, "searxng.log");
const LAST_USED_FILE = path.join(SEARXNG_DIR, "last-used.json");
const SEARXNG_PORT = Number(process.env.SEARXNG_PORT ?? 8899);
const SEARXNG_URL = `http://127.0.0.1:${SEARXNG_PORT}`;
const IDLE_MS = Number(process.env.SEARXNG_IDLE_MINUTES ?? 10) * 60_000;
const STARTUP_TIMEOUT_MS = 30_000;

let idleTimer: ReturnType<typeof setTimeout> | undefined;
let startingPromise: Promise<void> | undefined;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) return reject(new Error("Aborted"));
		const t = setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(t);
				reject(new Error("Aborted"));
			},
			{ once: true },
		);
	});
}

async function isHealthy(): Promise<boolean> {
	try {
		const resp = await fetch(`${SEARXNG_URL}/healthz`, {
			signal: AbortSignal.timeout(1500),
		});
		return resp.ok;
	} catch {
		return false;
	}
}

/** PIDs of searx.webapp processes listening on our port (never anything else). */
function findSearxngPids(): number[] {
	try {
		const out = execFileSync(
			"lsof",
			["-nP", `-iTCP:${SEARXNG_PORT}`, "-sTCP:LISTEN", "-t"],
			{ encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
		);
		const pids = [...new Set(out.split(/\s+/).filter(Boolean).map(Number))];
		return pids.filter((pid) => {
			try {
				const cmd = execFileSync("ps", ["-o", "command=", "-p", String(pid)], {
					encoding: "utf-8",
					stdio: ["ignore", "pipe", "ignore"],
				});
				return cmd.includes("searx.webapp");
			} catch {
				return false;
			}
		});
	} catch {
		return [];
	}
}

function readLastUsed(): { pid: number; time: number } | null {
	try {
		return JSON.parse(fs.readFileSync(LAST_USED_FILE, "utf-8"));
	} catch {
		return null;
	}
}

function markUsed(): void {
	try {
		fs.writeFileSync(
			LAST_USED_FILE,
			JSON.stringify({ pid: process.pid, time: Date.now() }),
		);
	} catch {}
}

function stopSearxng(): void {
	for (const pid of findSearxngPids()) {
		try {
			process.kill(pid, "SIGTERM");
		} catch {}
	}
}

function clearIdleTimer(): void {
	if (idleTimer) clearTimeout(idleTimer);
	idleTimer = undefined;
}

/** Check shared last-used time; stop the server if idle, otherwise re-arm. */
function checkIdle(): void {
	clearIdleTimer();
	const last = readLastUsed();
	const idleFor = last ? Date.now() - last.time : Infinity;
	if (idleFor >= IDLE_MS) {
		stopSearxng();
		return;
	}
	idleTimer = setTimeout(checkIdle, IDLE_MS - idleFor + 1000);
	idleTimer.unref?.();
}

async function startSearxng(signal?: AbortSignal): Promise<void> {
	if (!fs.existsSync(SEARXNG_PYTHON) || !fs.existsSync(SEARXNG_SETTINGS)) {
		throw new Error(
			`SearXNG is not installed in ${SEARXNG_DIR} (expected venv/bin/python and settings.yml).`,
		);
	}
	const logFd = fs.openSync(SEARXNG_LOG, "w");
	const child = spawn(SEARXNG_PYTHON, ["-m", "searx.webapp"], {
		cwd: SEARXNG_SRC,
		env: { ...process.env, SEARXNG_SETTINGS_PATH: SEARXNG_SETTINGS },
		detached: true,
		stdio: ["ignore", logFd, logFd],
	});
	child.unref();
	fs.closeSync(logFd);

	let exited = false;
	child.once("exit", () => {
		exited = true;
	});

	const deadline = Date.now() + STARTUP_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (await isHealthy()) return;
		// Another pi window may have won the race for the port; that's fine.
		if (exited && (await isHealthy())) return;
		if (exited) break;
		await sleep(300, signal);
	}
	if (await isHealthy()) return;
	throw new Error(`SearXNG failed to start. See log: ${SEARXNG_LOG}`);
}

async function ensureSearxng(signal?: AbortSignal): Promise<void> {
	if (await isHealthy()) return;
	if (!startingPromise) {
		startingPromise = startSearxng(signal).finally(() => {
			startingPromise = undefined;
		});
	}
	await startingPromise;
}

async function searxngSearch(
	query: string,
	count: number,
	signal?: AbortSignal,
): Promise<SearchResult[]> {
	markUsed();
	await ensureSearxng(signal);

	const url = new URL(`${SEARXNG_URL}/search`);
	url.searchParams.set("q", query);
	url.searchParams.set("format", "json");

	try {
		const resp = await fetch(url.toString(), { signal });
		if (!resp.ok) {
			const body = await resp.text();
			throw new Error(`SearXNG ${resp.status}: ${body.slice(0, 300)}`);
		}
		const data = (await resp.json()) as {
			results?: Array<{ title?: string; url: string; content?: string }>;
		};
		const seen = new Set<string>();
		const results: SearchResult[] = [];
		for (const item of data.results ?? []) {
			if (!item.url || seen.has(item.url)) continue;
			seen.add(item.url);
			results.push({
				title: (item.title ?? "").trim(),
				url: item.url,
				snippet: (item.content ?? "").replace(/\s+/g, " ").trim(),
			});
			if (results.length >= count) break;
		}
		return results;
	} finally {
		markUsed();
		checkIdle();
	}
}

function formatResults(results: SearchResult[]): string {
	if (results.length === 0) return "No results found.";
	return results
		.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
		.join("\n\n");
}

function stripWrappingQuotes(value: string): string {
	return value.length >= 2 && value.startsWith('"') && value.endsWith('"')
		? value.slice(1, -1).trim()
		: value;
}

function cleanItems(values?: string[]): string[] {
	if (!values) return [];
	return values
		.map((value) => stripWrappingQuotes(value.trim().replace(/\s+/g, " ")))
		.filter(Boolean);
}

function cleanQuery(value?: string): string | undefined {
	if (typeof value !== "string") return undefined;
	const cleaned = value.trim().replace(/\s+/g, " ");
	return cleaned || undefined;
}

function normalizeSite(site?: string): string | undefined {
	if (typeof site !== "string") return undefined;

	let value = site.trim().replace(/^site:/i, "").trim();
	if (!value) return undefined;

	try {
		const candidate = /^[a-z]+:\/\//i.test(value)
			? value
			: `https://${value}`;
		const url = new URL(candidate);
		if (url.hostname) value = url.hostname;
	} catch {}

	return value.replace(/\/+$/, "") || undefined;
}

function quoteForSearch(value: string): string {
	return `"${value.replace(/"/g, '\\"')}"`;
}

function buildSearchQuery(args: StructuredSearchArgs): BuiltSearchQuery {
	const baseQuery = cleanQuery(args.query);
	const exactPhrases = cleanItems(args.exactPhrases);
	const excludeTerms = cleanItems(args.excludeTerms);
	const site = normalizeSite(args.site);

	if (!baseQuery && exactPhrases.length === 0) {
		throw new Error(
			"At least one of 'query' or 'exactPhrases' is required.",
		);
	}

	const parts: string[] = [];
	if (baseQuery) parts.push(baseQuery);
	for (const phrase of exactPhrases) {
		parts.push(quoteForSearch(phrase));
	}
	for (const term of excludeTerms) {
		parts.push(`-${term.includes(" ") ? quoteForSearch(term) : term}`);
	}
	if (site) {
		parts.push(`site:${site}`);
	}

	return {
		query: parts.join(" "),
		baseQuery,
		exactPhrases,
		excludeTerms,
		site,
	};
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async () => {
		// Handle a server orphaned by a crashed or killed pi: stop if idle, else re-arm.
		if (findSearxngPids().length > 0) checkIdle();
	});

	pi.on("session_shutdown", async (event) => {
		clearIdleTimer();
		if (event.reason !== "quit") return;
		const last = readLastUsed();
		// Stop on exit only if this window was the last user; otherwise the
		// other window's idle timer is responsible.
		if (last?.pid === process.pid) stopSearxng();
	});

	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description:
			"Search the web via a local SearXNG instance (started on demand). Build one search per call from a base query string, exact phrases, exclusions, and an optional site. Returns title, URL, and snippet.",
		promptSnippet:
			"Search the web via a query string plus optional exactPhrases, excludeTerms, and site. Use one tool call per search angle.",
		promptGuidelines: [
			"Use exactPhrases for exact phrase matching instead of embedding quote marks inside the main query string.",
			"Use one web_search tool call per search angle instead of batching multiple searches into one call.",
		],

		parameters: Type.Object({
			query: Type.Optional(
				Type.String({
					description:
						"Base search query as a normal string. Prefer this for the main search wording.",
				}),
			),
			exactPhrases: Type.Optional(
				Type.Array(Type.String(), {
					description:
						"Exact phrases to match. Each item becomes a quoted phrase in the final search query.",
				}),
			),
			excludeTerms: Type.Optional(
				Type.Array(Type.String(), {
					description:
						"Terms or phrases to exclude. Multi-word items are excluded as exact phrases.",
				}),
			),
			site: Type.Optional(
				Type.String({
					description:
						"Optional site/domain restriction, such as example.com or a full URL.",
				}),
			),
			count: Type.Optional(
				Type.Number({
					description: "Number of results to return (default: 5, max: 20)",
					minimum: 1,
					maximum: 20,
				}),
			),
		}),

		async execute(_toolCallId, params: StructuredSearchArgs, signal) {
			const count = Math.min(Math.max(params.count ?? 5, 1), 20);
			const built = buildSearchQuery(params);
			const results = await searxngSearch(built.query, count, signal);

			return {
				content: [
					{
						type: "text" as const,
						text: formatResults(results),
					},
				],
				details: {
					composedQuery: built.query,
					query: built.baseQuery,
					exactPhrases: built.exactPhrases,
					excludeTerms: built.excludeTerms,
					site: built.site,
					resultCount: results.length,
				},
			};
		},

		renderCall(args, theme, context) {
			const text =
				(context.lastComponent as Text | undefined) ??
				new Text("", 0, 0);
			const { count, ...searchArgs } = args as StructuredSearchArgs;

			try {
				const built = buildSearchQuery(searchArgs);
				const display =
					built.query.length > 70
						? built.query.slice(0, 67) + "..."
						: built.query;
				const lines = [
					theme.fg("toolTitle", theme.bold("search ")) +
						theme.fg("accent", `"${display}"`),
				];
				if (count && count !== 5) {
					lines.push(theme.fg("dim", `  count: ${count}`));
				}
				text.setText(lines.join("\n"));
				return text;
			} catch {
				text.setText(
					theme.fg("toolTitle", theme.bold("search ")) +
						theme.fg("error", "(invalid query)"),
				);
				return text;
			}
		},

		renderResult(result, { expanded, isPartial }, theme, context) {
			const text =
				(context.lastComponent as Text | undefined) ??
				new Text("", 0, 0);

			if (isPartial) {
				text.setText(theme.fg("warning", "Searching…"));
				return text;
			}

			if (context.isError) {
				const msg =
					result.content.find((c) => c.type === "text")?.text ||
					"Error";
				text.setText(theme.fg("error", msg));
				return text;
			}

			const details = result.details as {
				composedQuery?: string;
				resultCount?: number;
			};
			const status = theme.fg(
				"success",
				`${details?.resultCount ?? 0} results`,
			);
			if (!expanded) {
				text.setText(status);
				return text;
			}

			const content =
				result.content.find((c) => c.type === "text")?.text || "";
			const preview =
				content.length > 500 ? content.slice(0, 500) + "..." : content;
			const queryLine = details?.composedQuery
				? theme.fg("dim", `query: ${details.composedQuery}`)
				: "";
			text.setText(
				[status, queryLine, theme.fg("dim", preview)]
					.filter(Boolean)
					.join("\n"),
			);
			return text;
		},
	});
}
