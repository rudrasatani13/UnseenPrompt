const response = await fetch("http://127.0.0.1:8787/");
const body = await response.text();

if (!response.ok) {
  throw new Error(`Cloudflare preview returned HTTP ${response.status}`);
}

if (!body.includes("UnseenPrompt") || !body.includes("Stateful Project Copilot")) {
  throw new Error("Cloudflare preview did not render the UnseenPrompt identity");
}
