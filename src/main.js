import { MODELS } from './models.js'
import { runBridge } from './bridge.js'
import { chooseSetup } from './setup.js'
import { BROWSERPOD_URL, BROWSERPOD_VERSION, LITERT_URL, REPO_URL } from './config.js'
import providerSource from '../pod/webllm-provider.ts?raw'

// Built by build-little-coder.sh
const PART_URLS = Object.entries(import.meta.glob('../pod/little-coder.tgz.*', { query:'?url', import:'default', eager:true }))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url);

// BP_APIKEY comes from .env (VITE_BP_APIKEY still works)
const API_KEY = import.meta.env.BP_APIKEY || import.meta.env.VITE_BP_APIKEY;

// Nothing downloads before this
const { modelId:MODEL_ID, keyed } = await chooseSetup({ hasKey:!!API_KEY });
const config = MODELS[MODEL_ID];

const CONTEXT = config.context ?? 32768;
const MAX_TOKENS = config.maxTokens ?? 4096;
const HOME = "/home/user";
const BRIDGE_DIR = `${HOME}/bridge`;
const EXTENSION = `${HOME}/webllm-provider/index.ts`;
const NPM_PREFIX = `${HOME}/.npm-global`;
const MARKER = `${NPM_PREFIX}/.pipod-build`;
const BUILD_ID = PART_URLS.join(" ");
const CHUNK = 4 * 1024 * 1024;
const PORTAL_FILE = `${HOME}/.pipod-portal`;

const loadingEl = document.querySelector("#loading");
const loadModelEl = document.querySelector("#load-model");
const loadPodEl = document.querySelector("#load-pod");
const setStatus = (text) => { loadModelEl.textContent = text; };

const panesEl = document.querySelector(".panes");
const tabsEl = document.querySelector(".tabs");
const addEl = document.querySelector(".add");
const portsEl = document.querySelector("#ports");
for (const el of document.querySelectorAll(".model-name")) el.textContent = config.name;
document.querySelector("#sb-repo").href = REPO_URL;
document.querySelector("#sb-powered").href = BROWSERPOD_URL;
document.querySelector("#sb-version").textContent = `v${BROWSERPOD_VERSION}`;
document.querySelector("#sb-litert").href = LITERT_URL;
if (!keyed) portsEl.firstElementChild.textContent = "Preview links need internet access";

// Drag to resize panes
const MIN_PANE = 60;
panesEl.addEventListener("pointerdown", (e) => {
  if (!e.target.matches(".divider")) return;
  e.preventDefault();
  e.target.setPointerCapture(e.pointerId);
  // Pin sizes as flex-grow
  for (const p of panesEl.querySelectorAll(".pane")) p.style.flex = `${p.offsetHeight} 1 0`;
});
panesEl.addEventListener("pointermove", (e) => {
  const divider = e.target;
  if (!divider.matches(".divider") || !divider.hasPointerCapture(e.pointerId)) return;
  const above = divider.previousElementSibling;
  const below = divider.nextElementSibling;
  const total = above.offsetHeight + below.offsetHeight;
  const y = Math.min(Math.max(e.clientY - above.getBoundingClientRect().top, MIN_PANE), total - MIN_PANE);
  above.style.flex = `${y} 1 0`;
  below.style.flex = `${total - y} 1 0`;
});

// Highlight follows the pane
const activeNameEl = document.querySelector("#active-name");
function setActive(pane) {
  if (!pane) return;
  for (const el of document.querySelectorAll(".pane.active, .tab.active")) el.classList.remove("active");
  pane.classList.add("active");
  tabsEl.querySelector(`[data-pane="${pane.dataset.pane}"]`)?.classList.add("active");
  activeNameEl.textContent = pane.querySelector(".pane-header b").textContent;
}
panesEl.addEventListener("focusin", (e) => setActive(e.target.closest(".pane")));
panesEl.addEventListener("pointerdown", (e) => setActive(e.target.closest(".pane")));

tabsEl.addEventListener("click", (e) => {
  const id = e.target.closest(".tab")?.dataset.pane;
  const pane = id && panesEl.querySelector(`.pane[data-pane="${id}"]`);
  if (!pane) return;
  setActive(pane);
  pane.querySelector("textarea")?.focus();
});

// Close removes the pane only
panesEl.addEventListener("click", (e) => {
  if (!e.target.matches(".close")) return;
  const pane = e.target.closest(".pane");
  (pane.previousElementSibling ?? pane.nextElementSibling)?.remove();
  tabsEl.querySelector(`[data-pane="${pane.dataset.pane}"]`)?.remove();
  pane.remove();
  for (const p of panesEl.querySelectorAll(".pane")) p.style.flex = "";
  if (pane.classList.contains("active")) setActive(panesEl.querySelector(".pane"));
});

// Help dialog
const helpEl = document.querySelector("#help");
document.addEventListener("click", (e) => {
  if (e.target.matches(".help-btn")) helpEl.showModal();
});
helpEl.addEventListener("click", (e) => {
  if (e.target === helpEl) helpEl.close();
});

// Load the model's engine
const ENGINES = {
  sipp:() => import('./sipp-engine.js'),
  litert:() => import('./litert-engine.js'),
};
const enginePromise = ENGINES[config.engine ?? "sipp"]().then(({ createEngine }) => createEngine({
  model:config,
  context:CONTEXT,
  onStatus:(text) => setStatus(`${config.name}: ${text}`)
}));
enginePromise.catch((err) => setStatus(`Model failed to load: ${err.message}`));

// Initialize the Pod
const { BrowserPod } = await import('@leaningtech/browserpod');
// Keyless: no portals, npm works
const pod = await BrowserPod.boot({
  ...(keyed ? { apiKey:API_KEY } : { network:await BrowserPod.createFetchNetwork({ fetch:BrowserPod.opinionatedFetch }) }),
  storageKey:"little-coder-v2"
});

// Pi's footer shows the latest
pod.onPortal(({url, port}) => {
  console.log(`[portal] ${new Date().toISOString()} port ${port} ${url}`);
  writeFile(PORTAL_FILE, `Port ${port}: ${url}`).catch(console.error);
  showPortal(url, port);
});

// List portals in the sidebar
function showPortal(url, port) {
  if (!/^https?:\/\//.test(url)) return;
  portsEl.querySelector("li:not([data-port])")?.remove();
  let li = portsEl.querySelector(`[data-port="${Number(port)}"]`);
  if (!li) {
    li = document.createElement("li");
    li.dataset.port = Number(port);
    portsEl.append(li);
  }
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.title = url;
  link.textContent = `${port}  ${url}`;
  li.replaceChildren(link);
}

// Requests wait their turn
function queued(engine) {
  let turn = Promise.resolve();
  return {
    ...engine,
    generate(body, opts) {
      const run = turn.then(() => {
        if (opts.signal?.aborted) throw new Error("Request cancelled");
        return engine.generate(body, opts);
      });
      turn = run.catch(() => {});
      return run;
    }
  };
}

let sharedEngine = null;
const counts = { bash:1, pipod:1 };

// New pane from "+ Add"
async function addPane(kind) {
  const n = ++counts[kind];
  const id = `${kind}-${n}`;
  const name = `${kind === "bash" ? "Bash" : config.name} ${n}`;
  for (const p of panesEl.querySelectorAll(".pane")) p.style.flex = "";

  const pane = document.querySelector("#pane-template").content.cloneNode(true);
  const section = pane.querySelector(".pane");
  section.classList.add(kind);
  section.dataset.pane = id;
  pane.querySelector(".pane-name").textContent = name;
  const termEl = pane.querySelector("pre");
  if (!panesEl.querySelector(".pane")) pane.querySelector(".divider").remove();
  panesEl.append(pane);

  const tab = document.querySelector("#tab-template").content.cloneNode(true);
  tab.querySelector(".tab").classList.add(kind);
  tab.querySelector(".tab").dataset.pane = id;
  tab.querySelector(".tab-name").textContent = name;
  tabsEl.append(tab);
  setActive(section);

  const term = await pod.createDefaultTerminal(termEl);
  if (kind === "pipod") {
    const dir = `${BRIDGE_DIR}-${n}`;
    await pod.createDirectory(dir, {recursive:true});
    runBridge({ engine:sharedEngine, modelId:MODEL_ID, pod, dir });
    await pod.run("bash", [`${HOME}/little-coder.sh`], {terminal:term, env:[`WEBLLM_BRIDGE_DIR=${dir}`]});
  }
  await pod.run("bash", [], {terminal:term});
}

addEl.addEventListener("click", (e) => {
  const kind = e.target.dataset?.kind;
  if (!kind || e.target.disabled) return;
  addEl.open = false;
  addPane(kind).catch(console.error);
});
const enableAdd = (kind) => { addEl.querySelector(`[data-kind="${kind}"]`).disabled = false; };

async function writeFile(path, text) {
  const file = await pod.createFile(path, "utf-8");
  await file.write(text);
  await file.close();
}

const launcher = [
  "#!/bin/bash",
  `export WEBLLM_BRIDGE_DIR=\${WEBLLM_BRIDGE_DIR:-${BRIDGE_DIR}}`,
  `export WEBLLM_MODEL=${MODEL_ID}`,
  `export WEBLLM_CONTEXT=${CONTEXT}`,
  `export WEBLLM_MAX_TOKENS=${MAX_TOKENS}`,
  `export WEBLLM_REASONING=${config.thinking ? 1 : 0}`,
  `export PIPOD_MODEL_NAME='${config.name}'`,
  `export PIPOD_ENGINE=${config.engine ?? "sipp"}`,
  `export PIPOD_FOOTER='${REPO_URL.replace(/^https?:\/\//, "")} | Powered by BrowserPod v${BROWSERPOD_VERSION} (browserpod.io) | LiteRT-LM by Google AI Edge (${LITERT_URL.replace(/^https?:\/\//, "")})'`,
  `export PIPOD_PORTAL_FILE=${PORTAL_FILE}`,
  `export PIPOD_PORTALS=${keyed ? 1 : 0}`,
  "export LITTLE_CODER_PERMISSION_MODE=accept-all",
  `exec ${NPM_PREFIX}/bin/little-coder --no-update-check --extension ${EXTENSION} --model webllm/${MODEL_ID} "$@"`,
  ""
].join("\n");

async function readFile(path) {
  let file;
  try {
    file = await pod.openFile(path, "utf-8");
  } catch {
    return "";
  }
  try {
    return await file.read(await file.getSize());
  } finally {
    await file.close();
  }
}

// Copy in prebuilt little-coder
async function installLittleCoder() {
  if (await readFile(MARKER) === BUILD_ID) return;
  loadPodEl.textContent = "Copying PiPod into the pod";
  const parts = await Promise.all(PART_URLS.map(async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    return res.blob();
  }));
  // Gunzip in the page, not the pod
  const gunzipped = new Blob(parts).stream().pipeThrough(new DecompressionStream("gzip"));
  const data = await new Response(gunzipped).arrayBuffer();
  const tar = `${HOME}/little-coder.tar`;
  const file = await pod.createFile(tar, "binary");
  for (let i = 0; i < data.byteLength; i += CHUNK) await file.write(data.slice(i, i + CHUNK));
  await file.close();
  loadPodEl.textContent = "Unpacking PiPod";
  const unpack = `mkdir -p ${NPM_PREFIX} && tar xf ${tar} -C ${NPM_PREFIX} && rm ${tar} && printf '%s' '${BUILD_ID}' > ${MARKER}`;
  await pod.run("bash", ["-c", unpack], {terminal:terminal});
  if (await readFile(MARKER) !== BUILD_ID) throw new Error("unpacking did not finish");
}

// Create a Terminal
const terminal = await pod.createDefaultTerminal(document.querySelector("#console"));

// Second shell, same pod
const bashTerminal = await pod.createDefaultTerminal(document.querySelector("#bash"));
pod.run("bash", [], {terminal:bashTerminal});
enableAdd("bash");

// Clear old requests and portal
await pod.run("bash", ["-c", `rm -rf ${BRIDGE_DIR} ${BRIDGE_DIR}-* ${PORTAL_FILE}`], {terminal:terminal});

// Copy helpers into the pod
await pod.createDirectory(`${HOME}/webllm-provider`, {recursive:true});
await pod.createDirectory(BRIDGE_DIR, {recursive:true});
await writeFile(EXTENSION, providerSource);
await writeFile(`${HOME}/little-coder.sh`, launcher);

const installed = installLittleCoder()
  .then(() => { loadPodEl.textContent = "PiPod is ready"; return true; })
  .catch((err) => { console.error(err); loadPodEl.textContent = `Setup failed: ${err.message}`; return false; });

const [engine, ready] = await Promise.all([enginePromise.catch(() => null), installed]);

if (engine && ready) {
  // Connect the pod to the model
  sharedEngine = queued(engine);
  runBridge({
    engine:sharedEngine,
    modelId:MODEL_ID,
    pod,
    dir:BRIDGE_DIR
  });
  enableAdd("pipod");

  // Launch, then fall back to bash
  loadingEl.hidden = true;
  await pod.run("bash", [`${HOME}/little-coder.sh`], {terminal:terminal});
  await pod.run("bash", [], {terminal:terminal});
}
