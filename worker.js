/**
 * Iris AI — LLM Chat Platform Worker
 *
 * Routes:
 *   GET  /                    → Chat UI
 *   GET  /favicon-dark.png    → Dark favicon (SVG)
 *   GET  /favicon-light.png   → Light favicon (SVG)
 *   GET  /background-dark.png → Dark grid overlay (SVG)
 *   GET  /background-light.png→ Light grid overlay (SVG)
 *   POST /api/chat            → Groq streaming chat (SSE)
 *   POST /api/devbox/start    → Start devbox session (stub)
 *   POST /api/devbox/stop     → Stop devbox session (stub)
 *   POST /api/devbox/upload   → Upload files to devbox (stub)
 *   GET  /api/devbox/status   → Devbox session status (stub)
 */

// ─── CORS ─────────────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

// ─── SVG ASSETS ───────────────────────────────────────────────────────────────

const FAVICON_DARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <ellipse cx="16" cy="16" rx="14" ry="8.5" stroke="#dce0df" stroke-width="1.8"/>
  <circle cx="16" cy="16" r="5.5" fill="#dce0df"/>
  <circle cx="16" cy="16" r="2.2" fill="#231f20"/>
  <circle cx="17.6" cy="14.4" r="0.9" fill="#dce0df" opacity="0.7"/>
</svg>`;

const FAVICON_LIGHT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <ellipse cx="16" cy="16" rx="14" ry="8.5" stroke="#231f20" stroke-width="1.8"/>
  <circle cx="16" cy="16" r="5.5" fill="#231f20"/>
  <circle cx="16" cy="16" r="2.2" fill="#dce0df"/>
  <circle cx="17.6" cy="14.4" r="0.9" fill="#231f20" opacity="0.7"/>
</svg>`;

const BG_DARK = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">
  <defs>
    <pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#dce0df" stroke-width="0.35"/>
    </pattern>
  </defs>
  <rect width="40" height="40" fill="url(#g)" opacity="0.28"/>
</svg>`;

const BG_LIGHT = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">
  <defs>
    <pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#231f20" stroke-width="0.35"/>
    </pattern>
  </defs>
  <rect width="40" height="40" fill="url(#g)" opacity="0.18"/>
</svg>`;

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Iris AI, an intelligent development assistant operating inside a v86 virtual development environment (devbox).

## Workflow
For every user request, follow this structured methodology:

**🧠 THINK** — Analyze the request, clarify requirements, identify edge cases.
**📋 PLAN** — Break the task into concrete, ordered steps.
**⚡ ACT** — Execute each step by calling devbox tools (run_command, write_file, read_file, list_files).
**🧪 TEST** — Run tests, lint, and scan for bugs or security issues with scan_code.
**✅ COMPLETE** — Present final files, a concise description, and close the session.

## Formatting
- Use full Markdown.
- Wrap every distinct phase in a heading: **🧠 Think**, **📋 Plan**, **⚡ Act**, **🧪 Test**, **✅ Complete**.
- Put every shell command in a fenced \`\`\`bash block so the UI renders it as a Command Box.
- After completion, list all created/modified files as a Markdown table.

## Rules
- Always run \`scan_code\` before the COMPLETE phase.
- Never skip the TEST phase.
- If a user uploads files at the start, acknowledge them and include them in your plan.`;

// ─── GROQ TOOL DEFINITIONS ────────────────────────────────────────────────────

const DEVBOX_TOOLS = [
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Execute a shell command in the v86 devbox environment.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to run." },
          cwd: { type: "string", description: "Working directory (default: /root/project)." }
        },
        required: ["command"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write or overwrite a file in the devbox.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute file path." },
          content: { type: "string", description: "File content." }
        },
        required: ["path", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file from the devbox.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute file path to read." }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files and directories at a given path in the devbox.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path (default: /root/project)." }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "scan_code",
      description: "Scan source files for bugs, errors, and security vulnerabilities.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File or directory path to scan." }
        },
        required: ["path"]
      }
    }
  }
];

// ─── CHAT HTML ────────────────────────────────────────────────────────────────

function getIndexHTML() {
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Iris AI</title>
  <link id="favicon" rel="icon" type="image/svg+xml" href="/favicon-dark.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.x/tabler-icons.min.css">
  <style>
    /* ── Reset & Base ─────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; overflow: hidden; font-family: 'Inter', sans-serif; font-size: 14px; }

    /* ── Design Tokens ───────────────────────────────────── */
    :root {
      --c-dark:  #231f20;
      --c-light: #dce0df;
      --radius:  12px;
      --radius-sm: 8px;
      --radius-lg: 18px;
      --transition: 0.2s ease;
    }

    [data-theme="dark"] {
      --bg:           #231f20;
      --fg:           #dce0df;
      --border:       rgba(220,224,223,0.10);
      --border-med:   rgba(220,224,223,0.18);
      --border-strong:rgba(220,224,223,0.30);
      --panel:        rgba(30,26,27,0.82);
      --surface:      rgba(220,224,223,0.05);
      --surface-hover:rgba(220,224,223,0.09);
      --input-bg:     rgba(220,224,223,0.07);
      --user-bubble:  rgba(220,224,223,0.13);
      --ai-bubble:    rgba(220,224,223,0.04);
      --cmd-bg:       #18151600;
      --cmd-surface:  rgba(0,0,0,0.35);
      --think-bg:     rgba(124,111,112,0.10);
      --plan-bg:      rgba(100,90,160,0.10);
      --act-bg:       rgba(180,140,60,0.10);
      --test-bg:      rgba(60,160,100,0.10);
      --done-bg:      rgba(60,160,100,0.12);
      --muted:        rgba(220,224,223,0.45);
      --scrollbar:    rgba(220,224,223,0.15);
    }

    [data-theme="light"] {
      --bg:           #dce0df;
      --fg:           #231f20;
      --border:       rgba(35,31,32,0.09);
      --border-med:   rgba(35,31,32,0.16);
      --border-strong:rgba(35,31,32,0.28);
      --panel:        rgba(230,234,233,0.88);
      --surface:      rgba(35,31,32,0.04);
      --surface-hover:rgba(35,31,32,0.08);
      --input-bg:     rgba(35,31,32,0.06);
      --user-bubble:  rgba(35,31,32,0.10);
      --ai-bubble:    rgba(35,31,32,0.03);
      --cmd-bg:       transparent;
      --cmd-surface:  rgba(35,31,32,0.08);
      --think-bg:     rgba(80,70,75,0.07);
      --plan-bg:      rgba(90,80,140,0.07);
      --act-bg:       rgba(160,120,30,0.07);
      --test-bg:      rgba(30,130,80,0.07);
      --done-bg:      rgba(30,130,80,0.09);
      --muted:        rgba(35,31,32,0.45);
      --scrollbar:    rgba(35,31,32,0.15);
    }

    /* ── Background & Grid Overlay ───────────────────────── */
    body {
      background-color: var(--bg);
      color: var(--fg);
      transition: background-color var(--transition), color var(--transition);
    }

    #bg-grid {
      position: fixed; inset: 0; z-index: 0;
      background-size: 40px 40px;
      pointer-events: none;
      transition: background-image var(--transition);
    }
    [data-theme="dark"] #bg-grid  { background-image: url('/background-dark.png'); }
    [data-theme="light"] #bg-grid { background-image: url('/background-light.png'); }

    /* ── App Shell ───────────────────────────────────────── */
    #app {
      position: relative; z-index: 1;
      display: flex; flex-direction: column;
      height: 100vh; width: 100%;
    }

    /* ── Header ──────────────────────────────────────────── */
    #header {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 16px;
      background: var(--panel);
      border-bottom: 1px solid var(--border-med);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      flex-shrink: 0;
    }
    .header-logo {
      display: flex; align-items: center; gap: 8px;
      font-weight: 600; font-size: 15px; letter-spacing: -0.01em;
    }
    .header-logo img { width: 22px; height: 22px; }
    .header-spacer { flex: 1; }
    .model-select {
      background: var(--input-bg);
      border: 1px solid var(--border-med);
      color: var(--fg);
      border-radius: var(--radius-sm);
      padding: 5px 10px; font-size: 12px; font-family: inherit;
      cursor: pointer; outline: none;
      transition: border-color var(--transition);
    }
    .model-select:hover, .model-select:focus { border-color: var(--border-strong); }
    .header-btn {
      display: flex; align-items: center; justify-content: center;
      width: 32px; height: 32px;
      background: var(--surface); border: 1px solid var(--border-med);
      border-radius: var(--radius-sm);
      color: var(--fg); cursor: pointer;
      font-size: 16px; transition: background var(--transition), border-color var(--transition);
    }
    .header-btn:hover { background: var(--surface-hover); border-color: var(--border-strong); }

    /* ── Main Split Layout ───────────────────────────────── */
    #main {
      display: flex; flex: 1; overflow: hidden;
    }

    /* ── Chat Panel (Left 50%) ───────────────────────────── */
    #chat-panel {
      display: flex; flex-direction: column;
      width: 50%; min-width: 320px;
      border-right: 1px solid var(--border-med);
    }
    #chat-panel-header {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      font-size: 12px; font-weight: 500; color: var(--muted);
      flex-shrink: 0;
    }
    #chat-panel-header i { font-size: 15px; }

    /* ── Messages ────────────────────────────────────────── */
    #messages {
      flex: 1; overflow-y: auto;
      padding: 16px 14px; display: flex; flex-direction: column; gap: 12px;
      scroll-behavior: smooth;
    }
    #messages::-webkit-scrollbar { width: 4px; }
    #messages::-webkit-scrollbar-track { background: transparent; }
    #messages::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 4px; }

    /* ── Message Bubbles ─────────────────────────────────── */
    .msg { display: flex; gap: 9px; align-items: flex-start; max-width: 100%; }
    .msg-icon {
      width: 28px; height: 28px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; flex-shrink: 0; margin-top: 1px;
      border: 1px solid var(--border-med);
    }
    .msg-icon--user { background: var(--user-bubble); }
    .msg-icon--ai   { background: var(--ai-bubble); }
    .msg-content {
      flex: 1; min-width: 0;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 10px 13px;
      line-height: 1.6;
      font-size: 13.5px;
      word-break: break-word;
    }
    .msg--user .msg-content {
      background: var(--user-bubble);
      border-color: var(--border-med);
    }
    .msg--ai .msg-content  { background: var(--ai-bubble); }
    .msg--system .msg-content {
      font-size: 12px; color: var(--muted);
      background: transparent; border-color: var(--border); border-style: dashed;
    }

    /* ── Markdown content inside messages ────────────────── */
    .msg-content p  { margin: 0 0 8px; }
    .msg-content p:last-child { margin-bottom: 0; }
    .msg-content ul, .msg-content ol { padding-left: 18px; margin: 6px 0; }
    .msg-content li { margin: 3px 0; }
    .msg-content h1,.msg-content h2,.msg-content h3,.msg-content h4 {
      margin: 12px 0 6px; font-weight: 600;
    }
    .msg-content h1 { font-size: 17px; }
    .msg-content h2 { font-size: 15px; }
    .msg-content h3 { font-size: 13.5px; }
    .msg-content strong { font-weight: 600; }
    .msg-content em { font-style: italic; }
    .msg-content a { color: var(--fg); opacity: 0.75; text-decoration: underline; }
    .msg-content table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 12px; }
    .msg-content th, .msg-content td {
      border: 1px solid var(--border-med); padding: 5px 10px; text-align: left;
    }
    .msg-content th { background: var(--surface); font-weight: 600; }
    .msg-content hr { border: none; border-top: 1px solid var(--border-med); margin: 10px 0; }
    .msg-content blockquote {
      border-left: 3px solid var(--border-strong);
      padding-left: 10px; color: var(--muted);
      margin: 6px 0;
    }
    /* Inline code */
    .msg-content code:not(.hljs) {
      background: var(--cmd-surface);
      border: 1px solid var(--border-med);
      border-radius: 4px; padding: 1px 5px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 12px;
    }

    /* ── Command / Code Boxes ────────────────────────────── */
    .cmd-box {
      border: 1px solid var(--border-med);
      border-radius: var(--radius);
      overflow: hidden;
      margin: 6px 0;
      background: var(--cmd-surface);
    }
    .cmd-box-header {
      display: flex; align-items: center; gap: 7px;
      padding: 6px 12px;
      border-bottom: 1px solid var(--border);
      font-size: 11px; font-weight: 500; color: var(--muted);
      background: var(--surface);
    }
    .cmd-box-header i { font-size: 13px; }
    .cmd-box-copy {
      margin-left: auto; cursor: pointer;
      background: none; border: none; color: var(--muted);
      font-size: 13px; padding: 2px 4px; border-radius: 4px;
      transition: color var(--transition);
      font-family: inherit;
    }
    .cmd-box-copy:hover { color: var(--fg); }
    .cmd-box pre {
      margin: 0 !important; border-radius: 0 !important;
      padding: 12px 14px !important;
      background: transparent !important;
      font-family: 'JetBrains Mono','Fira Code',monospace;
      font-size: 12.5px; line-height: 1.6;
      overflow-x: auto; color: var(--fg);
    }
    .cmd-box pre code { background: none !important; border: none !important; padding: 0 !important; font-size: inherit; }

    /* ── Think / Plan / Act blocks ───────────────────────── */
    .phase-block {
      border: 1px solid var(--border-med);
      border-radius: var(--radius);
      overflow: hidden;
      margin: 6px 0;
    }
    .phase-block summary {
      list-style: none; display: flex; align-items: center; gap: 7px;
      padding: 8px 12px; cursor: pointer;
      font-size: 12px; font-weight: 600;
      user-select: none;
    }
    .phase-block summary::-webkit-details-marker { display: none; }
    .phase-block summary i { font-size: 14px; }
    .phase-block-content { padding: 10px 13px; font-size: 13px; line-height: 1.6; }
    .phase-think   { background: var(--think-bg); border-color: rgba(124,111,112,0.25); }
    .phase-plan    { background: var(--plan-bg);  border-color: rgba(100,90,160,0.25); }
    .phase-act     { background: var(--act-bg);   border-color: rgba(180,140,60,0.25); }
    .phase-test    { background: var(--test-bg);  border-color: rgba(60,160,100,0.25); }
    .phase-complete{ background: var(--done-bg);  border-color: rgba(60,160,100,0.35); }

    /* ── Streaming cursor ─────────────────────────────────── */
    .cursor-blink {
      display: inline-block; width: 2px; height: 13px;
      background: var(--fg); margin-left: 2px; vertical-align: middle;
      animation: blink 0.8s step-end infinite;
    }
    @keyframes blink { 50% { opacity: 0; } }

    /* ── Typing indicator ────────────────────────────────── */
    .typing-indicator {
      display: flex; gap: 4px; align-items: center; padding: 8px 0;
    }
    .typing-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--muted); animation: bounce 1.2s infinite;
    }
    .typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .typing-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce { 0%,60%,100%{ transform:translateY(0)} 30%{transform:translateY(-5px)} }

    /* ── Input Area ──────────────────────────────────────── */
    #input-area {
      padding: 12px 14px;
      border-top: 1px solid var(--border-med);
      background: var(--panel);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      flex-shrink: 0;
    }
    #input-row {
      display: flex; gap: 8px; align-items: flex-end;
    }
    #input-box {
      flex: 1;
      background: var(--input-bg);
      border: 1px solid var(--border-med);
      border-radius: var(--radius);
      color: var(--fg); font-family: inherit; font-size: 13.5px;
      padding: 9px 12px; resize: none; outline: none;
      min-height: 40px; max-height: 160px;
      line-height: 1.5;
      transition: border-color var(--transition);
    }
    #input-box::placeholder { color: var(--muted); }
    #input-box:focus { border-color: var(--border-strong); }
    .input-btn {
      display: flex; align-items: center; justify-content: center;
      width: 36px; height: 36px; flex-shrink: 0;
      border: 1px solid var(--border-med);
      border-radius: var(--radius-sm);
      background: var(--surface); color: var(--fg);
      cursor: pointer; font-size: 16px;
      transition: background var(--transition), border-color var(--transition);
    }
    .input-btn:hover { background: var(--surface-hover); border-color: var(--border-strong); }
    .input-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    #send-btn {
      background: var(--fg); color: var(--bg);
      border-color: var(--fg);
    }
    #send-btn:hover { opacity: 0.85; }
    #send-btn:disabled { background: var(--surface); color: var(--muted); border-color: var(--border-med); }

    #input-meta {
      display: flex; align-items: center; gap: 8px;
      margin-top: 7px; font-size: 11px; color: var(--muted);
    }
    #file-preview { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 5px; }
    .file-chip {
      display: flex; align-items: center; gap: 4px;
      background: var(--surface); border: 1px solid var(--border-med);
      border-radius: 6px; padding: 3px 8px; font-size: 11px;
    }
    .file-chip-remove { cursor: pointer; opacity: 0.6; }
    .file-chip-remove:hover { opacity: 1; }
    #file-input { display: none; }

    /* ── Devbox Panel (Right 50%) ─────────────────────────── */
    #devbox-panel {
      display: flex; flex-direction: column;
      flex: 1; min-width: 0;
      background: var(--panel);
    }
    #devbox-header {
      display: flex; align-items: center; gap: 9px;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border-med);
      flex-shrink: 0;
    }
    #devbox-title { font-size: 12px; font-weight: 600; }
    #devbox-status-badge {
      display: flex; align-items: center; gap: 5px;
      font-size: 11px; color: var(--muted);
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 20px; padding: 3px 9px;
    }
    #status-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--muted);
      transition: background 0.3s;
    }
    #status-dot.online  { background: #4caf76; box-shadow: 0 0 4px #4caf7688; }
    #status-dot.starting{ background: #e0a030; box-shadow: 0 0 4px #e0a03088; animation: pulse 1s infinite; }
    .devbox-spacer { flex:1; }
    #devbox-actions { display: flex; gap: 7px; }

    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }

    #devbox-viewport {
      flex: 1; overflow: hidden; position: relative;
      display: flex; align-items: center; justify-content: center;
    }
    #devbox-placeholder {
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 14px; text-align: center;
      color: var(--muted); padding: 40px;
    }
    #devbox-placeholder i { font-size: 48px; opacity: 0.35; }
    #devbox-placeholder h3 { font-size: 14px; font-weight: 600; opacity: 0.7; }
    #devbox-placeholder p  { font-size: 12px; max-width: 280px; line-height: 1.6; opacity: 0.55; }

    #devbox-frame {
      display: none; width: 100%; height: 100%;
      border: none; background: #000;
    }

    #devbox-files {
      border-top: 1px solid var(--border);
      padding: 10px 14px;
      max-height: 160px; overflow-y: auto;
      flex-shrink: 0; display: none;
    }
    #devbox-files h4 { font-size: 11px; font-weight: 600; color: var(--muted); margin-bottom: 7px; }
    .devbox-file-item {
      display: flex; align-items: center; gap: 7px;
      padding: 4px 0; font-size: 12px;
      border-bottom: 1px solid var(--border);
    }
    .devbox-file-item:last-child { border-bottom: none; }
    .devbox-file-item i { font-size: 13px; color: var(--muted); }

    /* ── Resize handle ───────────────────────────────────── */
    #resize-handle {
      width: 4px; background: var(--border-med); cursor: col-resize;
      flex-shrink: 0; transition: background var(--transition);
    }
    #resize-handle:hover { background: var(--border-strong); }

    /* ── Scrollbar (Firefox) ─────────────────────────────── */
    * { scrollbar-width: thin; scrollbar-color: var(--scrollbar) transparent; }
  </style>
</head>
<body>

<!-- Grid overlay -->
<div id="bg-grid"></div>

<div id="app">

  <!-- ── Header ────────────────────────────────────────── -->
  <header id="header">
    <div class="header-logo">
      <img id="header-favicon" src="/favicon-dark.png" alt="Iris AI">
      Iris AI
    </div>
    <div class="header-spacer"></div>
    <select id="model-select" class="model-select" title="Select model">
      <option value="llama-3.3-70b-versatile">Llama 3.3 70B</option>
      <option value="llama3-70b-8192">Llama 3 70B</option>
      <option value="llama3-8b-8192">Llama 3 8B (fast)</option>
      <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
      <option value="gemma2-9b-it">Gemma 2 9B</option>
    </select>
    <button class="header-btn" id="new-chat-btn" title="New chat"><i class="ti ti-plus"></i></button>
    <button class="header-btn" id="theme-btn" title="Toggle theme"><i class="ti ti-moon"></i></button>
  </header>

  <!-- ── Main layout ───────────────────────────────────── -->
  <div id="main">

    <!-- ── Chat Panel ──────────────────────────────────── -->
    <section id="chat-panel">

      <div id="chat-panel-header">
        <i class="ti ti-messages"></i>
        <span id="chat-title">New Chat</span>
        <div style="flex:1"></div>
        <span id="chat-count" style="font-size:11px"></span>
      </div>

      <div id="messages"></div>

      <!-- Input area -->
      <div id="input-area">
        <div id="file-preview"></div>
        <div id="input-row">
          <button class="input-btn" id="attach-btn" title="Attach files"><i class="ti ti-paperclip"></i></button>
          <input type="file" id="file-input" multiple>
          <textarea id="input-box" rows="1" placeholder="Ask Iris AI anything…"></textarea>
          <button class="input-btn" id="send-btn" title="Send (Enter)"><i class="ti ti-send"></i></button>
        </div>
        <div id="input-meta">
          <i class="ti ti-keyboard" style="font-size:12px"></i>
          Enter to send &nbsp;·&nbsp; Shift+Enter for new line
        </div>
      </div>
    </section>

    <!-- Resize handle -->
    <div id="resize-handle"></div>

    <!-- ── Devbox Panel ─────────────────────────────────── -->
    <section id="devbox-panel">

      <div id="devbox-header">
        <i class="ti ti-device-desktop-code" style="font-size:16px"></i>
        <span id="devbox-title">v86 Devbox</span>
        <div id="devbox-status-badge">
          <div id="status-dot"></div>
          <span id="status-text">Offline</span>
        </div>
        <div class="devbox-spacer"></div>
        <div id="devbox-actions">
          <button class="header-btn" id="devbox-refresh-btn" title="Refresh devbox" style="display:none">
            <i class="ti ti-refresh"></i>
          </button>
          <button class="header-btn" id="devbox-stop-btn" title="Stop devbox" style="display:none">
            <i class="ti ti-player-stop"></i>
          </button>
        </div>
      </div>

      <div id="devbox-viewport">
        <div id="devbox-placeholder">
          <i class="ti ti-device-desktop"></i>
          <h3>Devbox not started</h3>
          <p>The virtual development environment will start automatically when you send your first message. Files you upload will be transferred into the devbox before the AI begins.</p>
        </div>
        <iframe id="devbox-frame" title="v86 Devbox"></iframe>
      </div>

      <div id="devbox-files">
        <h4><i class="ti ti-files" style="font-size:12px"></i> &nbsp;Session Files</h4>
        <div id="devbox-file-list"></div>
      </div>

    </section>
  </div>
</div>

<!-- marked.js for markdown rendering -->
<script src="https://cdn.jsdelivr.net/npm/marked@12/marked.min.js"></script>
<script>
// ─── State ────────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'iris_chats_v1';

const state = {
  theme: localStorage.getItem('iris_theme') || 'dark',
  chatId: null,
  messages: [],          // { role, content, id }
  pendingFiles: [],
  devboxStatus: 'offline', // offline | starting | running | stopping
  isStreaming: false,
  model: 'llama-3.3-70b-versatile',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function saveChats(chats) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(chats)); } catch {}
}

function loadChats() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function saveCurrentChat() {
  if (!state.chatId || !state.messages.length) return;
  const chats = loadChats();
  const preview = state.messages.find(m => m.role === 'user')?.content?.slice(0, 60) || 'New chat';
  chats[state.chatId] = {
    id: state.chatId,
    title: preview,
    messages: state.messages,
    updatedAt: Date.now(),
  };
  saveChats(chats);
  document.getElementById('chat-title').textContent = preview;
}

// ─── Theme ────────────────────────────────────────────────────────────────────
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const favicon = document.getElementById('favicon');
  const headerFavicon = document.getElementById('header-favicon');
  const icon = document.getElementById('theme-btn').querySelector('i');
  if (t === 'dark') {
    favicon.href = '/favicon-dark.png';
    headerFavicon.src = '/favicon-dark.png';
    icon.className = 'ti ti-moon';
  } else {
    favicon.href = '/favicon-light.png';
    headerFavicon.src = '/favicon-light.png';
    icon.className = 'ti ti-sun';
  }
  state.theme = t;
  localStorage.setItem('iris_theme', t);
}

document.getElementById('theme-btn').addEventListener('click', () => {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
});

applyTheme(state.theme);

// ─── Model select ─────────────────────────────────────────────────────────────
document.getElementById('model-select').addEventListener('change', e => {
  state.model = e.target.value;
});

// ─── Markdown renderer ────────────────────────────────────────────────────────
marked.setOptions({ gfm: true, breaks: true });

const PHASE_RE = /^(🧠\s*\*\*Think\*\*|📋\s*\*\*Plan\*\*|⚡\s*\*\*Act\*\*|🧪\s*\*\*Test\*\*|✅\s*\*\*Complete\*\*)/i;

function phaseClass(heading) {
  if (/think/i.test(heading))    return ['phase-think',    'ti-brain',     'Think'];
  if (/plan/i.test(heading))     return ['phase-plan',     'ti-list-check','Plan'];
  if (/act/i.test(heading))      return ['phase-act',      'ti-bolt',      'Act'];
  if (/test/i.test(heading))     return ['phase-test',     'ti-test-pipe', 'Test'];
  if (/complete/i.test(heading)) return ['phase-complete', 'ti-circle-check','Complete'];
  return ['phase-think', 'ti-brain', heading];
}

function renderMarkdown(raw) {
  // Split content at phase headings and wrap in collapsible blocks
  const lines = raw.split('\\n');
  const segments = [];
  let current = { type: 'text', lines: [] };

  for (const line of lines) {
    const m = line.match(/^#+\\s*(🧠.*|📋.*|⚡.*|🧪.*|✅.*)/);
    if (m) {
      if (current.lines.length) segments.push(current);
      current = { type: 'phase', heading: m[1], lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length || current.type === 'phase') segments.push(current);

  let html = '';
  for (const seg of segments) {
    const body = seg.lines.join('\\n');
    if (seg.type === 'phase') {
      const [cls, icon, label] = phaseClass(seg.heading);
      const inner = renderCodeBoxes(marked.parse(body));
      html += '<details class="phase-block ' + cls + '" open>'
            + '<summary><i class="ti ' + icon + '"></i>' + label + '</summary>'
            + '<div class="phase-block-content">' + inner + '</div>'
            + '</details>';
    } else {
      html += renderCodeBoxes(marked.parse(body));
    }
  }
  return html;
}

function renderCodeBoxes(html) {
  // Replace <pre><code class="language-X"> blocks with styled cmd-box
  return html.replace(/<pre><code(?:\\s+class="language-([^"]*)")?>([\s\S]*?)<\\/code><\\/pre>/g,
    (_, lang, code) => {
      const language = lang || 'text';
      const icon = language === 'bash' || language === 'sh' || language === 'shell'
        ? 'ti-terminal-2' : 'ti-code';
      const raw = code.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"');
      const escaped = raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return '<div class="cmd-box">'
           + '<div class="cmd-box-header"><i class="ti ' + icon + '"></i><span>' + language + '</span>'
           + '<button class="cmd-box-copy" onclick="copyCode(this)" title="Copy"><i class="ti ti-copy"></i></button></div>'
           + '<pre><code>' + escaped + '</code></pre>'
           + '</div>';
    }
  );
}

function copyCode(btn) {
  const code = btn.closest('.cmd-box').querySelector('pre code');
  const text = code.textContent;
  navigator.clipboard.writeText(text).then(() => {
    const icon = btn.querySelector('i');
    icon.className = 'ti ti-check';
    setTimeout(() => { icon.className = 'ti ti-copy'; }, 1500);
  });
}

// ─── Messages UI ──────────────────────────────────────────────────────────────
const messagesEl = document.getElementById('messages');

function appendSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'msg msg--system';
  div.innerHTML = '<div class="msg-content"><em>' + escHtml(text) + '</em></div>';
  messagesEl.appendChild(div);
  scrollBottom();
}

function appendUserMessage(content) {
  const id = uid();
  const div = document.createElement('div');
  div.className = 'msg msg--user';
  div.dataset.id = id;
  div.innerHTML = '<div class="msg-icon msg-icon--user"><i class="ti ti-user"></i></div>'
                + '<div class="msg-content">' + escHtml(content).replace(/\\n/g,'<br>') + '</div>';
  messagesEl.appendChild(div);
  scrollBottom();
  return id;
}

function createAIMessageEl() {
  const id = uid();
  const div = document.createElement('div');
  div.className = 'msg msg--ai';
  div.dataset.id = id;
  div.innerHTML = '<div class="msg-icon msg-icon--ai"><i class="ti ti-robot"></i></div>'
                + '<div class="msg-content"><div class="typing-indicator">'
                + '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>'
                + '</div></div>';
  messagesEl.appendChild(div);
  scrollBottom();
  return { id, el: div };
}

function updateAIMessage(el, rawText, streaming) {
  const content = el.querySelector('.msg-content');
  content.innerHTML = renderMarkdown(rawText);
  if (streaming) {
    content.innerHTML += '<span class="cursor-blink"></span>';
  }
  scrollBottom();
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function scrollBottom() {
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
}

// ─── New chat ─────────────────────────────────────────────────────────────────
function newChat() {
  state.chatId = uid();
  state.messages = [];
  state.pendingFiles = [];
  messagesEl.innerHTML = '';
  document.getElementById('chat-title').textContent = 'New Chat';
  document.getElementById('file-preview').innerHTML = '';
  document.getElementById('chat-count').textContent = '';
  appendSystemMessage('New conversation started. Send a message to begin.');
}

document.getElementById('new-chat-btn').addEventListener('click', newChat);

// ─── File attachments ─────────────────────────────────────────────────────────
const fileInput = document.getElementById('file-input');
const filePreview = document.getElementById('file-preview');

document.getElementById('attach-btn').addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  Array.from(fileInput.files).forEach(f => {
    if (state.pendingFiles.find(p => p.name === f.name)) return;
    state.pendingFiles.push(f);
  });
  renderFileChips();
  fileInput.value = '';
});

function renderFileChips() {
  filePreview.innerHTML = state.pendingFiles.map((f, i) =>
    '<div class="file-chip">'
    + '<i class="ti ti-file" style="font-size:12px"></i>'
    + '<span>' + escHtml(f.name) + '</span>'
    + '<span class="file-chip-remove" onclick="removeFile(' + i + ')"><i class="ti ti-x" style="font-size:11px"></i></span>'
    + '</div>'
  ).join('');
}

function removeFile(i) {
  state.pendingFiles.splice(i, 1);
  renderFileChips();
}

// ─── Input handling ───────────────────────────────────────────────────────────
const inputBox  = document.getElementById('input-box');
const sendBtn   = document.getElementById('send-btn');

inputBox.addEventListener('input', () => {
  inputBox.style.height = 'auto';
  inputBox.style.height = Math.min(inputBox.scrollHeight, 160) + 'px';
});

inputBox.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

sendBtn.addEventListener('click', sendMessage);

// ─── Send message ─────────────────────────────────────────────────────────────
async function sendMessage() {
  const text = inputBox.value.trim();
  if (!text || state.isStreaming) return;

  if (!state.chatId) newChat();

  // Clear input
  inputBox.value = '';
  inputBox.style.height = 'auto';

  // Show user message
  appendUserMessage(text);

  const userMsg = { role: 'user', content: text };
  if (state.pendingFiles.length) {
    userMsg.content += '\\n\\n[Attached files: ' + state.pendingFiles.map(f => f.name).join(', ') + ']';
  }
  state.messages.push(userMsg);

  // Handle file attachments in context
  const attachedFiles = [...state.pendingFiles];
  state.pendingFiles = [];
  renderFileChips();

  // Notify devbox workflow
  if (state.devboxStatus === 'offline') {
    appendSystemMessage('Starting devbox session…');
    await startDevbox();
  }
  if (attachedFiles.length) {
    appendSystemMessage('Uploading ' + attachedFiles.length + ' file(s) to devbox…');
    await uploadFilesToDevbox(attachedFiles);
  }

  // Create AI message element
  const { el: aiEl } = createAIMessageEl();

  state.isStreaming = true;
  sendBtn.disabled = true;

  let fullText = '';

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: state.chatId,
        model:  state.model,
        messages: state.messages,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      updateAIMessage(aiEl, '**Error:** ' + escHtml(err), false);
      state.isStreaming = false;
      sendBtn.disabled = false;
      return;
    }

    const reader  = resp.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const chunk = JSON.parse(data);
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.content) {
            fullText += delta.content;
            updateAIMessage(aiEl, fullText, true);
          }
          // Tool call display
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.function?.name) {
                const toolText = '\\n\\n**[Tool call]** \`' + tc.function.name + '\`\\n';
                fullText += toolText;
                updateAIMessage(aiEl, fullText, true);
              }
            }
          }
        } catch {}
      }
    }

    updateAIMessage(aiEl, fullText, false);
    state.messages.push({ role: 'assistant', content: fullText });
    document.getElementById('chat-count').textContent = state.messages.filter(m=>m.role==='user').length + ' msg(s)';
    saveCurrentChat();

    // Post-completion: shut down devbox if complete marker found
    if (/✅\s*\*\*Complete\*\*/i.test(fullText) && state.devboxStatus === 'running') {
      appendSystemMessage('Task complete — shutting down devbox…');
      await stopDevbox();
      showDevboxFiles(fullText);
    }

  } catch (err) {
    updateAIMessage(aiEl, '**Network error:** ' + escHtml(err.message), false);
  } finally {
    state.isStreaming = false;
    sendBtn.disabled = false;
    inputBox.focus();
  }
}

// ─── Devbox integration ───────────────────────────────────────────────────────
async function startDevbox() {
  try {
    setDevboxStatus('starting');
    const r = await fetch('/api/devbox/start', { method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ chatId: state.chatId }) });
    const d = await r.json();
    if (d.status === 'started' || d.status === 'ok') {
      setDevboxStatus('running');
      if (d.url) {
        document.getElementById('devbox-frame').src = d.url;
        document.getElementById('devbox-frame').style.display = 'block';
        document.getElementById('devbox-placeholder').style.display = 'none';
      }
    }
  } catch { setDevboxStatus('offline'); }
}

async function stopDevbox() {
  try {
    setDevboxStatus('stopping');
    await fetch('/api/devbox/stop', { method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ chatId: state.chatId }) });
  } catch {}
  setDevboxStatus('offline');
  document.getElementById('devbox-frame').style.display = 'none';
  document.getElementById('devbox-placeholder').style.display = 'flex';
}

async function uploadFilesToDevbox(files) {
  if (!files.length) return;
  try {
    const fd = new FormData();
    fd.append('chatId', state.chatId);
    files.forEach((f, i) => fd.append('file' + i, f));
    await fetch('/api/devbox/upload', { method: 'POST', body: fd });
  } catch {}
}

function setDevboxStatus(s) {
  state.devboxStatus = s;
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const stop = document.getElementById('devbox-stop-btn');
  const refresh = document.getElementById('devbox-refresh-btn');
  dot.className = s === 'running' ? 'online' : s === 'starting' ? 'starting' : '';
  text.textContent = s.charAt(0).toUpperCase() + s.slice(1);
  stop.style.display = s === 'running' ? 'flex' : 'none';
  refresh.style.display = s === 'running' ? 'flex' : 'none';
}

function showDevboxFiles(text) {
  const matches = [...text.matchAll(/\x60([^\x60 ]+\.[a-z]{1,5})\x60/gi)];
  if (!matches.length) return;
  const list = document.getElementById('devbox-file-list');
  const section = document.getElementById('devbox-files');
  list.innerHTML = [...new Set(matches.map(m => m[1]))].map(f =>
    '<div class="devbox-file-item"><i class="ti ti-file-code"></i><span>' + escHtml(f) + '</span></div>'
  ).join('');
  section.style.display = 'block';
}

document.getElementById('devbox-stop-btn').addEventListener('click', async () => {
  appendSystemMessage('Stopping devbox…');
  await stopDevbox();
});

document.getElementById('devbox-refresh-btn').addEventListener('click', () => {
  const frame = document.getElementById('devbox-frame');
  if (frame.src) frame.src = frame.src;
});

// ─── Resize handle ────────────────────────────────────────────────────────────
(function() {
  const handle = document.getElementById('resize-handle');
  const left   = document.getElementById('chat-panel');
  let dragging = false, startX = 0, startW = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startW = left.offsetWidth;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const delta = e.clientX - startX;
    const total = document.getElementById('main').offsetWidth;
    const newW  = Math.max(280, Math.min(total - 280, startW + delta));
    left.style.width = newW + 'px';
  });
  document.addEventListener('mouseup', () => {
    dragging = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  });
})();

// ─── Init ─────────────────────────────────────────────────────────────────────
newChat();
inputBox.focus();
</script>
</body>
</html>`;
}

// ─── CHAT API HANDLER ─────────────────────────────────────────────────────────

async function handleChat(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "POST required" }, 405);
  }

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: "Invalid JSON" }, 400); }

  const { messages = [], model = "llama-3.3-70b-versatile" } = body;
  if (!messages.length) return jsonResponse({ error: "No messages provided" }, 400);

  const groqKey = env.GROQ_API_KEY;
  if (!groqKey) {
    return jsonResponse({ error: "GROQ_API_KEY not configured. Set it in your Cloudflare Worker environment variables." }, 503);
  }

  const groqResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + groqKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages,
      ],
      stream: true,
      tools: DEVBOX_TOOLS,
      tool_choice: "auto",
      max_tokens: 4096,
      temperature: 0.7,
    }),
  });

  if (!groqResp.ok) {
    const err = await groqResp.text();
    return jsonResponse({ error: "Groq API error", details: err }, groqResp.status);
  }

  // Pipe SSE stream straight to client
  return new Response(groqResp.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      ...CORS,
    },
  });
}

// ─── DEVBOX STUB HANDLERS ─────────────────────────────────────────────────────

async function handleDevboxStart(request) {
  // Stub: in production this would boot a v86 VM session
  return jsonResponse({
    status: "started",
    message: "Devbox session initialized (stub). Integrate v86 backend to activate.",
    sessionId: crypto.randomUUID(),
    url: null,
  });
}

async function handleDevboxStop(request) {
  return jsonResponse({ status: "stopped", message: "Devbox session terminated (stub)." });
}

async function handleDevboxUpload(request) {
  let files = [];
  try {
    const form = await request.formData();
    for (const [k, v] of form.entries()) {
      if (k.startsWith("file") && v instanceof File) {
        files.push({ name: v.name, size: v.size, type: v.type });
      }
    }
  } catch {}
  return jsonResponse({ status: "uploaded", files, message: "File upload stub — integrate devbox FS to persist files." });
}

async function handleDevboxStatus(request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  return jsonResponse({
    status: "offline",
    sessionId: sessionId || null,
    message: "Devbox status stub. Integrate v86 backend.",
  });
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function svgResponse(svg) {
  return new Response(svg, {
    status: 200,
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400", ...CORS },
  });
}

// ─── MAIN FETCH ───────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // ── Static assets ─────────────────────────────────────────────────────────
    if (path === "/favicon-dark.png")    return svgResponse(FAVICON_DARK);
    if (path === "/favicon-light.png")   return svgResponse(FAVICON_LIGHT);
    if (path === "/background-dark.png") return svgResponse(BG_DARK);
    if (path === "/background-light.png")return svgResponse(BG_LIGHT);

    // ── API routes ────────────────────────────────────────────────────────────
    if (path === "/api/chat")            return handleChat(request, env);
    if (path === "/api/devbox/start")    return handleDevboxStart(request, env);
    if (path === "/api/devbox/stop")     return handleDevboxStop(request, env);
    if (path === "/api/devbox/upload")   return handleDevboxUpload(request, env);
    if (path === "/api/devbox/status")   return handleDevboxStatus(request, env);

    // ── Chat UI (root) ────────────────────────────────────────────────────────
    return new Response(getIndexHTML(), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", ...CORS },
    });
  },
};
