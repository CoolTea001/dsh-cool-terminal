import { hostname, userInfo } from "node:os";
import { basename } from "node:path";
//#region src/host/index.ts
/**
* Host entry for dsh-cool-terminal.
*
* The browser half owns the terminal UI. Every keystroke and every byte of
* output crosses back to this half over same-origin HTTP routes, because an
* out-of-tree bundle cannot generate a `ctx.remote` namespace and its Client
* half never sees the Host Cordis context.
*
* The terminal itself is a real PTY obtained from the `subprocess` seam
* (`spawnTerminal`): this half only owns the registry, the bounded replay
* buffer, and the SSE fan-out. Sizing is fixed at spawn time because the seam
* exposes no resize verb — the browser measures its viewport before asking for
* a terminal, so the initial size is the size the user sees.
*/
const name = "dsh-cool-terminal";
/** The web carrier is a hard dependency: without it there is no route to serve. */
const inject = ["webServer"];
/** Route table, kept in one place so both halves cannot drift. */
const ROUTES = {
	context: "/dsh-cool-terminal/api/context",
	open: "/dsh-cool-terminal/api/open",
	stream: "/dsh-cool-terminal/api/stream",
	input: "/dsh-cool-terminal/api/input",
	signal: "/dsh-cool-terminal/api/signal",
	close: "/dsh-cool-terminal/api/close"
};
/** Signals the subprocess terminal primitive accepts for the foreground group. */
const TERMINAL_SIGNALS = /* @__PURE__ */ new Set([
	"SIGINT",
	"SIGTERM",
	"SIGKILL",
	"SIGTSTP",
	"SIGHUP"
]);
/** Terminal geometry bounds; the browser's measurement is clamped into them. */
const MIN_COLS = 20;
const MAX_COLS = 400;
const MIN_ROWS = 5;
const MAX_ROWS = 200;
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
/** Replay kept per console so a reload rejoins the same shell with context. */
const MAX_REPLAY_BYTES = 262144;
/** Terminal cleanup grace before SIGKILL when a session is closed. */
const GRACE_MS = 3e3;
/** A console left with no attached browser is reaped after this long. */
const IDLE_MS = 9e5;
/** SSE comment cadence; keeps intermediaries from closing an idle stream. */
const KEEPALIVE_MS = 2e4;
/** How long a finished console's record stays answerable before it is dropped. */
const EXITED_TTL_MS = 3e5;
function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}
function sendJson(res, status, body) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	res.end(JSON.stringify(body));
}
/**
* Answer 405 unless the request uses one of the allowed methods.
*
* @returns true when the handler may proceed.
*/
function methodAllowed(req, res, allowed) {
	if (allowed.includes(req.method)) return true;
	sendJson(res, 405, {
		ok: false,
		error: "method not allowed"
	});
	return false;
}
async function readBody(req) {
	const chunks = [];
	for await (const chunk of req) chunks.push(Buffer.from(chunk));
	const text = Buffer.concat(chunks).toString("utf8");
	if (text === "") return {};
	const parsed = JSON.parse(text);
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("body must be a JSON object");
	return parsed;
}
/**
* Reject a state-changing cross-site request.
*
* The routes are localhost-trusted, but a PTY is a stronger hammer than one
* command, so a request that declares a foreign origin is refused instead of
* being handed a shell. A same-origin `fetch` omits `Origin` on some GETs, so
* an absent header is allowed.
*/
function sameOrigin(req) {
	const origin = req.headers?.origin;
	if (typeof origin !== "string" || origin === "" || origin === "null") return true;
	const host = req.headers?.host;
	if (typeof host !== "string" || host === "") return false;
	try {
		return new URL(origin).host === host;
	} catch {
		return false;
	}
}
function clampInt(value, min, max, fallback) {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, Math.trunc(value)));
}
/**
* Resolve the workdir a session was created with.
*
* `sessions.get` only answers for a live session, so a cold or foreign id
* falls back to the executor's own default instead of guessing.
*/
function workdirFor(ctx, sessionId) {
	if (typeof sessionId !== "string" || sessionId === "") return void 0;
	const sessions = ctx.get("sessions");
	if (sessions === void 0) return void 0;
	try {
		const cwd = sessions.get(sessionId)?.header?.cwd;
		return typeof cwd === "string" && cwd !== "" ? cwd : void 0;
	} catch {
		return;
	}
}
/**
* The directory this process would run an unqualified command in.
*
* Asking the `shell` seam keeps this consistent with the one-shot bash tool
* instead of hard-coding the harness process's own cwd.
*/
function defaultWorkdir(ctx) {
	const shell = ctx.get("shell");
	if (shell !== void 0) try {
		const spec = shell.resolve({ command: "pwd" });
		if (typeof spec?.workdir === "string" && spec.workdir !== "") return spec.workdir;
	} catch {}
	return process.cwd();
}
/**
* Resolve the directory a request must run in.
*
* Two mutually exclusive sources, both Host-authoritative:
*
* - `workspaceId` names a registered Workspace; its canonical directory comes
*   from the Host registry, so the browser never chooses an arbitrary path.
*   An unknown id is an error rather than a silent fallback: running in the
*   wrong directory is worse than refusing.
* - otherwise the session's own workdir, the original single-console behavior.
*/
function resolveWorkdir(ctx, body) {
	if (typeof body.workspaceId === "string" && body.workspaceId !== "") {
		const registry = ctx.get("workspaceRegistry");
		if (registry === void 0) return { error: "workspace registry unavailable" };
		try {
			const workspace = registry.get(body.workspaceId);
			if (workspace === void 0) return { error: `unknown workspace: ${body.workspaceId}` };
			const path = workspace.path;
			if (typeof path === "string" && path !== "") return { workdir: path };
			return { error: `workspace has no directory: ${body.workspaceId}` };
		} catch (error) {
			return { error: messageOf(error) };
		}
	}
	return { workdir: workdirFor(ctx, body.sessionId) };
}
/** The user's login shell, or the platform's fallback interpreter. */
function resolveShell() {
	const configured = process.env.SHELL;
	if (typeof configured === "string" && configured !== "") return configured;
	if (process.platform === "win32") return process.env.COMSPEC ?? "cmd.exe";
	return "/bin/sh";
}
/** Interactive argv for the resolved shell. */
function shellArgv(shell) {
	return process.platform === "win32" ? [shell] : [shell, "-i"];
}
function sendEvent(res, event, data) {
	const head = event === void 0 ? "" : `event: ${event}\n`;
	res.write(`${head}data: ${JSON.stringify(data)}\n\n`);
}
/** One chunked, base64-encoded output frame. */
function sendOutput(res, bytes) {
	sendEvent(res, void 0, { d: bytes.toString("base64") });
}
/**
* The PTY registry: one entry per console, shared by every route.
*
* It is created per plugin instance and torn down with the plugin's fiber, so
* stopping or reloading the plugin does not leave orphan shells behind.
*/
var PtyRegistry = class {
	ctx;
	sessions = /* @__PURE__ */ new Map();
	/** Console id to live session id, so a reloaded page rejoins its own shell. */
	byKey = /* @__PURE__ */ new Map();
	/** In-flight allocations per console id, so concurrent opens share one shell. */
	pending = /* @__PURE__ */ new Map();
	sequence = 0;
	constructor(ctx) {
		this.ctx = ctx;
	}
	get(id) {
		return typeof id === "string" ? this.sessions.get(id) : void 0;
	}
	/** The console id naming this request, or '' when the caller gave none. */
	keyOf(body) {
		return typeof body.consoleId === "string" && body.consoleId !== "" ? body.consoleId : "";
	}
	/**
	* The live session a console id is already bound to, if any.
	*
	* A session that has exited is dropped rather than reused: reattaching would
	* hand the user a console whose shell can never come back, which is worse
	* than a fresh prompt.
	*/
	liveFor(key) {
		const id = this.byKey.get(key);
		if (id === void 0) return void 0;
		const session = this.sessions.get(id);
		if (session !== void 0 && session.exited === null) return session;
		if (session !== void 0) this.forget(session);
		else this.byKey.delete(key);
	}
	/** Drop a session from both indexes and cancel its timers. */
	forget(session) {
		this.sessions.delete(session.id);
		if (session.key !== "" && this.byKey.get(session.key) === session.id) this.byKey.delete(session.key);
		this.cancelIdle(session);
		this.cancelReap(session);
	}
	/** Cancel the pending idle reap, because a browser is about to attach again. */
	cancelIdle(session) {
		if (session.idle === void 0) return;
		clearTimeout(session.idle);
		session.idle = void 0;
	}
	/** Cancel a scheduled record reap, because something is about to read it. */
	cancelReap(session) {
		if (session.reap === void 0) return;
		clearTimeout(session.reap);
		session.reap = void 0;
	}
	/**
	* Keep a finished console's record answerable for a while, so a reconnecting
	* browser still gets its replay, then drop the record and release its id.
	*/
	scheduleReap(session) {
		this.cancelReap(session);
		session.reap = setTimeout(() => {
			this.forget(session);
		}, EXITED_TTL_MS);
		session.reap.unref?.();
	}
	/**
	* Allocate a terminal, register it, and start pumping its output.
	*
	* When the request names a console that already owns a live session, that
	* session is handed back untouched. This is what makes a page reload rejoin
	* the same shell: without it, the reload would orphan the running shell and
	* silently start a second one, which is exactly the "terminal got reset"
	* symptom.
	*/
	async open(body) {
		const key = this.keyOf(body);
		if (key !== "") {
			const existing = this.liveFor(key);
			if (existing !== void 0) {
				this.cancelIdle(existing);
				return { session: existing };
			}
			const inflight = this.pending.get(key);
			if (inflight !== void 0) return inflight;
		}
		const allocation = this.spawn(body, key);
		if (key !== "") {
			this.pending.set(key, allocation);
			const settle = () => {
				if (this.pending.get(key) === allocation) this.pending.delete(key);
			};
			allocation.then(settle, settle);
		}
		return allocation;
	}
	async spawn(body, key) {
		const subprocess = this.ctx.get("subprocess");
		if (subprocess === void 0 || typeof subprocess.spawnTerminal !== "function") return {
			error: "subprocess service unavailable",
			status: 503
		};
		const target = resolveWorkdir(this.ctx, body);
		if (target.error !== void 0) return {
			error: target.error,
			status: 404
		};
		const cwd = target.workdir ?? defaultWorkdir(this.ctx);
		const shell = resolveShell();
		const id = `t${Date.now().toString(36)}-${(this.sequence += 1).toString(36)}`;
		const cols = clampInt(body.cols, MIN_COLS, MAX_COLS, DEFAULT_COLS);
		const rows = clampInt(body.rows, MIN_ROWS, MAX_ROWS, DEFAULT_ROWS);
		const env = {
			TERM: "xterm-256color",
			COLORTERM: "truecolor",
			TERM_PROGRAM: "dsh-cool-terminal",
			FORCE_COLOR: "3"
		};
		env.NO_COLOR = void 0;
		let handle;
		try {
			handle = await subprocess.spawnTerminal({
				argv: shellArgv(shell),
				cwd,
				env,
				rows,
				cols,
				graceMs: GRACE_MS
			});
		} catch (error) {
			return {
				error: messageOf(error),
				status: 500
			};
		}
		const session = {
			id,
			key,
			handle,
			cwd,
			shell,
			pid: typeof handle.pid === "number" ? handle.pid : 0,
			replay: [],
			replayBytes: 0,
			clients: /* @__PURE__ */ new Set(),
			exited: null,
			writes: Promise.resolve(),
			idle: void 0,
			keepalive: void 0,
			reap: void 0
		};
		this.sessions.set(id, session);
		if (key !== "") this.byKey.set(key, id);
		handle.output?.on?.("data", (chunk) => {
			this.broadcast(session, Buffer.from(chunk));
		});
		handle.output?.on?.("error", () => {
			this.finish(session, {
				exitCode: null,
				signal: null
			}, "terminal output stream failed");
		});
		handle.done.then((outcome) => this.finish(session, {
			exitCode: typeof outcome?.exitCode === "number" ? outcome.exitCode : null,
			signal: typeof outcome?.signal === "string" ? outcome.signal : null
		}), (error) => this.finish(session, {
			exitCode: null,
			signal: null
		}, messageOf(error)));
		return { session };
	}
	/** Retain output for replay and push it to every attached browser. */
	broadcast(session, bytes) {
		if (bytes.length === 0) return;
		session.replay.push(bytes);
		session.replayBytes += bytes.length;
		while (session.replayBytes > MAX_REPLAY_BYTES && session.replay.length > 1) {
			const dropped = session.replay.shift();
			session.replayBytes -= dropped?.length ?? 0;
		}
		for (const client of session.clients) if (!client.writableEnded) sendOutput(client, bytes);
	}
	/** Attach one SSE response, replaying what the console already printed. */
	attach(session, res) {
		this.cancelReap(session);
		this.cancelIdle(session);
		session.clients.add(res);
		this.ensureKeepalive(session);
		res.writeHead(200, {
			"content-type": "text/event-stream; charset=utf-8",
			"cache-control": "no-store, no-cache, must-revalidate",
			connection: "keep-alive",
			"x-accel-buffering": "no"
		});
		res.flushHeaders?.();
		res.write("retry: 1000\n\n");
		for (const chunk of session.replay) {
			if (res.writableEnded) return;
			sendOutput(res, chunk);
		}
		if (session.exited !== null) {
			sendEvent(res, "exit", session.exited);
			res.end();
			session.clients.delete(res);
			this.stopKeepalive(session);
			this.scheduleReap(session);
			return;
		}
		const detach = () => {
			session.clients.delete(res);
			if (session.clients.size === 0) {
				this.stopKeepalive(session);
				if (session.exited === null && session.idle === void 0) session.idle = setTimeout(() => {
					session.idle = void 0;
					this.close(session.id);
				}, IDLE_MS);
			}
		};
		res.on("close", detach);
		res.on("error", detach);
	}
	ensureKeepalive(session) {
		if (session.keepalive !== void 0) return;
		session.keepalive = setInterval(() => {
			for (const client of session.clients) {
				if (client.writableEnded) continue;
				client.write(":\n\n");
			}
		}, KEEPALIVE_MS);
		session.keepalive.unref?.();
	}
	stopKeepalive(session) {
		if (session.keepalive === void 0) return;
		clearInterval(session.keepalive);
		session.keepalive = void 0;
	}
	/** Queue a keystroke behind every earlier one so input order is preserved. */
	write(session, data) {
		if (session.exited !== null) return;
		session.writes = session.writes.then(() => session.handle.write(data)).catch(() => void 0);
	}
	finish(session, exit, detail) {
		if (session.exited !== null) return;
		session.exited = exit;
		this.stopKeepalive(session);
		this.cancelIdle(session);
		if (detail !== void 0) {
			const note = `\r\n\x1b[2m[终端结束: ${detail}]\x1b[0m\r\n`;
			this.broadcast(session, Buffer.from(note, "utf8"));
		}
		for (const client of session.clients) {
			if (client.writableEnded) continue;
			sendEvent(client, "exit", exit);
			client.end();
		}
		session.clients.clear();
		this.scheduleReap(session);
	}
	/** Close one console and forget it. */
	async close(id) {
		const session = this.sessions.get(id);
		if (session === void 0) return;
		const live = session.exited === null;
		if (live) session.exited = {
			exitCode: null,
			signal: null
		};
		this.forget(session);
		this.stopKeepalive(session);
		for (const client of session.clients) if (!client.writableEnded) client.end();
		session.clients.clear();
		if (live) try {
			await session.handle.terminate();
		} catch {}
	}
	/** Terminate every live terminal; used by the plugin's disposer. */
	async closeAll() {
		await Promise.all([...this.sessions.keys()].map((id) => this.close(id)));
	}
};
/** Report the workdir the open route would use, without spawning anything. */
async function handleContext(ctx, req, res) {
	const shell = ctx.get("shell");
	if (shell === void 0) {
		sendJson(res, 503, {
			ok: false,
			error: "shell service unavailable"
		});
		return;
	}
	if (!methodAllowed(req, res, ["GET", "POST"])) return;
	let body = {};
	if (req.method === "POST") try {
		body = await readBody(req);
	} catch (error) {
		sendJson(res, 400, {
			ok: false,
			error: messageOf(error)
		});
		return;
	}
	const target = resolveWorkdir(ctx, body);
	if (target.error !== void 0) {
		sendJson(res, 404, {
			ok: false,
			error: target.error
		});
		return;
	}
	try {
		sendJson(res, 200, {
			ok: true,
			workdir: shell.resolve(target.workdir === void 0 ? { command: "pwd" } : {
				command: "pwd",
				workdir: target.workdir
			}).workdir
		});
	} catch (error) {
		sendJson(res, 500, {
			ok: false,
			error: messageOf(error)
		});
	}
}
/** Allocate one terminal for a console. */
async function handleOpen(registry, req, res) {
	if (!methodAllowed(req, res, ["POST"])) return;
	let body;
	try {
		body = await readBody(req);
	} catch (error) {
		sendJson(res, 400, {
			ok: false,
			error: messageOf(error)
		});
		return;
	}
	const opened = await registry.open(body);
	if ("error" in opened) {
		sendJson(res, opened.status, {
			ok: false,
			error: opened.error
		});
		return;
	}
	const { session } = opened;
	let user = "";
	try {
		user = userInfo().username;
	} catch {}
	sendJson(res, 200, {
		ok: true,
		terminalId: session.id,
		pid: session.pid,
		cwd: session.cwd,
		shell: basename(session.shell),
		user,
		host: hostname()
	});
}
/** Stream one console's output; the response stays open until it exits. */
function handleStream(registry, req, res) {
	if (!methodAllowed(req, res, ["GET"])) return;
	let id = null;
	try {
		id = new URL(req.url ?? "/", "http://localhost").searchParams.get("terminalId");
	} catch {
		id = null;
	}
	const session = registry.get(id ?? void 0);
	if (session === void 0) {
		sendJson(res, 404, {
			ok: false,
			error: "unknown terminal"
		});
		return;
	}
	registry.attach(session, res);
}
/** Deliver keystrokes exactly as typed, without implicit newline conversion. */
async function handleInput(registry, req, res) {
	await mutateSession(registry, req, res, (session, body) => {
		if (typeof body.data !== "string" || body.data === "") return { ok: true };
		registry.write(session, body.data);
		return { ok: true };
	});
}
/** Signal the foreground process group (Ctrl+C from the toolbar). */
async function handleSignal(registry, req, res) {
	await mutateSession(registry, req, res, async (session, body) => {
		const signal = typeof body.signal === "string" ? body.signal : "SIGINT";
		if (!TERMINAL_SIGNALS.has(signal)) return {
			error: `unsupported signal: ${signal}`,
			status: 400
		};
		if (session.exited !== null) return {
			ok: true,
			delivered: false
		};
		try {
			return {
				ok: true,
				delivered: true,
				targetPgid: await session.handle.signalForeground(signal)
			};
		} catch (error) {
			return {
				ok: false,
				error: messageOf(error)
			};
		}
	});
}
/** Terminate one console's whole process session. */
async function handleClose(registry, req, res) {
	await mutateSession(registry, req, res, async (session) => {
		await registry.close(session.id);
		return { ok: true };
	});
}
/** Shared validation for the POST routes that address one console. */
async function mutateSession(registry, req, res, run) {
	if (!methodAllowed(req, res, ["POST"])) return;
	let body;
	try {
		body = await readBody(req);
	} catch (error) {
		sendJson(res, 400, {
			ok: false,
			error: messageOf(error)
		});
		return;
	}
	const session = registry.get(body.terminalId);
	if (session === void 0) {
		sendJson(res, 404, {
			ok: false,
			error: "unknown terminal"
		});
		return;
	}
	try {
		sendJson(res, 200, await run(session, body));
	} catch (error) {
		sendJson(res, 500, {
			ok: false,
			error: messageOf(error)
		});
	}
}
function apply(ctx) {
	const registry = new PtyRegistry(ctx);
	/** Every route shares the same cross-site refusal. */
	const guard = (handler) => (req, res) => {
		if (!sameOrigin(req)) {
			sendJson(res, 403, {
				ok: false,
				error: "cross-origin request refused"
			});
			return;
		}
		return handler(req, res);
	};
	/** Register one exact route behind that shared guard. */
	const route = (path, handler) => ctx.webServer.register({
		kind: "exact",
		path,
		handler: guard(handler)
	});
	ctx.effect(() => {
		const disposers = [
			route(ROUTES.context, (req, res) => handleContext(ctx, req, res)),
			route(ROUTES.open, (req, res) => handleOpen(registry, req, res)),
			route(ROUTES.stream, (req, res) => handleStream(registry, req, res)),
			route(ROUTES.input, (req, res) => handleInput(registry, req, res)),
			route(ROUTES.signal, (req, res) => handleSignal(registry, req, res)),
			route(ROUTES.close, (req, res) => handleClose(registry, req, res))
		];
		return () => {
			for (const dispose of disposers) dispose();
			registry.closeAll();
		};
	}, "dsh-cool-terminal: terminal routes");
}
//#endregion
export { ROUTES, apply, inject, name };
