import { BrowserPod } from '@leaningtech/browserpod'
import { ACTIVE_MODEL, MODELS } from './models.js'
import { runBridge } from './bridge.js'
import providerSource from '../pod/webllm-provider.ts?raw'

// Built by build-little-coder.sh
const PART_URLS = Object.entries(import.meta.glob('../pod/little-coder.tgz.*', { query:'?url', import:'default', eager:true }))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url);

const MODEL_ID = ACTIVE_MODEL;
const CONTEXT = 32768;
const MAX_TOKENS = 4096;
const HOME = "/home/user";
const BRIDGE_DIR = `${HOME}/bridge`;
const EXTENSION = `${HOME}/webllm-provider/index.ts`;
const NPM_PREFIX = `${HOME}/.npm-global`;
const MARKER = `${NPM_PREFIX}/.pipod-build`;
const BUILD_ID = PART_URLS.join(" ");
const CHUNK = 4 * 1024 * 1024;

const statusEl = document.querySelector("#status");
const loadingEl = document.querySelector("#loading");
const loadModelEl = document.querySelector("#load-model");
const loadPodEl = document.querySelector("#load-pod");
const setStatus = (text) => { statusEl.textContent = loadModelEl.textContent = text; };

// Load the model's engine
const ENGINES = {
  sipp:() => import('./sipp-engine.js'),
  litert:() => import('./litert-engine.js'),
};
const config = MODELS[ACTIVE_MODEL];
const enginePromise = ENGINES[config.engine ?? "sipp"]().then(({ createEngine }) => createEngine({
  model:config,
  context:CONTEXT,
  onStatus:(text) => setStatus(`${MODEL_ID}: ${text}`)
}));
enginePromise.catch((err) => setStatus(`Model failed to load: ${err.message}`));

// Initialize the Pod
// VITE_BP_APIKEY is an environmental variable containing your Api Key
// Its value is defined in the file `.env` in the project's main directory
// To get an Api Key, visit https://console.browserpod.io
const pod = await BrowserPod.boot({
  apiKey:import.meta.env.VITE_BP_APIKEY,
  storageKey:"little-coder-v2"
});

// Show a link for each portal
const portalsEl = document.querySelector("#portals");
const portalItems = new Map();
pod.onPortal(({url, port}) => {
  let item = portalItems.get(port);
  if (!item) {
    item = document.createElement("li");
    portalItems.set(port, item);
    portalsEl.append(item);
  }
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = url;
  item.replaceChildren(`Port ${port}: `, link);
});

async function writeFile(path, text) {
  const file = await pod.createFile(path, "utf-8");
  await file.write(text);
  await file.close();
}

const launcher = [
  "#!/bin/bash",
  `export WEBLLM_BRIDGE_DIR=${BRIDGE_DIR}`,
  `export WEBLLM_MODEL=${MODEL_ID}`,
  `export WEBLLM_CONTEXT=${CONTEXT}`,
  `export WEBLLM_MAX_TOKENS=${MAX_TOKENS}`,
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
  const tgz = `${HOME}/little-coder.tgz`;
  const file = await pod.createFile(tgz, "binary");
  for (const url of PART_URLS) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    const data = await res.arrayBuffer();
    for (let i = 0; i < data.byteLength; i += CHUNK) await file.write(data.slice(i, i + CHUNK));
  }
  await file.close();
  loadPodEl.textContent = "Unpacking PiPod";
  const unpack = `rm -rf ${NPM_PREFIX} && mkdir -p ${NPM_PREFIX} && tar xzf ${tgz} -C ${NPM_PREFIX} && rm ${tgz} && printf '%s' '${BUILD_ID}' > ${MARKER}`;
  await pod.run("bash", ["-c", unpack], {terminal:terminal});
  if (await readFile(MARKER) !== BUILD_ID) throw new Error("unpacking did not finish");
}

// Create a Terminal
const terminal = await pod.createDefaultTerminal(document.querySelector("#console"));

// Clear old bridge requests
await pod.run("bash", ["-c", `rm -rf ${BRIDGE_DIR}`], {terminal:terminal});

// Copy helpers into the pod
await pod.createDirectory(`${HOME}/webllm-provider`, {recursive:true});
await pod.createDirectory(BRIDGE_DIR, {recursive:true});
await writeFile(EXTENSION, providerSource);
await writeFile(`${HOME}/little-coder.sh`, launcher);

const installed = installLittleCoder()
  .then(() => { loadPodEl.textContent = "PiPod is ready"; return true; })
  .catch((err) => { loadPodEl.textContent = `Setup failed: ${err.message}`; return false; });

const [engine, ready] = await Promise.all([enginePromise.catch(() => null), installed]);

if (engine && ready) {
  // Connect the pod to the model
  runBridge({
    engine,
    modelId:MODEL_ID,
    pod,
    dir:BRIDGE_DIR,
    onStatus:(s) => setStatus(s === "generating" ? `${MODEL_ID}: generating` : `${MODEL_ID}: ready`)
  });

  // Launch, then fall back to bash
  loadingEl.hidden = true;
  await pod.run("bash", [`${HOME}/little-coder.sh`], {terminal:terminal});
  await pod.run("bash", [], {terminal:terminal});
}
