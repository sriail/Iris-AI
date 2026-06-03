/**
 * Iris LLM Main Worker:
 * - "search": High-fidelity Bing SERP with Base64 tracking extraction.
 * - "wikipedia": Direct unblocked Wikipedia API querying.
 * - "extract": Deep document layout scraper (fetches full pages of the top links).
 * - "link_phrase": Extract and phrase a single URL.
 * - "linktree": Map all links on a page.
 * - "file_extract": File metadata extraction (PDF, PNG, JPG, WEBP, PPTX, DOCX, TXT, CSV, XLSX, MOV, MP3, M4A, WAV).
 * - "file_content": Get full content/binary of uploaded files.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
  "Access-Control-Max-Age": "86400",
};

const TEST_KEY = "iris-test-key";

// In-memory rate limiter (per colo / ephemeral)
const testRateLimit = new Map();

function getClientIP(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "unknown"
  );
}

function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 10;

  const existing = testRateLimit.get(ip);

  if (!existing) {
    testRateLimit.set(ip, {
      count: 1,
      reset: now + windowMs
    });
    return false;
  }

  // Reset window
  if (now > existing.reset) {
    testRateLimit.set(ip, {
      count: 1,
      reset: now + windowMs
    });
    return false;
  }

  // Rate limited
  if (existing.count >= maxRequests) {
    return true;
  }

  existing.count++;
  return false;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // 1. Authenticate Request
const url = new URL(request.url);
const pathname = url.pathname;

const authHeader = request.headers.get("Authorization");
const queryKey = url.searchParams.get("api_key");

const clientKey = authHeader
  ? authHeader.replace("Bearer ", "").trim()
  : (queryKey ? queryKey.trim() : null);

const MASTER_KEY = "M-AI-wYEh60SxqfLsgFW77X6zNfFSBWgVWnkSb4M6Nf65H22yftyPK1oSMJzj7TVoqqoo";

// ==========================================
// TEST PAGE
// ==========================================
if (pathname === "/test") {
  return new Response(
`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Iris API Endpoint</title>
</head>
<body>
        <pre>                   
                                               -++++++++-                                           
                                     -++++#################+++++++-                                 
                                -++++++####-.............-####++++++++-                             
                            -+++++++###+...---------------...+###+++++++++-                         
                         -++++++++###...---------------------...###++++++++++-                      
                     -+++++++++++##..---------------------------.-##++++++++++++-                   
                   -++++++++++++##.---------.....---.....---------.##++++++++++++++-                
                -++++++++++++++##.--------..-############..--------.##++++++++++++++-               
            .-#+++++++++++++++##.--------.+###++++++++++###..-------.##++++++++++++++++-            
           -++++++++++++++++++#.--------.##+++++++++++++++##-.-------.#++++++++++++++++++-          
         -+++++++++++++++++++##.-------.##+++++++++++++++++##.-------.+#++++++++++++++++++-         
        -++++++++++++++++++++#---------+#+++++++++++++++++++##.------.-#++++++++++++++++++++-       
      +++++++++++++++++++++++#--------.##++++++++++++++++++++#.--------#++++++++++++++++++++++      
       .+++++++++++++++++++++#---------+#+++++++++++++++++++##.--------#++++++++++++++++++++-       
         -+++++++++++++++++++#+.-------.##++++++++++++++++++#--------.+#++++++++++++++++++-         
           -++++++++++++++++++#.-------.-##+++++++++++++++###.-------.#++++++++++++++++++-          
             -++++++++++++++++##.-------..###+++++++++++###-.-------.##++++++++++++++++-            
                -++++++++++++++#+.--------..#####+++#####-.--------.+#++++++++++++++-               
                  -+++++++++++++#+.---------...-#####+...---------.##+++++++++++++-                 
                    .++++++++++++##..-----------......----------..##++++++++++++-                   
                      .-#+++++++++###..-----------------------..###++++++++++-                      
                           -++++++++###-...---------------...-###++++++++-                          
                               -++++++#####...............#####+++++++.                             
                                   .-+++++#################++++++-.                                 
                                             -+++++++++-
                            
                                 ___      _       _     _     __  __ 
                                |_ _|_ __(_)___  | |   | |   |  \\/  |
                                 | || '__| / __| | |   | |   | |\\/| |
                                 | || |  | \\__ \\ | |___| |___| |  | |
                                |___|_|  |_|___/ |_____|_____|_|  |_|
</pre>

  <h2>Test Iris API Endpoint</h2>

  <div>
    <label for="endpoint">Worker Endpoint URL</label>
    <input type="text" id="endpoint">
  </div>

  <div>
    <label for="apiKey">API KEY</label>
    <input type="text" id="apiKey" value="${TEST_KEY}">
  </div>

  <div>
    <label for="mode">Operation Mode</label>
    <select id="mode" onchange="toggleModeFields()">
      <option value="search" selected>Bing Web Search (Gets Top Bing Search Results)</option>
      <option value="wikipedia">Wikipedia Search (Gets Top Wikipedia Search Results)</option>
      <option value="extract">HTML Document Extractor (Parses Top 3 Bing Search Links)</option>
      <option value="link_phrase">Link Phrasing (Extract & Phrase HTML from a Single URL)</option>
      <option value="linktree">Linktree Detector (Map All Links on Page)</option>
      <option value="file_extract">File Metadata Extraction (Upload Files and Provides a Summary)</option>
      <option value="file_content">File Full Content Extraction (Get Binary/Source for Uploaded Files)</option>
    </select>
  </div>

  <div id="queryGroup">
    <label for="query">Search Query / Extraction Request (q)</label>
    <input type="text" id="query" value="Hello World Computer Science">
  </div>

  <div id="urlGroup" style="display:none;">
    <label for="url">Target URL (url)</label>
    <input type="text" id="url" placeholder="https://example.com">
  </div>

  <div id="fileGroup" style="display:none;">
    <label for="files">Upload Files (Max 15 files, 50MB each)</label>
    <input type="file" id="files" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.pptx,.docx,.txt,.csv,.xlsx,.mov,.mp3,.m4a,.wav">
    <div id="fileList" style="margin-top: 10px; font-size: 0.9em; color: #666;"></div>
  </div>

  <div id="contentTypeGroup" style="display:none;">
    <label for="contentType">Return Type</label>
    <select id="contentType">
      <option value="metadata" selected>Metadata Only</option>
      <option value="full">Full Content (Binary/Source)</option>
    </select>
  </div>

  <div id="maxResultsGroup">
    <label for="maxResults">Max Results (1-25)</label>
    <input type="number" id="maxResults" value="10" min="1" max="25">
  </div>

  <div id="summarySizeGroup">
    <label for="summarySize">Summary Size (Words)</label>
    <input type="number" id="summarySize" value="25" min="5" max="100">
  </div>

  <div>
    <label>
      <input type="checkbox" id="prettyPrint" checked>
      Pretty Print JSON
    </label>
  </div>

  <button onclick="runTestQuery()">Execute Request</button>

  <div id="statusOutput"></div>

  <h3>Response Output</h3>

  <pre id="jsonOutput">// Results will populate here real-time From the Iris API Node...</pre>

<script>
function getSpeedLabel(ms) {
  if (ms < 200) return "EXCELLENT";
  if (ms < 500) return "GOOD";
  if (ms < 1000) return "FAIR";
  return "POOR";
}

function formatStatus(ms, extra="") {
  return \`\${extra} | Response: \${ms.toFixed(2)} ms (\${getSpeedLabel(ms)})\`;
}

document.getElementById('files').addEventListener('change', function(e) {
  const fileList = document.getElementById('fileList');
  const files = Array.from(e.target.files);

  let listHtml = '<strong>Selected files:</strong><br>';

  files.slice(0, 15).forEach((file, idx) => {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    listHtml += \`\${idx + 1}. \${file.name} (\${sizeMB} MB)<br>\`;
  });

  fileList.innerHTML = listHtml;
});

document.getElementById('endpoint').value = location.origin + "/";

function toggleModeFields() {
  const mode = document.getElementById('mode').value;

  document.getElementById('queryGroup').style.display = 'none';
  document.getElementById('urlGroup').style.display = 'none';
  document.getElementById('fileGroup').style.display = 'none';
  document.getElementById('contentTypeGroup').style.display = 'none';
  document.getElementById('maxResultsGroup').style.display = 'none';
  document.getElementById('summarySizeGroup').style.display = 'none';

  if (mode === 'link_phrase' || mode === 'linktree') {
    document.getElementById('urlGroup').style.display = 'block';
  } else if (mode === 'file_extract') {
    document.getElementById('fileGroup').style.display = 'block';
  } else if (mode === 'file_content') {
    document.getElementById('fileGroup').style.display = 'block';
    document.getElementById('contentTypeGroup').style.display = 'block';
  } else {
    document.getElementById('queryGroup').style.display = 'block';
    document.getElementById('maxResultsGroup').style.display = 'block';
    document.getElementById('summarySizeGroup').style.display = 'block';
  }
}

function renderOutput(raw) {
  const pretty = document.getElementById('prettyPrint').checked;

  if (!pretty) {
    return raw;
  }

  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

async function runTestQuery() {
  const endpointInput = document.getElementById('endpoint').value.trim();
  const apiKey = document.getElementById('apiKey').value.trim();
  const mode = document.getElementById('mode').value;
  const query = document.getElementById('query').value.trim();
  const url = document.getElementById('url').value.trim();
  const maxResults = document.getElementById('maxResults').value;
  const summarySize = document.getElementById('summarySize').value;
  const filesInput = document.getElementById('files');

  const statusOutput = document.getElementById('statusOutput');
  const jsonOutput = document.getElementById('jsonOutput');

  const startTime = performance.now();

  statusOutput.innerText = "Processing request...";
  jsonOutput.innerText = "Loading...";

  try {

    let response;
    let raw;

    if (mode === 'file_extract' || mode === 'file_content') {

      const files = Array.from(filesInput.files).slice(0, 15);

      const formData = new FormData();

      files.forEach((f, i) => formData.append(\`file\${i}\`, f));

      const targetUrl = new URL(endpointInput);

      targetUrl.searchParams.append('mode', mode);

      response = await fetch(targetUrl.toString(), {
        method: 'POST',
        headers: {
          'Authorization': \`Bearer \${apiKey}\`
        },
        body: formData
      });

      raw = await response.text();

    } else if (mode === 'link_phrase' || mode === 'linktree') {

      const targetUrl = new URL(endpointInput);

      targetUrl.searchParams.append('url', url);
      targetUrl.searchParams.append('mode', mode);

      response = await fetch(targetUrl.toString(), {
        method: 'GET',
        headers: {
          'Authorization': \`Bearer \${apiKey}\`,
          'Accept': 'application/json'
        }
      });

      raw = await response.text();

    } else {

      const targetUrl = new URL(endpointInput);

      targetUrl.searchParams.append('q', query);
      targetUrl.searchParams.append('max_results', maxResults);
      targetUrl.searchParams.append('summary_size', summarySize);
      targetUrl.searchParams.append('mode', mode);

      response = await fetch(targetUrl.toString(), {
        method: 'GET',
        headers: {
          'Authorization': \`Bearer \${apiKey}\`,
          'Accept': 'application/json'
        }
      });

      raw = await response.text();
    }

    const endTime = performance.now();
    const ms = endTime - startTime;

    statusOutput.innerText = formatStatus(ms, \`HTTP \${response.status}\`);
    jsonOutput.innerText = renderOutput(raw);

  } catch (err) {

    const ms = performance.now() - startTime;

    statusOutput.innerText = formatStatus(ms, "Network Error");
    jsonOutput.innerText = err.message;
  }
}

toggleModeFields();
</script>

</body>
</html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html",
        ...CORS_HEADERS
      }
    }
  );
}

// ==========================================
// TEST KEY RATE LIMITING
// ==========================================
const isTestKey = clientKey === TEST_KEY;

if (isTestKey) {
  const ip = getClientIP(request);

  if (isRateLimited(ip)) {
    return new Response(
      JSON.stringify({
        error: "Rate limit exceeded",
        limit: "10 requests per minute",
        type: "test_key"
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS
        }
      }
    );
  }
}

const isAuthorized =
  clientKey === MASTER_KEY ||
  (env.API_KEY && clientKey === env.API_KEY.trim()) ||
  isTestKey;

if (!clientKey || !isAuthorized) {
      return new Response(
        `<!DOCTYPE html>
      <html lang="en">
      <head>
       <meta charset="UTF-8">
       <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Unauthorized! Iris API Endpoint</title>
      </head>
    <body>
        <h1>Unauthorized!</h1><p>Access Denied: Invalid credentials. Sorry! the API key provided did not work or was not available, or there may have been a issue on our end.</p>
        <pre>                   
                                               -++++++++-                                           
                                     -++++#################+++++++-                                 
                                -++++++####-.............-####++++++++-                             
                            -+++++++###+...---------------...+###+++++++++-                         
                         -++++++++###...---------------------...###++++++++++-                      
                     -+++++++++++##..---------------------------.-##++++++++++++-                   
                   -++++++++++++##.---------.....---.....---------.##++++++++++++++-                
                -++++++++++++++##.--------..-############..--------.##++++++++++++++-               
            .-#+++++++++++++++##.--------.+###++++++++++###..-------.##++++++++++++++++-            
           -++++++++++++++++++#.--------.##+++++++++++++++##-.-------.#++++++++++++++++++-          
         -+++++++++++++++++++##.-------.##+++++++++++++++++##.-------.+#++++++++++++++++++-         
        -++++++++++++++++++++#---------+#+++++++++++++++++++##.------.-#++++++++++++++++++++-       
      +++++++++++++++++++++++#--------.##++++++++++++++++++++#.--------#++++++++++++++++++++++      
       .+++++++++++++++++++++#---------+#+++++++++++++++++++##.--------#++++++++++++++++++++-       
         -+++++++++++++++++++#+.-------.##++++++++++++++++++#--------.+#++++++++++++++++++-         
           -++++++++++++++++++#.-------.-##+++++++++++++++###.-------.#++++++++++++++++++-          
             -++++++++++++++++##.-------..###+++++++++++###-.-------.##++++++++++++++++-            
                -++++++++++++++#+.--------..#####+++#####-.--------.+#++++++++++++++-               
                  -+++++++++++++#+.---------...-#####+...---------.##+++++++++++++-                 
                    .++++++++++++##..-----------......----------..##++++++++++++-                   
                      .-#+++++++++###..-----------------------..###++++++++++-                      
                           -++++++++###-...---------------...-###++++++++-                          
                               -++++++#####...............#####+++++++.                             
                                   .-+++++#################++++++-.                                 
                                             -+++++++++-
                            
                                 ___      _       _     _     __  __ 
                                |_ _|_ __(_)___  | |   | |   |  \\/  |
                                 | || '__| / __| | |   | |   | |\\/| |
                                 | || |  | \\__ \\ | |___| |___| |  | |
                                |___|_|  |_|___/ |_____|_____|_|  |_|
</pre>

        <p>Curious about the project? visit us at https://github.com/sriail/Iris-AI for the Latest Updates, (Website Comming Soon!)</p>
        <p>Or, Get your Own FREE API Key (Limit of 2 Requests per Seccond and 1,000 Requests per Day)</p>
        <p>Or, host from the repo for FREE on your own Cloudflare Worker from /sriail/Iris-AI!</p>
        <button onclick="window.location.href='/test'">Test this API Endpoint</button>
        <button onclick="window.location.href='https://github.com/sriail/Iris-AI'">Visit Out Github Repo</button>
        </body>
        </html>`,
        { status: 401, headers: { "Content-Type": "text/html", ...CORS_HEADERS } }
      );
    }

    // 2. Parse Incoming Payloads (GET & POST)
    let q = url.searchParams.get("q");
    let targetUrl = url.searchParams.get("url");
    let mode = url.searchParams.get("mode") || "search";
    let contentType = url.searchParams.get("content_type") || "metadata";
    let maxResultsParam = url.searchParams.get("max_results");
    let summarySizeParam = url.searchParams.get("summary_size");

    // ==========================================
    // MODE E: FILE CONTENT EXTRACTION (Full Binary/Source)
    // ==========================================
    if (mode === "file_content") {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "[IRIS Payload Manager]: file_content mode requires POST with multipart/form-data" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }

      try {
        const formData = await request.formData();
        const files = [];
        
        for (const [key, value] of formData.entries()) {
          if (key.startsWith('file') && value instanceof File) {
            files.push(value);
          }
        }

        if (files.length === 0) {
          return new Response(JSON.stringify({ error: "[IRIS Payload Manager]: No files uploaded" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS }
          });
        }

        const file = files[0]; // Process first file for content extraction
        const extension = file.name.split('.').pop().toLowerCase();

        if (file.size > 50 * 1024 * 1024) {
          return new Response(JSON.stringify({ error: "File exceeds 50MB limit" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS }
          });
        }

        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // Binary media files - return as binary
        if (['mov', 'mp3', 'm4a', 'wav', 'png', 'jpg', 'jpeg', 'webp'].includes(extension)) {
          return new Response(uint8Array, {
            status: 200,
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Disposition': `attachment; filename="${file.name}"`,
              ...CORS_HEADERS
            }
          });
        }

        // Office documents - extract inner XML/source
        if (['docx', 'pptx', 'xlsx'].includes(extension)) {
          const sourceContent = await extractOfficeSource(uint8Array, extension);
          return new Response(JSON.stringify({
            status: "success",
            mode: "file_content",
            filename: file.name,
            file_type: extension.toUpperCase(),
            content_type: "Office Document Source",
            inner_source: sourceContent
          }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS }
          });
        }

        // Text files - return as text
        if (['txt', 'csv', 'pdf'].includes(extension)) {
          const text = safeTextDecode(uint8Array);
          return new Response(JSON.stringify({
            status: "success",
            mode: "file_content",
            filename: file.name,
            file_type: extension.toUpperCase(),
            content_type: "Text Document",
            content: text
          }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS }
          });
        }

        return new Response(JSON.stringify({ error: "Unsupported file type for content extraction" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });

      } catch (err) {
        return new Response(JSON.stringify({ error: "[IRIS Payload Manager]: File content extraction failed", details: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }
    }

    // ==========================================
    // MODE D: FILE METADATA EXTRACTION
    // ==========================================
    if (mode === "file_extract") {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "[IRIS Payload Manager]: file_extract mode requires POST with multipart/form-data" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }

      try {
        const formData = await request.formData();
        const files = [];
        
        for (const [key, value] of formData.entries()) {
          if (key.startsWith('file') && value instanceof File) {
            files.push(value);
          }
        }

        if (files.length === 0) {
          return new Response(JSON.stringify({ error: "[IRIS Payload Manager]: No files uploaded" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS }
          });
        }

        const filesToProcess = files.slice(0, 15);
        const extractedMetadata = [];

        for (const file of filesToProcess) {
          if (file.size > 50 * 1024 * 1024) {
            extractedMetadata.push({
              filename: file.name,
              error: "File exceeds 50MB limit",
              size_bytes: file.size
            });
            continue;
          }

          const metadata = await extractFileMetadata(file);
          extractedMetadata.push(metadata);
        }

        return new Response(JSON.stringify({
          status: "success",
          mode: "file_extract",
          count: extractedMetadata.length,
          results: extractedMetadata
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });

      } catch (err) {
        return new Response(JSON.stringify({ error: "[IRIS Payload Manager]: File extraction failed", details: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }
    }

    // ==========================================
    // MODE C.5: LINKTREE DETECTOR
    // ==========================================
    if (mode === "linktree") {
      if (!targetUrl) {
        return new Response(JSON.stringify({ error: "[IRIS Payload Manager]: Missing required parameter 'url'" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }

      try {
        const pageHtml = await fetchPageContent(targetUrl);
        const links = extractAllLinks(pageHtml, targetUrl);

        return new Response(JSON.stringify({
          status: "success",
          mode: "linktree",
          url: targetUrl,
          link_count: links.length,
          results: links
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "[IRIS Payload Manager]: Linktree extraction failed", details: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }
    }

    // ==========================================
    // MODE C: LINK PHRASING
    // ==========================================
    if (mode === "link_phrase") {
      if (!targetUrl) {
        return new Response(JSON.stringify({ error: "[IRIS Payload Manager]: Missing required parameter 'url'" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const pageResponse = await fetch(targetUrl, {
          method: "GET",
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Accept": "text/html" },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!pageResponse.ok) {
          throw new Error(`HTTP ${pageResponse.status}`);
        }

        let pageHtml = await pageResponse.text();
        pageHtml = pageHtml
          .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, "")
          .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, "")
          .replace(/<nav[^>]*>([\s\S]*?)<\/nav>/gi, "")
          .replace(/<footer[^>]*>([\s\S]*?)<\/footer>/gi, "");

        const cleanText = (str) => {
          if (!str) return "";
          return str.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
        };

        const text = cleanText(pageHtml);

        return new Response(JSON.stringify({
          status: "success",
          mode: "link_phrase",
          url: targetUrl,
          character_count: text.length,
          word_count: text.split(/\s+/).length,
          content_preview: text.substring(0, 1000)
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "[IRIS Payload Manager]: Link phrase extraction failed", details: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }
    }

    // Handle non-file modes with JSON body for POST
    if (request.method === "POST") {
      try {
        const body = await request.json();
        q = body.query || body.q || q;
        mode = body.mode || mode;
        maxResultsParam = body.max_results || maxResultsParam;
        summarySizeParam = body.summary_size || summarySizeParam;
      } catch (e) {
        return new Response(JSON.stringify({ error: "[IRIS Payload Manager]: Malformed JSON payload, Service Unavailable" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      }
    }

    if (!q && mode !== "linktree" && mode !== "link_phrase") {
      return new Response(JSON.stringify({ error: "[IRIS Payload Manager]: Missing required parameter 'q'" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
      });
    }

    let maxResults = parseInt(maxResultsParam, 10) || 8;
    maxResults = Math.max(1, Math.min(25, maxResults));

    let summarySize = parseInt(summarySizeParam, 10) || 25;
    summarySize = Math.max(5, Math.min(100, summarySize));

    // Common Text Cleaning Utilities
    const cleanText = (str) => {
      if (!str) return "";
      return str.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    };

    const limitToWords = (str, wordLimit) => {
      const words = str.split(" ");
      if (words.length <= wordLimit) return str;
      return words.slice(0, wordLimit).join(" ") + "...";
    };

    // ==========================================
    // MODE A: WIKIPEDIA API SEARCH
    // ==========================================
    if (mode === "wikipedia") {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&origin=*&srlimit=${maxResults}`;
      try {
        const res = await fetch(wikiUrl, { headers: { "User-Agent": "LLMProxy/1.0" } });
        const data = await res.json();
        const results = [];

        if (data.query && data.query.search) {
          for (const item of data.query.search) {
            results.push({
              title: item.title,
              url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}`,
              snippet: limitToWords(cleanText(item.snippet), summarySize)
            });
          }
        }
        return new Response(JSON.stringify({ status: "success", mode, query: q, count: results.length, results }), {
          status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Wikipedia API failed", details: err.message }), { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
      }
    }

    // Helper: Execute a Bing SERP to get URLs (Used by both search and extract modes)
    async function fetchBingSERP(searchQuery) {
      const targetUrl = `https://www.bing.com/search?q=${encodeURIComponent(searchQuery)}`;
      const res = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5"
        }
      });
      if (!res.ok) throw new Error(`[IRIS Payload Manager]: Bing SERP down due to connection / Html scrape failure for Client: HTTP ${res.status}`);
      const html = await res.text();
      const dataset = [];

      const parseBingTrackingUrl = (rawUrlString) => {
        if (!rawUrlString.includes("bing.com/ck/a?!")) return rawUrlString;
        try {
          const uMatch = rawUrlString.match(/[?&]u=([^&]+)/);
          if (!uMatch) return rawUrlString;
          let base64Token = uMatch[1];
          if (base64Token.startsWith("a1") || base64Token.startsWith("b1")) base64Token = base64Token.substring(2);
          else if (/^[a-zA-Z]/.test(base64Token) && !base64Token.startsWith("aHR0cH")) base64Token = base64Token.substring(1);
          while (base64Token.length % 4 !== 0) base64Token += "=";
          const decodedData = atob(base64Token.replace(/-/g, "+").replace(/_/g, "/"));
          return (decodedData.startsWith("http://") || decodedData.startsWith("https://")) ? decodedData : rawUrlString;
        } catch { return rawUrlString; }
      };

      const entryBlockRegex = /<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
      const blocks = html.matchAll(entryBlockRegex);

      for (const block of blocks) {
        const blockContent = block[1];
        const linkMatch = blockContent.match(/<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
        const textMatch = blockContent.match(/<p[^>]*>([\s\S]*?)<\/p>/) || blockContent.match(/<div[^>]*class="[^"]*b_caption[^"]*"[^>]*>([\s\S]*?)<\/div>/);

        if (linkMatch) {
          let resolvedUrl = linkMatch[1].replace(/&amp;/g, "&");
          resolvedUrl = parseBingTrackingUrl(resolvedUrl);
          const title = cleanText(linkMatch[2]);
          const snippet = textMatch ? cleanText(textMatch[1]) : "";

          if (title && resolvedUrl && !resolvedUrl.startsWith("javascript:")) {
            dataset.push({ title, url: resolvedUrl, snippet });
          }
        }
      }
      return dataset;
    }

    // ==========================================
    // MODE B: STANDARD BING WEB SEARCH
    // ==========================================
    if (mode === "search") {
      try {
        const parsedResults = await fetchBingSERP(q);
        const finalDataset = parsedResults.slice(0, maxResults).map(item => ({
          title: item.title,
          url: item.url,
          snippet: limitToWords(item.snippet, summarySize)
        }));

        return new Response(JSON.stringify({ status: "success", mode, query: q, count: finalDataset.length, results: finalDataset }), {
          status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "[IRIS Payload Manager]: Search mode failure on server", details: err.message }), { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
      }
    }

    // ==========================================
    // MODE B.5: DEEP DOCUMENT EXTRACTION PIPELINE
    // ==========================================
    if (mode === "extract") {
      try {
        const initialLinks = await fetchBingSERP(q);
        if (initialLinks.length === 0) {
          return new Response(JSON.stringify({ status: "success", mode, query: q, count: 0, message: "[IRIS Payload Manager]: No source paths found to process.", results: [] }), {
            status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS }
          });
        }

        const targetsToCrawl = initialLinks.slice(0, 3);
        const deepDocumentsDataset = [];

        for (const target of targetsToCrawl) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);

            const pageResponse = await fetch(target.url, {
              method: "GET",
              headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Accept": "text/html" },
              signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!pageResponse.ok) continue;
            let rawPageHtml = await pageResponse.text();

            rawPageHtml = rawPageHtml
              .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, "")
              .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, "")
              .replace(/<nav[^>]*>([\s\S]*?)<\/nav>/gi, "")
              .replace(/<footer[^>]*>([\s\S]*?)<\/footer>/gi, "");

            const cleanDocumentBody = cleanText(rawPageHtml);

            deepDocumentsDataset.push({
              title: target.title,
              url: target.url,
              document_content: cleanDocumentBody || target.snippet
            });
          } catch (e) {
            deepDocumentsDataset.push({
              title: target.title,
              url: target.url,
              document_content: `Extraction Timeout/Failure: ${e.message}. Fallback Data: ${target.snippet}`
            });
          }
        }

        return new Response(JSON.stringify({
          status: "success",
          mode,
          query: q,
          count: deepDocumentsDataset.length,
          results: deepDocumentsDataset
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS }
        });

      } catch (err) {
        return new Response(JSON.stringify({ error: "[IRIS Payload Manager]: Deep document extraction engine failure", details: err.message }), { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
      }
    }

    // Default Error Fallback
    return new Response(JSON.stringify({ error: "[IRIS Payload Manager]: Unknown request mode configuration" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  }
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function safeTextDecode(uint8Array) {
  try {
    return new TextDecoder().decode(uint8Array);
  } catch (e) {
    // Fallback: try to decode with replacement characters
    let result = '';
    for (let i = 0; i < uint8Array.length; i++) {
      const byte = uint8Array[i];
      if (byte === 0) break; // Stop at null terminator
      if ((byte & 0x80) === 0) {
        result += String.fromCharCode(byte);
      } else if ((byte & 0xE0) === 0xC0) {
        result += String.fromCharCode(((byte & 0x1F) << 6) | (uint8Array[++i] & 0x3F));
      } else if ((byte & 0xF0) === 0xE0) {
        result += String.fromCharCode(((byte & 0x0F) << 12) | ((uint8Array[++i] & 0x3F) << 6) | (uint8Array[++i] & 0x3F));
      }
    }
    return result;
  }
}

async function fetchPageContent(pageUrl) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  const res = await fetch(pageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "text/html"
    },
    signal: controller.signal
  });
  clearTimeout(timeoutId);

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function extractAllLinks(html, baseUrl) {
  const links = [];
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
  let match;

  const seen = new Set();

  while ((match = linkRegex.exec(html)) !== null) {
    let href = match[1];
    const text = match[2].trim();

    if (href.startsWith('#') || href.startsWith('javascript:') || !href) continue;

    try {
      if (!href.startsWith('http')) {
        const base = new URL(baseUrl);
        href = new URL(href, base).href;
      }
      if (!seen.has(href)) {
        seen.add(href);
        links.push({
          url: href,
          text: text || '(no text)'
        });
      }
    } catch (e) {
      // Skip invalid URLs
    }
  }

  return links;
}

async function extractFileMetadata(file) {
  const metadata = {
    filename: file.name,
    mime_type: file.type,
    size_bytes: file.size,
    size_human: formatBytes(file.size),
    last_modified: new Date(file.lastModified).toISOString()
  };

  const extension = file.name.split('.').pop().toLowerCase();

  try {
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    switch (extension) {
      case 'pdf':
        return { ...metadata, ...extractPDFMetadata(uint8Array) };
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'webp':
        return { ...metadata, ...extractImageMetadata(uint8Array, extension) };
      case 'mov':
      case 'mp3':
      case 'm4a':
      case 'wav':
        return { ...metadata, ...extractAudioVideoMetadata(uint8Array, extension) };
      case 'txt':
      case 'csv':
        return { ...metadata, ...extractTextMetadata(uint8Array) };
      case 'docx':
      case 'pptx':
      case 'xlsx':
        return { ...metadata, ...extractOfficeMetadata(uint8Array, extension) };
      default:
        return { ...metadata, content_preview: "Unsupported file type for content extraction" };
    }
  } catch (error) {
    return { ...metadata, error: `Extraction failed: ${error.message}` };
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function extractPDFMetadata(uint8Array) {
  const text = safeTextDecode(uint8Array.slice(0, 2048));
  
  const metadata = { file_type: 'PDF Document' };
  
  const versionMatch = text.match(/%PDF-(\d+\.\d+)/);
  if (versionMatch) metadata.pdf_version = versionMatch[1];
  
  const titleMatch = text.match(/\/Title\s*\(([^)]+)\)/);
  if (titleMatch) metadata.title = titleMatch[1];
  
  const authorMatch = text.match(/\/Author\s*\(([^)]+)\)/);
  if (authorMatch) metadata.author = authorMatch[1];
  
  const pageMatch = text.match(/\/Count\s+(\d+)/);
  if (pageMatch) metadata.page_count = parseInt(pageMatch[1]);
  
  return metadata;
}

function extractImageMetadata(uint8Array, extension) {
  const metadata = { file_type: `${extension.toUpperCase()} Image` };
  
  try {
    if (extension === 'png') {
      if (uint8Array.length > 24) {
        const width = (uint8Array[16] << 24) | (uint8Array[17] << 16) | (uint8Array[18] << 8) | uint8Array[19];
        const height = (uint8Array[20] << 24) | (uint8Array[21] << 16) | (uint8Array[22] << 8) | uint8Array[23];
        metadata.dimensions = `${width}x${height}`;
        metadata.bit_depth = uint8Array[24];
        metadata.color_type = uint8Array[25];
      }
    } else if (extension === 'jpg' || extension === 'jpeg') {
      metadata.format = 'JPEG';
      for (let i = 0; i < uint8Array.length - 9; i++) {
        if (uint8Array[i] === 0xFF && uint8Array[i + 1] === 0xC0) {
          const height = (uint8Array[i + 5] << 8) | uint8Array[i + 6];
          const width = (uint8Array[i + 7] << 8) | uint8Array[i + 8];
          metadata.dimensions = `${width}x${height}`;
          break;
        }
      }
    } else if (extension === 'webp') {
      metadata.format = 'WebP';
      if (uint8Array.length > 30) {
        if (uint8Array[12] === 0x56 && uint8Array[13] === 0x50 && uint8Array[14] === 0x38) {
          metadata.webp_type = 'Lossy';
        }
      }
    }
  } catch (error) {
    metadata.extraction_note = 'Partial metadata extraction';
  }
  
  return metadata;
}

function extractAudioVideoMetadata(uint8Array, extension) {
  const metadata = { file_type: `${extension.toUpperCase()} Media` };
  
  try {
    if (extension === 'mp3') {
      const text = safeTextDecode(uint8Array.slice(0, 128));
      if (text.substring(0, 3) === 'ID3') {
        metadata.has_id3_tag = true;
        metadata.metadata_format = 'ID3';
      } else {
        metadata.metadata_format = 'None detected';
      }
    } else if (extension === 'wav') {
      if (uint8Array[0] === 0x52 && uint8Array[1] === 0x49 && uint8Array[2] === 0x46) {
        metadata.format = 'RIFF WAV';
        const channels = uint8Array[22];
        const sampleRate = (uint8Array[24] | (uint8Array[25] << 8) | (uint8Array[26] << 16) | (uint8Array[27] << 24));
        metadata.channels = channels;
        metadata.sample_rate = sampleRate;
      }
    } else if (extension === 'm4a') {
      if (uint8Array.length > 8) {
        const type = safeTextDecode(uint8Array.slice(4, 8));
        if (type === 'ftyp') {
          metadata.format = 'MPEG-4 Audio';
          metadata.metadata_format = 'iTunes compatible';
        }
      }
    } else if (extension === 'mov') {
      if (uint8Array.length > 8) {
        const type = safeTextDecode(uint8Array.slice(4, 8));
        if (type === 'ftyp' || type === 'mdat') {
          metadata.format = 'QuickTime Movie';
          metadata.container = 'MOV';
        }
      }
    }
  } catch (error) {
    metadata.extraction_note = 'Partial metadata extraction';
  }
  
  return metadata;
}

function extractTextMetadata(uint8Array) {
  const text = safeTextDecode(uint8Array);
  
  const lines = text.split('\n');
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
  
  return {
    file_type: 'Text Document',
    line_count: lines.length,
    word_count: wordCount,
    character_count: text.length,
    content_preview: text.substring(0, 500).replace(/\s+/g, ' ').trim() + (text.length > 500 ? '...' : '')
  };
}

function extractOfficeMetadata(uint8Array, extension) {
  const metadata = { file_type: `Microsoft Office ${extension.toUpperCase()}` };
  
  if (uint8Array[0] === 0x50 && uint8Array[1] === 0x4B) {
    metadata.format = 'Office Open XML';
    
    const text = safeTextDecode(uint8Array.slice(0, 4096));
    
    if (text.includes('word/')) metadata.document_type = 'Word Document';
    if (text.includes('ppt/')) metadata.document_type = 'PowerPoint Presentation';
    if (text.includes('xl/')) metadata.document_type = 'Excel Spreadsheet';
    
    const creatorMatch = text.match(/<dc:creator>([^<]+)<\/dc:creator>/);
    if (creatorMatch) metadata.creator = creatorMatch[1];
    
    const titleMatch = text.match(/<dc:title>([^<]+)<\/dc:title>/);
    if (titleMatch) metadata.title = titleMatch[1];
  } else {
    metadata.format = 'Legacy Office Format';
  }
  
  return metadata;
}


async function extractOfficeSource(uint8Array, extension) {
  try {
    if (uint8Array[0] !== 0x50 || uint8Array[1] !== 0x4B) {
      return "Legacy Office format - binary extraction not supported";
    }

    if (extension === 'docx') {
      const xmlContent = extractZipFileContent(uint8Array, 'word/document.xml');
      return xmlContent || "Could not extract document content";
    }

    if (extension === 'pptx') {
      const xmlContent = extractZipFileContent(uint8Array, 'ppt/presentation.xml');
      return xmlContent || "Could not extract presentation content";
    }

    if (extension === 'xlsx') {
      const xmlContent = extractZipFileContent(uint8Array, 'xl/workbook.xml');
      return xmlContent || "Could not extract workbook content";
    }

    return "Could not find core XML file in Office document";
  } catch (error) {
    return `Error extracting Office source: ${error.message}`;
  }
}

function extractZipFileContent(uint8Array, filename) {
  try {
    const filenameBytes = new TextEncoder().encode(filename);
    let position = 0;

    while (position < uint8Array.length - 30) {
      if (uint8Array[position] === 0x50 && uint8Array[position + 1] === 0x4B && 
          uint8Array[position + 2] === 0x03 && uint8Array[position + 3] === 0x04) {
        
        const filenameLength = uint8Array[position + 26] | (uint8Array[position + 27] << 8);
        const extraLength = uint8Array[position + 28] | (uint8Array[position + 29] << 8);
        const compressedSize = uint8Array[position + 18] | (uint8Array[position + 19] << 8) | 
                               (uint8Array[position + 20] << 16) | (uint8Array[position + 21] << 24);
        
        const headerFilename = safeTextDecode(uint8Array.slice(position + 30, position + 30 + filenameLength));
        
        if (headerFilename === filename) {
          const fileDataStart = position + 30 + filenameLength + extraLength;
          const fileData = uint8Array.slice(fileDataStart, fileDataStart + compressedSize);
          return safeTextDecode(fileData);
        }
        
        position += 30 + filenameLength + extraLength + compressedSize;
      } else {
        position++;
      }
    }

    return null;
  } catch (error) {
    return `Error: ${error.message}`;
  }
}
