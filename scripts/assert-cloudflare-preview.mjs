const baseUrl = "http://127.0.0.1:8787";

const homeResponse = await fetch(`${baseUrl}/`);
const homeBody = await homeResponse.text();

if (!homeResponse.ok) {
  throw new Error(`Cloudflare preview returned HTTP ${homeResponse.status}`);
}

if (!homeBody.includes("UnseenPrompt")) {
  throw new Error("Cloudflare preview did not render the UnseenPrompt identity");
}

const healthResponse = await fetch(`${baseUrl}/api/health`, {
  headers: { Accept: "application/json" },
});
const cacheControl = healthResponse.headers.get("cache-control") ?? "";
const health = await healthResponse.json();
const serialized = JSON.stringify(health);

if (!healthResponse.ok) {
  throw new Error(`Runtime health returned HTTP ${healthResponse.status}`);
}

if (!cacheControl.includes("no-store")) {
  throw new Error(`Runtime health cache-control missing no-store: ${cacheControl}`);
}

if (health.service !== "unseenprompt" || health.status !== "ok" || health.environment !== "local") {
  throw new Error("Runtime health payload did not match the local contract");
}

for (const fragment of ["token", "secret", "account"]) {
  if (serialized.toLowerCase().includes(fragment)) {
    throw new Error(`Runtime health payload leaked sensitive fragment: ${fragment}`);
  }
}
