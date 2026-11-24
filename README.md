# PiPod

A coding agent that runs entirely in your browser. PiPod pairs [BrowserPod](https://browserpod.io), which runs Node.js in the page, with [Little Coder](https://github.com/itayinbarr/little-coder), a fork of [Pi](https://github.com/badlogic/pi-mono) tuned for small models. The model runs on your GPU through [LiteRT-LM](https://github.com/google-ai-edge/LiteRT-LM) and WebGPU, so nothing leaves your machine.

## Requirements

- A browser with WebGPU, such as a recent Chrome or Edge
- About 3GB of free disk space for the model, which is cached after the first load
- A BrowserPod API key from [console.browserpod.io](https://console.browserpod.io)

## Run locally

```bash
cp .env.example .env   # then add your key
npm install
npm run dev
```

The first visit downloads the model and installs Little Coder inside the pod. Later visits reuse both.

## Choosing a model

Models are listed in `src/models.js`. Change `ACTIVE_MODEL` to switch:

- `gemma-4-E4B-it` (default, LiteRT)
- `gemma-4-E2B-it` (smaller and faster, LiteRT)
- `Qwen3.5-4B-Q4_K_M` (llama.cpp through Sipp)

## Deploy to Cloudflare Pages

Connect this repo to a Cloudflare Pages project with these settings:

- Build command: `npm run build`
- Build output directory: `dist`
- Environment variable: `VITE_BP_APIKEY`, set as a secret

`public/_headers` sends the cross-origin isolation headers BrowserPod needs.

## How it works

- `src/main.js` boots the pod, installs Little Coder and starts it in the terminal.
- `src/litert-engine.js` and `src/sipp-engine.js` run the model in the page.
- `src/bridge.js` passes requests between the pod and the model through files.
- `pod/webllm-provider.ts` is the Pi extension that sends Little Coder's requests to the bridge.
- `pod/branding.ts` replaces Little Coder's startup header with PiPod's.

## Credits

Little Coder is by Itay Inbar and Pi is by Mario Zechner, both under their own licences. They are installed from npm at run time and are not part of this repo.
