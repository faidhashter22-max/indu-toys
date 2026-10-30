// Server lokal sederhana tanpa dependensi untuk mencoba aplikasi di komputer sendiri.
// Jalankan:  node dev-server.js        lalu buka http://localhost:5500 (pembeli)
//                                      dan http://localhost:5500/staff (kasir/admin)
// Di Vercel, link /staff diatur oleh vercel.json — file ini tidak dipakai di sana.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 5500);
const STAFF_PATHS = ["/staff", "/kasir", "/admin"];
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]).replace(/\/+$/, "") || "/";
  if (urlPath === "/" || STAFF_PATHS.includes(urlPath.toLowerCase())) urlPath = "/index.html";

  const file = path.join(ROOT, urlPath);
  // Tolak path di luar folder proyek dan file/folder tersembunyi (.git, .claude, ...)
  if (!file.startsWith(ROOT + path.sep) || path.relative(ROOT, file).split(path.sep).some((s) => s.startsWith("."))) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404 — tidak ditemukan");
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`Indu Toys berjalan:`);
  console.log(`  Link pembeli : http://localhost:${PORT}`);
  console.log(`  Link staf    : http://localhost:${PORT}/staff`);
});
