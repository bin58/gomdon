// Localhost Admin Server duyệt thẻ cào GomĐơn (chạy trên http://localhost:8787)
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8787;
const DATA_FILE = path.join(__dirname, "cards-data.json");
const LICENSE_SALT = "GD_PLAN_2026_V1";

function fnv1aHash(str) {
  let x = 2166136261;
  for (let i = 0; i < str.length; i++) {
    x ^= str.charCodeAt(i);
    x = Math.imul(x, 16777619);
  }
  return (x >>> 0).toString(16);
}

function generateLicenseCode(plan) {
  const prefix = plan === "2m" ? "GD2M" : "GD1M";
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let token = "";
  for (let i = 0; i < 4; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  const cs = fnv1aHash(`${LICENSE_SALT}:${prefix}-${token}`).slice(0, 2).toUpperCase();
  return `${prefix}-${token}-${cs}`;
}

function readCards() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCards(cards) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(cards, null, 2), "utf8");
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Private-Network": "true",
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 65536) reject(new Error("Payload too large"));
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = reqUrl.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Private-Network": "true",
    });
    res.end();
    return;
  }

  if (pathname === "/api/cards" && req.method === "GET") {
    return sendJson(res, 200, { ok: true, cards: readCards() });
  }

  if (pathname === "/api/cards" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const serial = String(body.serial || "").trim();
      const pin = String(body.pin || "").trim();
      const contact = String(body.contact || "").trim();
      const telco = String(body.telco || "Viettel").trim();
      const amount = parseInt(body.amount, 10) >= 50000 ? 50000 : 30000;
      const plan = amount >= 50000 ? "2m" : "1m";

      if (!serial || !pin || !contact) {
        return sendJson(res, 400, { ok: false, message: "Thiếu seri, mã thẻ hoặc SĐT/Zalo." });
      }

      const card = {
        id: `CARD_${Date.now()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        telco,
        amount,
        plan,
        serial,
        pin,
        contact,
        status: "pending",
        licenseCode: "",
        createdAt: body.createdAt || new Date().toISOString(),
      };
      const cards = readCards();
      cards.unshift(card);
      writeCards(cards);
      return sendJson(res, 201, { ok: true, card });
    } catch {
      return sendJson(res, 400, { ok: false, message: "Dữ liệu không hợp lệ." });
    }
  }

  const approveMatch = pathname.match(/^\/api\/cards\/([^/]+)\/approve$/);
  if (approveMatch && req.method === "POST") {
    const id = decodeURIComponent(approveMatch[1]);
    const cards = readCards();
    const card = cards.find((c) => c.id === id);
    if (!card) return sendJson(res, 404, { ok: false, message: "Không tìm thấy thẻ." });
    if (!card.licenseCode) {
      card.licenseCode = generateLicenseCode(card.plan);
    }
    card.status = "approved";
    card.reviewedAt = new Date().toISOString();
    writeCards(cards);
    return sendJson(res, 200, { ok: true, card });
  }

  const rejectMatch = pathname.match(/^\/api\/cards\/([^/]+)\/reject$/);
  if (rejectMatch && req.method === "POST") {
    const id = decodeURIComponent(rejectMatch[1]);
    const cards = readCards();
    const card = cards.find((c) => c.id === id);
    if (!card) return sendJson(res, 404, { ok: false, message: "Không tìm thấy thẻ." });
    card.status = "rejected";
    card.reviewedAt = new Date().toISOString();
    writeCards(cards);
    return sendJson(res, 200, { ok: true, card });
  }

  const targetFile = pathname === "/" ? "admin.html" : pathname.replace(/^\/+/, "");
  const safePath = path.normalize(path.join(__dirname, targetFile));
  if (!safePath.startsWith(__dirname) || !fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const ext = path.extname(safePath);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(safePath).pipe(res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`GomDon Card Admin running at http://localhost:${PORT}/admin.html`);
});
