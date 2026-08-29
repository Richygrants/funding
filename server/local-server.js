const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { handleApplicationSubmission } = require("./telegram-handler");

const projectRoot = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 5173);
const maxBodyBytes = 30_000;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

async function loadEnvFile(fileName) {
  const filePath = path.join(projectRoot, fileName);
  let contents;
  try {
    contents = await fs.readFile(filePath, "utf8");
  } catch {
    return;
  }

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const splitAt = trimmed.indexOf("=");
    if (splitAt === -1) continue;
    const key = trimmed.slice(0, splitAt).trim();
    const value = trimmed.slice(splitAt + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && !process.env[key]) process.env[key] = value;
  }
}

function send(res, statusCode, headers, body = "") {
  res.writeHead(statusCode, headers);
  res.end(body);
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > maxBodyBytes) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
  }
  return body;
}

async function handleApi(req, res) {
  let body = "";
  try {
    body = await readBody(req);
  } catch (error) {
    return send(res, error.statusCode || 400, { "Content-Type": "application/json" }, JSON.stringify({
      ok: false,
      message: "Invalid submission."
    }));
  }

  const result = await handleApplicationSubmission({
    method: req.method,
    body
  });

  return send(res, result.statusCode, result.headers, result.body);
}

async function serveFile(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const requestedPath = decodeURIComponent(url.pathname);
  const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(projectRoot, relativePath));

  if (filePath !== projectRoot && !filePath.startsWith(`${projectRoot}${path.sep}`)) {
    return send(res, 403, { "Content-Type": "text/plain; charset=utf-8" }, "Forbidden");
  }

  try {
    const stat = await fs.stat(filePath);
    const finalPath = stat.isDirectory() ? path.join(filePath, "index.html") : filePath;
    const body = await fs.readFile(finalPath);
    return send(res, 200, {
      "Content-Type": mimeTypes[path.extname(finalPath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    }, req.method === "HEAD" ? "" : body);
  } catch {
    return send(res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not found");
  }
}

async function start() {
  await loadEnvFile(".env.local");
  await loadEnvFile(".env");
  process.env.NODE_ENV ||= "development";

  const server = http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith("/api/submit-application")) {
        await handleApi(req, res);
        return;
      }

      if (req.method !== "GET" && req.method !== "HEAD") {
        send(res, 405, { "Content-Type": "text/plain; charset=utf-8" }, "Method not allowed");
        return;
      }

      await serveFile(req, res);
    } catch {
      send(res, 500, { "Content-Type": "text/plain; charset=utf-8" }, "Internal server error");
    }
  });

  server.listen(port, () => {
    process.stdout.write(`USA Funding Portal running at http://localhost:${port}\n`);
  });
}

start();
