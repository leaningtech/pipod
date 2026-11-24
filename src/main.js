import { BrowserPod } from '@leaningtech/browserpod'
import { ACTIVE_MODEL, MODELS } from './models.js'
import { runBridge } from './bridge.js'
import patchTypebox from '../pod/patch-typebox.mjs?raw'
import patchPiBash from '../pod/patch-pi-bash.mjs?raw'
import providerSource from '../pod/webllm-provider.ts?raw'
import brandingSource from '../pod/branding.ts?raw'

const MODEL_ID = ACTIVE_MODEL;
const CONTEXT = 32768;
const MAX_TOKENS = 4096;
const HOME = "/home/user";
const BRIDGE_DIR = `${HOME}/bridge`;
const EXTENSION = `${HOME}/webllm-provider/index.ts`;
const NPM_PREFIX = `${HOME}/.npm-global`;
const LC_EXTENSIONS = `${NPM_PREFIX}/lib/node_modules/little-coder/.pi/extensions`;
const LITTLE_CODER_VERSION = "1.4.1";

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

const setup = [
  "#!/bin/bash",
  "set -e",
  `[ -x ${NPM_PREFIX}/bin/little-coder ] && exit 0`,
  `npm install -g --prefix ${NPM_PREFIX} little-coder@${LITTLE_CODER_VERSION}`,
  `node ${HOME}/patch-typebox.mjs ${NPM_PREFIX}/lib/node_modules`,
  `node ${HOME}/patch-pi-bash.mjs ${NPM_PREFIX}/lib/node_modules`,
  ""
].join("\n");

// Create a Terminal
const terminal = await pod.createDefaultTerminal(document.querySelector("#console"));

// Clear old bridge requests
await pod.run("bash", ["-c", `rm -rf ${BRIDGE_DIR}`], {terminal:terminal});

// Copy helpers into the pod
await pod.createDirectory(`${HOME}/webllm-provider`, {recursive:true});
await pod.createDirectory(BRIDGE_DIR, {recursive:true});
await writeFile(`${HOME}/patch-typebox.mjs`, patchTypebox);
await writeFile(`${HOME}/patch-pi-bash.mjs`, patchPiBash);
await writeFile(EXTENSION, providerSource);
await writeFile(`${HOME}/little-coder.sh`, launcher);
await writeFile(`${HOME}/setup.sh`, setup);

// Install little-coder once
loadPodEl.textContent = "Setting up little-coder";
const setupDone = pod.run("bash", [`${HOME}/setup.sh`], {terminal:terminal})
  .then(async () => {
    // Swap in PiPod branding
    await writeFile(`${LC_EXTENSIONS}/branding/index.ts`, brandingSource);
    await pod.run("bash", ["-c", `rm -rf ${LC_EXTENSIONS}/hello`], {terminal:terminal});
    loadPodEl.textContent = "PiPod is ready";
  });

const [engine] = await Promise.all([enginePromise.catch(() => null), setupDone]);

if (engine) {
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
