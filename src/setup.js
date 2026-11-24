import { DEFAULT_MODEL, MODELS } from './models.js'
import { BROWSERPOD_URL, BROWSERPOD_VERSION, REPO_URL } from './config.js'

function modelOption(id, config) {
  const label = document.createElement("label");
  label.className = "option";
  const input = document.createElement("input");
  input.type = "radio";
  input.name = "model";
  input.value = id;
  input.checked = id === DEFAULT_MODEL;
  const name = document.createElement("span");
  name.className = "option-name";
  name.textContent = `${config.name} (${config.size})`;
  label.append(input, name);
  if (config.unstable) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = "Unstable";
    const note = document.createElement("span");
    note.className = "hint";
    note.textContent = config.unstable;
    name.append(" ", tag);
    label.append(note);
  }
  return label;
}

// Footer links and the demo fallback
function fillLinks(form) {
  form.querySelector("#repo-link").href = REPO_URL;
  form.querySelector("#powered-link").href = BROWSERPOD_URL;
  form.querySelector("#bp-version").textContent = `v${BROWSERPOD_VERSION}`;
  const img = form.querySelector("#demo-img");
  const placeholder = form.querySelector("#demo-placeholder");
  // A missing file can come back as the app's HTML, so this also catches a non-image
  const showPlaceholder = () => { img.hidden = true; placeholder.hidden = false; };
  img.addEventListener("error", showPlaceholder);
  if (img.complete && img.naturalWidth === 0) showPlaceholder();
}

// Resolves once Start is pressed
export function chooseSetup({ hasKey }) {
  const setupEl = document.querySelector("#setup");
  const form = document.querySelector("#setup-form");
  const models = document.querySelector("#models");
  const legacy = document.querySelector("#legacy-models");
  for (const [id, config] of Object.entries(MODELS)) {
    (config.engine === "sipp" ? legacy : models).append(modelOption(id, config));
  }
  const keyed = form.querySelector('input[value="key"]');
  keyed.disabled = !hasKey;
  form.querySelector(hasKey ? 'input[value="key"]' : 'input[value="keyless"]').checked = true;
  document.querySelector("#no-key").hidden = hasKey;
  fillLinks(form);
  setupEl.hidden = false;

  return new Promise((resolve) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      setupEl.hidden = true;
      resolve({ modelId:data.get("model"), keyed:data.get("network") === "key" });
    }, { once:true });
  });
}
