import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BRIDGE_DIR = process.env.WEBLLM_BRIDGE_DIR || "/home/user/bridge";
const MODEL_ID = process.env.WEBLLM_MODEL || "Qwen3.5-4B-Q4_K_M";
const CONTEXT = Number(process.env.WEBLLM_CONTEXT || 32768);
const MAX_TOKENS = Number(process.env.WEBLLM_MAX_TOKENS || 4096);
const BASE_URL = "http://webllm.bridge/v1";
const REQUEST_FILE = join(BRIDGE_DIR, "request.json");
const POLL_MS = 40;

const SERVER_GUIDANCE = [
  "## Running servers and other long-running processes",
  "Never run a long-running process (a web server, `npm start`, `npm run dev`, a file watcher) in the foreground or with a plain `&`.",
  "The bash tool waits for all output to close, so the command would never return and you would be stuck.",
  "Always start it detached, with its output sent to a log file and stdin from /dev/null, for example:",
  "`cd /home/user/my-app && node app.js > /tmp/my-app.log 2>&1 < /dev/null &`",
  "Then confirm it started with `sleep 2 && cat /tmp/my-app.log`.",
  "When a server listens on a port, the user automatically gets a link to it, so just tell them which port it is on.",
].join("\n");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function removeRequest(id: string) {
  try {
    const current = JSON.parse(readFileSync(REQUEST_FILE, "utf-8"));
    if (current?.id === id) rmSync(REQUEST_FILE, { force: true });
  } catch {}
}

async function* responses(id: string, signal?: AbortSignal) {
  for (let seq = 0; ; ) {
    if (signal?.aborted) return;
    const file = join(BRIDGE_DIR, `res-${id}-${seq}.json`);
    if (existsSync(file)) {
      let msg: any;
      try {
        msg = JSON.parse(readFileSync(file, "utf-8"));
      } catch {
        await sleep(POLL_MS);
        continue;
      }
      rmSync(file, { force: true });
      seq++;
      yield msg;
      if (msg.done) return;
    } else {
      await sleep(POLL_MS);
    }
  }
}

function bridgeResponse(body: any, signal?: AbortSignal): Response {
  const id = randomUUID();
  mkdirSync(BRIDGE_DIR, { recursive: true });
  const tmp = `${REQUEST_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify({ id, body }));
  renameSync(tmp, REQUEST_FILE);
  signal?.addEventListener("abort", () => removeRequest(id), { once: true });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sse = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        for await (const msg of responses(id, signal)) {
          for (const ev of msg.events || []) sse(ev);
          if (msg.error) sse({ error: { message: msg.error } });
          if (msg.done) {
            if (!body.stream && msg.final) controller.enqueue(enc.encode(JSON.stringify(msg.final)));
            if (body.stream) controller.enqueue(enc.encode("data: [DONE]\n\n"));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      } finally {
        removeRequest(id);
      }
    },
  });

  const type = body.stream ? "text/event-stream" : "application/json";
  return new Response(stream, { status: 200, headers: { "content-type": type } });
}

// Route bridge URLs to files
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
  if (typeof url === "string" && url.startsWith(BASE_URL)) {
    if (!url.startsWith(`${BASE_URL}/chat/completions`)) {
      return new Response(JSON.stringify({ object: "list", data: [{ id: MODEL_ID, object: "model" }] }), {
        headers: { "content-type": "application/json" },
      });
    }
    const raw = init?.body ?? (input instanceof Request ? await input.text() : "{}");
    return bridgeResponse(JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)), init?.signal);
  }
  return realFetch(input, init);
}) as typeof fetch;

export default function (pi: any) {
  pi.on("before_agent_start", async (event: any) => ({
    systemPrompt: `${event.systemPrompt}\n\n${SERVER_GUIDANCE}`,
  }));

  pi.registerProvider("webllm", {
    baseUrl: BASE_URL,
    apiKey: "webllm",
    api: "openai-completions",
    models: [
      {
        id: MODEL_ID,
        name: `${MODEL_ID} (in browser)`,
        reasoning: true,
        input: ["text"],
        contextWindow: CONTEXT,
        maxTokens: MAX_TOKENS,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    ],
  });
}
