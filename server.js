// St. Andrew Carpool Board: tiny dependency-free server.
// Run: node server.js   (PORT env var optional, default 8080)
// Data lives in data.json next to this file.
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const PORT = process.env.PORT || 8080;
const DATA = path.join(process.env.DATA_DIR || __dirname, "data.json"); // set DATA_DIR to a persistent disk/volume on a cloud host
const PUB = path.join(__dirname, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

const load = () => { try { return JSON.parse(fs.readFileSync(DATA, "utf8")); } catch { return []; } };
const save = (d) => fs.writeFileSync(DATA + ".tmp", JSON.stringify(d, null, 2)) || fs.renameSync(DATA + ".tmp", DATA);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date()); // YYYY-MM-DD in Riverside time, whatever the server clock
const clean = (s, n) => String(s || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);

// simple per-IP rate limit: 10 posts per hour
const hits = new Map();
const clientIp = (req) => String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress; // behind a host proxy
const limited = (ip) => { const now = Date.now(), a = (hits.get(ip) || []).filter(t => now - t < 3600e3); a.push(now); hits.set(ip, a); return a.length > 10; };

const send = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
const body = (req) => new Promise((ok, no) => { let b = ""; req.on("data", c => { b += c; if (b.length > 5000) { req.destroy(); no(); } }); req.on("end", () => { try { ok(JSON.parse(b || "{}")); } catch { no(); } }); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/api/drivers" && req.method === "GET") {
      const t = today();
      const list = load().filter(d => d.date >= t).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.created - b.created)
        .map(({ id, name, city, date, phone }) => ({ id, name, city, date, phone }));
      return send(res, 200, list);
    }
    if (url.pathname === "/api/drivers" && req.method === "POST") {
      if (limited(clientIp(req))) return send(res, 429, { error: "Too many sign-ups. Please try again later." });
      const b = await body(req);
      if (b.website) return send(res, 200, { ok: true }); // honeypot
      const name = clean(b.name, 40).replace(/(^|[\s\-'])([a-z])/g, (m, a, c) => a + c.toUpperCase()), city = clean(b.city, 40), date = clean(b.date, 10), phone = clean(b.phone, 20);
      const digits = phone.replace(/\D/g, "");
      if (!name) return send(res, 400, { error: "Enter your first name and last initial." });
      if (!city) return send(res, 400, { error: "Choose or type your city." });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today()) return send(res, 400, { error: "Choose a date that is today or later." });
      const max = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
      if (date > max) return send(res, 400, { error: "Choose a date within the next 90 days." });
      if (!(digits.length === 10 || (digits.length === 11 && digits[0] === "1"))) return send(res, 400, { error: "Enter a 10-digit phone number." });
      const d10 = digits.slice(-10);
      const pretty = `(${d10.slice(0, 3)}) ${d10.slice(3, 6)}-${d10.slice(6)}`;
      const all = load();
      if (all.some(d => d.phone === pretty && d.date === date)) return send(res, 409, { error: "That phone number is already on the board for that date." });
      const rec = { id: crypto.randomBytes(6).toString("hex"), token: crypto.randomBytes(12).toString("hex"), name, city, date, phone: pretty, created: Date.now() };
      all.push(rec); save(all);
      return send(res, 201, { ok: true, id: rec.id, token: rec.token });
    }
    const m = url.pathname.match(/^\/api\/drivers\/([a-f0-9]+)$/);
    if (m && req.method === "DELETE") {
      const all = load(), i = all.findIndex(d => d.id === m[1] && d.token === url.searchParams.get("token"));
      if (i < 0) return send(res, 404, { error: "Not found." });
      all.splice(i, 1); save(all); return send(res, 200, { ok: true });
    }
    // static files
    let p = url.pathname === "/" ? "/index.html" : url.pathname;
    const f = path.join(PUB, path.normalize(p).replace(/^(\.\.[\/\\])+/, ""));
    if (p === "/robots.txt") { res.writeHead(200, { "Content-Type": "text/plain" }); return res.end("User-agent: *\nDisallow: /\n"); }
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream", "X-Robots-Tag": "noindex, nofollow" });
    fs.createReadStream(f).pipe(res);
  } catch { send(res, 400, { error: "Bad request." }); }
}).listen(PORT, () => console.log("Carpool board on http://localhost:" + PORT));
