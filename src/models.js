export const MODELS = {
  "Qwen3.5-4B-Q4_K_M": {
    url:"https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf",
    toolFormat:"template",
    sampling:{
      temperature:0.7,
      top_p:0.8,
      top_k:20,
      min_p:0,
      presence_penalty:1.5,
      repeat_penalty:1.0,
      repeat_last_n:256,
    },
  },
  "Tiny-Agent-a-0.5B-Q4_K_M": {
    url:"https://huggingface.co/driaforall/Tiny-Agent-a-0.5B/resolve/main/dria-agent-a-0.5b.Q4_K_M.gguf",
    toolFormat:"pythonic",
    tools:["bash", "read", "write", "edit"],
    system:[
      "You are a coding agent working in a Linux sandbox.",
      "Your home folder is /home/user. Create each project in its own folder there.",
      "Node.js and npm are installed. Use bash to run shell commands.",
      "Each reply starts in a new shell, so begin commands with cd into the project folder.",
      "Use write to create every source file before you run it.",
      "Run servers in the background with their output sent to a log file.",
    ].join("\n"),
    sampling:{
      temperature:0.3,
      top_p:0.8,
      top_k:20,
      min_p:0,
      repeat_penalty:1.05,
    },
  },
  "gemma-4-E4B-it": {
    engine:"litert",
    url:"https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.litertlm",
    toolFormat:"native",
    sampling:{ temperature:1.0, p:0.95, k:64 },
  },
  "gemma-4-E2B-it": {
    engine:"litert",
    url:"https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm",
    toolFormat:"native",
    sampling:{ temperature:1.0, p:0.95, k:64 },
  },
};

// Change this to switch model
export const ACTIVE_MODEL = "gemma-4-E4B-it";
