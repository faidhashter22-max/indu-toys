/* =========================================================
   Indu Toys — Katalog, Kasir POS, Kelola Stok & Laporan
   Semua data disimpan di LocalStorage browser.
   ========================================================= */
(() => {
  "use strict";

  /* ---------- KONSTANTA ---------- */
  const KEYS = {
    products: "indutoys.products",
    transactions: "indutoys.transactions",
    catalogCart: "indutoys.catalogCart",
    posCart: "indutoys.posCart",
    settings: "indutoys.settings",
    theme: "indutoys.theme",
  };
  const LOW_STOCK = 5;
  const AGES = ["0-2 tahun", "3-5 tahun", "6-8 tahun", "9+ tahun"];
  const DEFAULT_SETTINGS = {
    storeName: "Indu Toys",
    wa: "6281234567890",
    address: "Jl. Ceria No. 1, Indonesia",
    bank: "BCA 1234567890 a.n. Indu Toys",
  };
  const unsplash = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=600&q=70`;
  const SEED_PRODUCTS = [
    { name: "Balok Susun Kayu Pelangi", category: "Edukatif", age: "0-2 tahun", price: 89000, stock: 24, image: unsplash("1596461404969-9ae70f2830c1"), desc: "Balok kayu warna-warni untuk melatih motorik dan mengenal warna." },
    { name: "Boneka Teddy Bear Lembut", category: "Boneka", age: "0-2 tahun", price: 125000, stock: 15, image: unsplash("1559454403-b8fb88521f11"), desc: "Teddy bear super lembut, aman untuk bayi, bisa dicuci." },
    { name: "Mobil Balap Remote Control", category: "Kendaraan", age: "6-8 tahun", price: 249000, stock: 4, image: unsplash("1594787318286-3d835c1d207f"), desc: "Mobil RC lincah dengan baterai isi ulang, jangkauan 30 meter." },
    { name: "Puzzle Peta Indonesia 100 pcs", category: "Puzzle", age: "6-8 tahun", price: 65000, stock: 30, image: unsplash("1606503153255-59d8b8b82176"), desc: "Belajar provinsi dan pulau Indonesia sambil bermain." },
    { name: "Set Bricks Kota Kreatif 500 pcs", category: "Konstruksi", age: "9+ tahun", price: 359000, stock: 8, image: unsplash("1587654780291-39c9404d746b"), desc: "Bangun kota impian dengan 500 keping bricks kompatibel." },
    { name: "Kereta Api Kayu & Rel", category: "Kendaraan", age: "3-5 tahun", price: 175000, stock: 3, image: unsplash("1558060370-d644479cb6f7"), desc: "Set kereta kayu lengkap dengan 20 potong rel." },
    { name: "Kubus Rubik 3x3 Speed", category: "Edukatif", age: "9+ tahun", price: 45000, stock: 40, image: unsplash("1591991731833-b4807cf7ef94"), desc: "Rubik putaran halus untuk melatih logika dan kesabaran." },
    { name: "Mainan Dapur-dapuran Mini", category: "Peran", age: "3-5 tahun", price: 199000, stock: 10, image: unsplash("1608889175123-8ee362201f81"), desc: "Set dapur mini lengkap dengan alat masak dan sayuran mainan." },
    { name: "Gelang Bunyi Bayi (Rattle)", category: "Bayi", age: "0-2 tahun", price: 39000, stock: 2, image: unsplash("1515488042361-ee00e0ddd4e4"), desc: "Rattle warna cerah, BPA free, merangsang pendengaran bayi." },
    { name: "Bola Sepak Anak Ukuran 3", category: "Outdoor", age: "6-8 tahun", price: 79000, stock: 18, image: unsplash("1614632537197-38a17061c2bd"), desc: "Bola ringan dan empuk untuk latihan si kecil." },
  ];

  /* ---------- UTIL ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const fmtRp = (n) => "Rp" + Math.round(Number(n) || 0).toLocaleString("id-ID");
  const fmtNum = (n) => (Number(n) || 0).toLocaleString("id-ID");
  const uid = (p = "P") => p + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const fmtDateTime = (iso) => new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const parseMoney = (v) => Number(String(v ?? "").replace(/[^\d]/g, "")) || 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const PLACEHOLDER_IMG = "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='400' height='300' fill='#FEF3C7'/><circle cx='200' cy='150' r='80' fill='#FACC15'/><text x='200' y='180' font-size='90' text-anchor='middle'>🧸</text></svg>`
  );
  const imgTag = (src, alt) => `<img src="${esc(src || PLACEHOLDER_IMG)}" alt="${esc(alt)}" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'" />`;

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch { return fallback; }
    },
    set(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); }
      catch (e) { toast("Gagal menyimpan data: penyimpanan browser penuh atau diblokir.", "error"); }
    },
  };

  /* ---------- STATE ---------- */
  let products = store.get(KEYS.products, null);
  if (!Array.isArray(products)) {
    products = SEED_PRODUCTS.map((p, i) => ({ id: "P" + (1001 + i), ...p }));
    store.set(KEYS.products, products);
  }
  let transactions = store.get(KEYS.transactions, []);
  let catalogCart = store.get(KEYS.catalogCart, []);
  let posCart = store.get(KEYS.posCart, []);
  let settings = { ...DEFAULT_SETTINGS, ...store.get(KEYS.settings, {}) };

  const ui = {
    view: "catalog",
    catCategory: "all",
    payMethod: "Tunai",
    reportPeriod: "today",
    recapMode: "daily",
    lastTx: null,
  };

  const saveProducts = () => store.set(KEYS.products, products);
  const saveTx = () => store.set(KEYS.transactions, transactions);
  const saveCatalogCart = () => store.set(KEYS.catalogCart, catalogCart);
  const savePosCart = () => store.set(KEYS.posCart, posCart);
  const findProduct = (id) => products.find((p) => p.id === id);
  const categories = () => [...new Set(products.map((p) => p.category).filter(Boolean))].sort();

  /* ---------- TOAST / LOADING / CONFIRM ---------- */
  function toast(msg, type = "success") {
    const el = document.createElement("div");
    el.className = "toast " + type;
    el.textContent = msg;
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }
  function loading(show, text = "Memproses...") {
    $("#loadingText").textContent = text;
    $("#loading").hidden = !show;
  }
  function confirmDialog(title, text) {
    return new Promise((resolve) => {
      $("#confirmTitle").textContent = title;
      $("#confirmText").textContent = text;
      const modal = $("#confirmModal");
      modal.hidden = false;
      const done = (v) => { modal.hidden = true; $("#confirmYes").onclick = $("#confirmNo").onclick = null; resolve(v); };
      $("#confirmYes").onclick = () => done(true);
      $("#confirmNo").onclick = () => done(false);
    });
  }
  const openModal = (id) => { $(id).hidden = false; };
  const closeModals = () => $$(".modal").forEach((m) => { if (m.id !== "confirmModal") m.hidden = true; });

  /* ---------- TEMA & NAVIGASI ---------- */
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $("#themeToggle").checked = theme === "dark";
  }
  const savedTheme = store.get(KEYS.theme, null);
  applyTheme(savedTheme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  $("#themeToggle").addEventListener("change", (e) => {
    const t = e.target.checked ? "dark" : "light";
    applyTheme(t);
    store.set(KEYS.theme, t);
  });

  const TITLES = { catalog: "Katalog Mainan", pos: "Kasir / POS", stock: "Kelola Stok", report: "Laporan Penjualan" };
  function setView(view) {
    ui.view = view;
    $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
    $("#pageTitle").textContent = TITLES[view];
    $$("[data-show-on]").forEach((el) => { el.hidden = el.dataset.showOn !== view; });
    toggleSidebar(false);
    renderView();
    window.scrollTo({ top: 0 });
    history.replaceState(null, "", "#" + view);
  }
  function renderView() {
    ({ catalog: renderCatalog, pos: renderPOS, stock: renderStock, report: renderReport })[ui.view]();
  }
  function toggleSidebar(open) {
    $("#sidebar").classList.toggle("open", open);
    $("#sidebarBackdrop").classList.toggle("show", open);
  }
  $$(".nav-item").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  $("#menuBtn").addEventListener("click", () => toggleSidebar(true));
  $("#sidebarBackdrop").addEventListener("click", () => toggleSidebar(false));

  // Dropdown
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-dropdown]");
    $$(".dropdown.open").forEach((d) => { if (!trigger || d !== trigger.parentElement) d.classList.remove("open"); });
    if (trigger) trigger.parentElement.classList.toggle("open");
  });
  // Modal close
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-close-modal]") || (e.target.classList.contains("modal") && e.target.id !== "confirmModal")) closeModals();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeModals(); closeCart(); toggleSidebar(false); }
  });

  function updateLowBadge() {
    const low = products.filter((p) => p.stock <= LOW_STOCK).length;
    const b = $("#navLowBadge");
    b.hidden = low === 0;
    b.textContent = low;
    b.title = `${low} produk stok menipis`;
  }

  function stockBadge(p) {
    if (p.stock <= 0) return `<span class="badge badge-out">Habis</span>`;
    if (p.stock <= LOW_STOCK) return `<span class="badge badge-low">⚠️ Sisa ${p.stock}</span>`;
    return "";
  }

  /* =========================================================
     MODE KATALOG
     ========================================================= */
  function fillSelect(sel, options, allLabel) {
    const current = sel.value;
    sel.innerHTML = `<option value="all">${allLabel}</option>` + options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join("");
    sel.value = options.includes(current) ? current : "all";
  }

  function renderCatalog() {
    const cats = categories();
    fillSelect($("#catCategory"), cats, "Semua kategori");
    if (ui.catCategory !== "all" && !cats.includes(ui.catCategory)) ui.catCategory = "all";
    $("#catCategory").value = ui.catCategory;
    if (!$("#catAge").options.length) fillSelect($("#catAge"), AGES, "Semua usia");

    $("#catChips").innerHTML = ["all", ...cats].map((c) =>
      `<button class="chip ${ui.catCategory === c ? "active" : ""}" data-chip="${esc(c)}">${c === "all" ? "✨ Semua" : esc(c)}</button>`).join("");

    const q = $("#catSearch").value.trim().toLowerCase();
    const age = $("#catAge").value;
    const [min, max] = $("#catPrice").value === "all" ? [0, Infinity] : $("#catPrice").value.split("-").map(Number);
    const list = products.filter((p) =>
      (!q || p.name.toLowerCase().includes(q)) &&
      (ui.catCategory === "all" || p.category === ui.catCategory) &&
      (age === "all" || p.age === age) &&
      p.price >= min && p.price <= max);

    $("#catalogGrid").innerHTML = list.length ? list.map((p) => {
      const inCart = catalogCart.find((c) => c.id === p.id)?.qty || 0;
      const soldOut = p.stock <= 0;
      return `
        <article class="product">
          <div class="product-img">${imgTag(p.image, p.name)}${stockBadge(p)}<span class="age-tag">${esc(p.age)}</span></div>
          <div class="product-body">
            <span class="badge badge-cat" style="align-self:flex-start">${esc(p.category)}</span>
            <h4>${esc(p.name)}</h4>
            <p>${esc(p.desc || "")}</p>
            <div class="price">${fmtRp(p.price)}</div>
            <div class="product-foot">
              <span class="stock-txt">${soldOut ? "Stok habis" : `Stok: ${p.stock} pcs`}${inCart ? ` · 🛒 ${inCart}` : ""}</span>
              <button class="btn btn-red btn-sm" data-add-catalog="${p.id}" ${soldOut ? "disabled" : ""}>＋ Keranjang</button>
            </div>
          </div>
        </article>`;
    }).join("") : `<div class="empty"><span class="big">🔍</span>Mainan tidak ditemukan. Coba ubah kata kunci atau filter.</div>`;

    renderCatalogCart();
  }

  $("#catSearch").addEventListener("input", renderCatalog);
  ["#catAge", "#catPrice"].forEach((s) => $(s).addEventListener("change", renderCatalog));
  $("#catCategory").addEventListener("change", (e) => { ui.catCategory = e.target.value; renderCatalog(); });
  $("#catChips").addEventListener("click", (e) => {
    const c = e.target.closest("[data-chip]");
    if (c) { ui.catCategory = c.dataset.chip; renderCatalog(); }
  });
  $("#catReset").addEventListener("click", () => {
    $("#catSearch").value = ""; $("#catAge").value = "all"; $("#catPrice").value = "all"; ui.catCategory = "all";
    renderCatalog();
  });
  $("#catalogGrid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-add-catalog]");
    if (!b) return;
    const p = findProduct(b.dataset.addCatalog);
    const item = catalogCart.find((c) => c.id === p.id);
    if ((item?.qty || 0) + 1 > p.stock) return toast(`Stok ${p.name} hanya ${p.stock} pcs.`, "warn");
    item ? item.qty++ : catalogCart.push({ id: p.id, qty: 1 });
    saveCatalogCart();
    renderCatalog();
    toast(`${p.name} masuk keranjang 🛒`);
  });

  function cartLines(cart) {
    return cart.map((c) => ({ ...c, p: findProduct(c.id) })).filter((c) => c.p);
  }

  function cartRowHTML(c, scope) {
    const over = c.qty > c.p.stock;
    return `
      <div class="cart-row">
        ${imgTag(c.p.image, c.p.name)}
        <div class="cart-info">
          <b>${esc(c.p.name)}</b>
          <small>${fmtRp(c.p.price)} × ${c.qty} = <strong>${fmtRp(c.p.price * c.qty)}</strong></small>
          ${over ? `<small class="over" style="display:block">⚠️ Melebihi stok (tersedia ${c.p.stock})</small>` : ""}
        </div>
        <div class="qty">
          <button data-${scope}-dec="${c.id}" aria-label="Kurangi">−</button>
          <input type="number" min="1" value="${c.qty}" data-${scope}-qty="${c.id}" aria-label="Jumlah" />
          <button data-${scope}-inc="${c.id}" aria-label="Tambah">+</button>
        </div>
        <button class="remove-btn" data-${scope}-del="${c.id}" aria-label="Hapus">🗑️</button>
      </div>`;
  }

  function renderCatalogCart() {
    catalogCart = catalogCart.filter((c) => findProduct(c.id));
    const lines = cartLines(catalogCart);
    const count = lines.reduce((s, c) => s + c.qty, 0);
    $("#catalogCartCount").textContent = count;
    $("#catalogCartList").innerHTML = lines.length ? lines.map((c) => cartRowHTML(c, "cc")).join("")
      : `<div class="empty"><span class="big">🧺</span>Keranjang masih kosong.<br>Yuk pilih mainan favorit!</div>`;
    $("#catalogCartTotal").textContent = fmtRp(lines.reduce((s, c) => s + c.p.price * c.qty, 0));
    $("#waCheckoutBtn").disabled = !lines.length;
  }

  function cartHandler(cart, scope, save, rerender) {
    return (e) => {
      const t = e.target;
      const id = t.dataset[scope + "Inc"] || t.dataset[scope + "Dec"] || t.dataset[scope + "Del"];
      if (!id) return;
      const item = cart().find((c) => c.id === id);
      if (!item) return;
      const p = findProduct(id);
      if (t.dataset[scope + "Inc"]) {
        if (scope === "cc" && item.qty + 1 > p.stock) return toast(`Stok ${p.name} hanya ${p.stock} pcs.`, "warn");
        item.qty++;
        if (scope === "pc" && item.qty > p.stock) toast(`Jumlah ${p.name} melebihi stok (${p.stock} pcs)!`, "warn");
      } else if (t.dataset[scope + "Dec"]) {
        item.qty = Math.max(1, item.qty - 1);
      } else {
        const idx = cart().indexOf(item);
        cart().splice(idx, 1);
      }
      save(); rerender();
    };
  }
  function qtyInputHandler(cart, scope, save, rerender) {
    return (e) => {
      const id = e.target.dataset[scope + "Qty"];
      if (!id) return;
      const item = cart().find((c) => c.id === id);
      const p = findProduct(id);
      let q = Math.max(1, parseInt(e.target.value, 10) || 1);
      if (scope === "cc" && q > p.stock) { q = Math.max(1, p.stock); toast(`Stok ${p.name} hanya ${p.stock} pcs.`, "warn"); }
      if (scope === "pc" && q > p.stock) toast(`Jumlah ${p.name} melebihi stok (${p.stock} pcs)!`, "warn");
      item.qty = q;
      save(); rerender();
    };
  }
  $("#catalogCartList").addEventListener("click", cartHandler(() => catalogCart, "cc", saveCatalogCart, renderCatalog));
  $("#catalogCartList").addEventListener("change", qtyInputHandler(() => catalogCart, "cc", saveCatalogCart, renderCatalog));

  function openCart() { $("#cartDrawer").classList.add("open"); $("#cartBackdrop").classList.add("show"); }
  function closeCart() { $("#cartDrawer").classList.remove("open"); $("#cartBackdrop").classList.remove("show"); }
  $("#openCartBtn").addEventListener("click", openCart);
  $("#closeCartBtn").addEventListener("click", closeCart);
  $("#cartBackdrop").addEventListener("click", closeCart);

  $("#waCheckoutBtn").addEventListener("click", () => {
    const lines = cartLines(catalogCart);
    if (!lines.length) return;
    const bad = lines.find((c) => c.qty > c.p.stock);
    if (bad) return toast(`Stok ${bad.p.name} tidak mencukupi (tersisa ${bad.p.stock}).`, "error");
    const name = $("#custName").value.trim();
    const note = $("#custNote").value.trim();
    const total = lines.reduce((s, c) => s + c.p.price * c.qty, 0);
    const msg = [
      `Halo *${settings.storeName}*! 👋`,
      `Saya ingin memesan mainan berikut:`,
      ``,
      ...lines.map((c, i) => `${i + 1}. *${c.p.name}*\n    ${c.qty} x ${fmtRp(c.p.price)} = ${fmtRp(c.p.price * c.qty)}`),
      ``,
      `*Total: ${fmtRp(total)}*`,
      name ? `Nama pemesan: ${name}` : null,
      note ? `Catatan: ${note}` : null,
      ``,
      `Mohon info ketersediaan dan cara pembayarannya ya. Terima kasih! 🙏`,
    ].filter((l) => l !== null).join("\n");
    window.open(`https://wa.me/${settings.wa}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
    toast("Membuka WhatsApp... 💬");
  });

  /* =========================================================
     MODE KASIR / POS
     ========================================================= */
  function renderPOS() {
    const q = $("#posSearch").value.trim().toLowerCase();
    const list = products.filter((p) => !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    $("#posGrid").innerHTML = list.length ? list.map((p) => `
      <button class="pos-item" data-pos-add="${p.id}" ${p.stock <= 0 ? "disabled" : ""}>
        ${imgTag(p.image, p.name)}
        <div>
          <b>${esc(p.name)}</b>
          <span class="price">${fmtRp(p.price)}</span>
          <small>${p.stock <= 0 ? "Stok habis" : `Stok ${p.stock}`}${p.stock > 0 && p.stock <= LOW_STOCK ? " ⚠️" : ""}</small>
        </div>
      </button>`).join("") : `<div class="empty"><span class="big">🔍</span>Tidak ada mainan cocok.</div>`;
    renderPosCart();
  }

  const posTotal = () => cartLines(posCart).reduce((s, c) => s + c.p.price * c.qty, 0);

  function renderPosCart() {
    posCart = posCart.filter((c) => findProduct(c.id));
    const lines = cartLines(posCart);
    $("#posCartList").innerHTML = lines.length ? lines.map((c) => cartRowHTML(c, "pc")).join("")
      : `<div class="empty"><span class="big">🧾</span>Belum ada barang. Klik mainan di kiri untuk menambah.</div>`;
    const total = posTotal();
    $("#posItemCount").textContent = fmtNum(lines.reduce((s, c) => s + c.qty, 0));
    $("#posTotal").textContent = fmtRp(total);

    const over = lines.filter((c) => c.qty > c.p.stock);
    const warn = $("#posStockWarn");
    warn.hidden = !over.length;
    warn.innerHTML = over.length ? "⚠️ Jumlah melebihi stok tersedia: " + over.map((c) => `<b>${esc(c.p.name)}</b> (stok ${c.p.stock}, diminta ${c.qty})`).join(", ") : "";

    // Tombol uang cepat
    const suggestions = [...new Set([total, ...[10000, 20000, 50000, 100000].map((d) => Math.ceil(total / d) * d)])]
      .filter((v) => v >= total && v > 0).sort((a, b) => a - b).slice(0, 5);
    $("#quickCash").innerHTML = suggestions.map((v) => `<button type="button" data-cash="${v}">${v === total ? "Uang pas" : fmtRp(v)}</button>`).join("");
    updateChange();
    $("#posProcess").disabled = !lines.length;
  }

  function updateChange() {
    const total = posTotal();
    const paid = parseMoney($("#cashInput").value);
    const box = $("#changeBox");
    const diff = paid - total;
    box.classList.toggle("ok", paid > 0 && diff >= 0);
    box.classList.toggle("bad", paid > 0 && diff < 0);
    box.innerHTML = paid === 0 ? "Kembalian: <b>Rp0</b>" : diff >= 0 ? `Kembalian: <b>${fmtRp(diff)}</b>` : `Uang kurang: <b>${fmtRp(-diff)}</b>`;
  }

  $("#posSearch").addEventListener("input", renderPOS);
  $("#posSearch").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const first = $("#posGrid [data-pos-add]:not(:disabled)"); if (first) first.click(); }
  });
  $("#posGrid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pos-add]");
    if (!b) return;
    const p = findProduct(b.dataset.posAdd);
    const item = posCart.find((c) => c.id === p.id);
    const next = (item?.qty || 0) + 1;
    if (next > p.stock) toast(`Peringatan: ${p.name} melebihi stok (tersedia ${p.stock} pcs)!`, "warn");
    item ? item.qty++ : posCart.push({ id: p.id, qty: 1 });
    savePosCart();
    renderPosCart();
  });
  $("#posCartList").addEventListener("click", cartHandler(() => posCart, "pc", savePosCart, renderPosCart));
  $("#posCartList").addEventListener("change", qtyInputHandler(() => posCart, "pc", savePosCart, renderPosCart));
  $("#posClear").addEventListener("click", async () => {
    if (!posCart.length) return;
    if (await confirmDialog("Kosongkan keranjang?", "Semua barang di keranjang kasir akan dihapus.")) {
      posCart = []; savePosCart(); renderPosCart();
    }
  });

  $$(".pay-btn").forEach((b) => b.addEventListener("click", () => {
    ui.payMethod = b.dataset.method;
    $$(".pay-btn").forEach((x) => x.classList.toggle("active", x === b));
    $("#payTunai").hidden = ui.payMethod !== "Tunai";
    $("#payTransfer").hidden = ui.payMethod !== "Transfer Bank";
    $("#payQris").hidden = ui.payMethod !== "QRIS";
  }));
  $("#cashInput").addEventListener("input", (e) => {
    const n = parseMoney(e.target.value);
    e.target.value = n ? fmtNum(n) : "";
    updateChange();
  });
  $("#quickCash").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cash]");
    if (b) { $("#cashInput").value = fmtNum(b.dataset.cash); updateChange(); }
  });

  // Pola QRIS dekoratif (bukan kode pembayaran asli)
  (function drawQris() {
    let seed = 7;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const finder = (r, c) => [[0, 0], [0, 9], [9, 0]].some(([fr, fc]) => r >= fr && r < fr + 4 && c >= fc && c < fc + 4);
    const finderOn = (r, c) => {
      for (const [fr, fc] of [[0, 0], [0, 9], [9, 0]]) {
        if (r >= fr && r < fr + 4 && c >= fc && c < fc + 4) {
          const rr = r - fr, cc = c - fc;
          return rr === 0 || rr === 3 || cc === 0 || cc === 3 || (rr === 1 && cc === 1) || (rr === 2 && cc === 2) || (rr === 1 && cc === 2) || (rr === 2 && cc === 1);
        }
      }
    };
    let html = "";
    for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) {
      const on = finder(r, c) ? finderOn(r, c) : rnd() > 0.5;
      html += `<i class="${on ? "" : "w"}"></i>`;
    }
    $("#qrisCode").innerHTML = html;
  })();

  $("#posProcess").addEventListener("click", async () => {
    const lines = cartLines(posCart);
    if (!lines.length) return toast("Keranjang kasir masih kosong.", "warn");
    const over = lines.filter((c) => c.qty > c.p.stock);
    if (over.length) return toast(`Transaksi ditolak: ${over.map((c) => c.p.name).join(", ")} melebihi stok tersedia.`, "error");
    const total = posTotal();
    let paid = total, change = 0;
    if (ui.payMethod === "Tunai") {
      paid = parseMoney($("#cashInput").value);
      if (paid < total) return toast(`Uang diterima kurang ${fmtRp(total - paid)}.`, "error");
      change = paid - total;
    }
    const ok = await confirmDialog("Proses transaksi?", `Total ${fmtRp(total)} dibayar via ${ui.payMethod}. Stok akan otomatis berkurang.`);
    if (!ok) return;

    const now = new Date();
    const tx = {
      id: `INV-${dateKey(now).replace(/-/g, "")}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
      date: now.toISOString(),
      items: lines.map((c) => ({ id: c.id, name: c.p.name, price: c.p.price, qty: c.qty })),
      total, method: ui.payMethod, paid, change,
    };
    // Hindari nomor nota ganda di detik yang sama
    if (transactions.some((t) => t.id === tx.id)) tx.id += "-" + Math.random().toString(36).slice(2, 4).toUpperCase();

    lines.forEach((c) => { c.p.stock -= c.qty; });
    transactions.push(tx);
    saveProducts(); saveTx();
    posCart = []; savePosCart();
    $("#cashInput").value = "";
    renderPOS(); updateLowBadge();

    const lowNow = lines.filter((c) => c.p.stock <= LOW_STOCK);
    if (lowNow.length) toast(`Stok menipis: ${lowNow.map((c) => `${c.p.name} (${c.p.stock})`).join(", ")}`, "warn");
    showReceipt(tx);
  });

  function showReceipt(tx) {
    ui.lastTx = tx;
    $("#receiptPreview").innerHTML = `
      <div class="r-center r-title">${esc(settings.storeName.toUpperCase())}</div>
      <div class="r-center">${esc(settings.address)}</div>
      <div class="r-center">WA: ${esc(settings.wa)}</div>
      <hr>
      <div class="r-row"><span>No</span><span>${esc(tx.id)}</span></div>
      <div class="r-row"><span>Tanggal</span><span>${fmtDateTime(tx.date)}</span></div>
      <hr>
      ${tx.items.map((i) => `<div>${esc(i.name)}</div><div class="r-row"><span>${i.qty} x ${fmtRp(i.price)}</span><span>${fmtRp(i.qty * i.price)}</span></div>`).join("")}
      <hr>
      <div class="r-row"><b>TOTAL</b><b>${fmtRp(tx.total)}</b></div>
      <div class="r-row"><span>Bayar (${esc(tx.method)})</span><span>${fmtRp(tx.paid)}</span></div>
      ${tx.method === "Tunai" ? `<div class="r-row"><span>Kembali</span><span>${fmtRp(tx.change)}</span></div>` : ""}
      <hr>
      <div class="r-center">Terima kasih telah berbelanja! 🧸</div>`;
    openModal("#receiptModal");
  }

  async function generateReceiptPDF(tx) {
    if (!window.jspdf) return toast("Pustaka PDF gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.", "error");
    loading(true, "Membuat struk PDF...");
    try {
      await sleep(350); // beri waktu indikator loading tampil
      const { jsPDF } = window.jspdf;
      const W = 80, M = 5, lh = 4.4;
      const height = 78 + tx.items.length * lh * 2 + (tx.method === "Tunai" ? lh : 0);
      const doc = new jsPDF({ unit: "mm", format: [W, Math.max(height, 110)] });
      let y = 9;
      const center = (t, size = 8, bold = false) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.text(t, W / 2, y, { align: "center" }); y += lh; };
      const row = (l, r, bold = false) => {
        doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(bold ? 9 : 8);
        doc.text(l, M, y); doc.text(r, W - M, y, { align: "right" }); y += lh;
      };
      const line = () => { doc.setLineDashPattern([1, 1], 0); doc.line(M, y - 2, W - M, y - 2); y += 2; };

      doc.setFillColor(220, 38, 38); doc.rect(0, 0, W, 3, "F");
      center(settings.storeName.toUpperCase(), 13, true); y += 1;
      doc.splitTextToSize(settings.address, W - 2 * M).forEach((t) => center(t));
      center("WA: " + settings.wa);
      line();
      row("No. Nota", tx.id);
      row("Tanggal", fmtDateTime(tx.date));
      row("Kasir", "Kasir Indu Toys");
      line();
      tx.items.forEach((i) => {
        doc.setFont("helvetica", "normal"); doc.setFontSize(8);
        const name = doc.splitTextToSize(i.name, W - 2 * M)[0];
        doc.text(name, M, y); y += lh;
        row(`  ${i.qty} x ${fmtRp(i.price)}`, fmtRp(i.qty * i.price));
      });
      line();
      row("TOTAL", fmtRp(tx.total), true);
      row(`Bayar (${tx.method})`, fmtRp(tx.paid));
      if (tx.method === "Tunai") row("Kembalian", fmtRp(tx.change));
      line();
      center("Terima kasih telah berbelanja!", 8, true);
      center("Barang yang sudah dibeli tidak dapat", 7);
      center("ditukar/dikembalikan tanpa nota ini.", 7);
      doc.setFillColor(250, 204, 21); doc.rect(0, doc.internal.pageSize.getHeight() - 3, W, 3, "F");

      doc.save(`Struk-${tx.id}.pdf`);
      toast("Struk PDF berhasil diunduh 📄 Kirim manual ke WhatsApp pelanggan.");
    } catch (err) {
      console.error(err);
      toast("Gagal membuat PDF: " + err.message, "error");
    } finally {
      loading(false);
    }
  }
  $("#printReceiptBtn").addEventListener("click", () => ui.lastTx && generateReceiptPDF(ui.lastTx));

  /* =========================================================
     MODE KELOLA STOK
     ========================================================= */
  function renderStock() {
    const q = $("#stockSearch").value.trim().toLowerCase();
    const lowOnly = $("#stockLowOnly").checked;
    const list = products
      .filter((p) => (!q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)) && (!lowOnly || p.stock <= LOW_STOCK))
      .sort((a, b) => (a.stock <= LOW_STOCK) === (b.stock <= LOW_STOCK) ? a.name.localeCompare(b.name) : a.stock <= LOW_STOCK ? -1 : 1);

    $("#stockTable tbody").innerHTML = list.length ? list.map((p) => `
      <tr class="${p.stock <= LOW_STOCK ? "low" : ""}">
        <td><div class="prod-cell">${imgTag(p.image, p.name)}<div><b>${esc(p.name)}</b><div class="muted">${esc(p.id)}</div></div></div></td>
        <td>${esc(p.category)}</td>
        <td>${esc(p.age)}</td>
        <td class="num">${fmtRp(p.price)}</td>
        <td class="num">
          <div class="stock-adj">
            <button data-stock-dec="${p.id}" aria-label="Kurangi stok">−</button>
            <b>${p.stock}</b>
            <button data-stock-inc="${p.id}" aria-label="Tambah stok">+</button>
          </div>
          <div>${p.stock <= 0 ? '<span class="badge badge-out">Habis</span>' : p.stock <= LOW_STOCK ? '<span class="badge badge-low">⚠️ Menipis</span>' : '<span class="badge badge-ok">Aman</span>'}</div>
        </td>
        <td class="center">
          <button class="btn btn-ghost btn-sm" data-edit="${p.id}">✏️ Edit</button>
          <button class="btn btn-ghost btn-sm danger-text" data-del="${p.id}">🗑️</button>
        </td>
      </tr>`).join("") : `<tr><td colspan="6"><div class="empty"><span class="big">📦</span>Tidak ada produk.</div></td></tr>`;

    const low = products.filter((p) => p.stock <= LOW_STOCK);
    const banner = $("#lowStockBanner");
    banner.hidden = !low.length;
    banner.innerHTML = `⚠️ <b>${low.length} mainan</b> stoknya menipis (≤ ${LOW_STOCK} pcs): ` + low.map((p) => `${esc(p.name)} (${p.stock})`).join(", ");

    $("#categoryList").innerHTML = categories().map((c) => `<option value="${esc(c)}">`).join("");
    updateLowBadge();
  }

  $("#stockSearch").addEventListener("input", renderStock);
  $("#stockLowOnly").addEventListener("change", renderStock);
  $("#stockTable").addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    const { stockInc, stockDec, edit, del } = t.dataset;
    if (stockInc || stockDec) {
      const p = findProduct(stockInc || stockDec);
      p.stock = Math.max(0, p.stock + (stockInc ? 1 : -1));
      saveProducts(); renderStock();
    } else if (edit) {
      openProductForm(findProduct(edit));
    } else if (del) {
      const p = findProduct(del);
      if (await confirmDialog("Hapus mainan?", `"${p.name}" akan dihapus dari daftar produk. Riwayat penjualan tetap tersimpan.`)) {
        products = products.filter((x) => x.id !== del);
        saveProducts(); renderStock();
        toast(`${p.name} dihapus.`);
      }
    }
  });

  // Form produk
  fillSelect($("#pAge"), AGES, "Pilih usia");
  $("#pAge").options[0].value = "";
  function openProductForm(p) {
    $("#productModalTitle").textContent = p ? "Edit Mainan" : "Tambah Mainan";
    $("#pId").value = p?.id || "";
    $("#pName").value = p?.name || "";
    $("#pCategory").value = p?.category || "";
    $("#pAge").value = p?.age || "";
    $("#pPrice").value = p?.price ?? "";
    $("#pStock").value = p?.stock ?? "";
    $("#pImage").value = p?.image?.startsWith("data:") ? "" : (p?.image || "");
    $("#pImage").dataset.upload = p?.image?.startsWith("data:") ? p.image : "";
    $("#pDesc").value = p?.desc || "";
    $("#pImageFile").value = "";
    $("#pPreview").src = p?.image || "";
    openModal("#productModal");
    setTimeout(() => $("#pName").focus(), 50);
  }
  $("#addProductBtn").addEventListener("click", () => openProductForm(null));
  $("#pImage").addEventListener("input", (e) => { e.target.dataset.upload = ""; $("#pPreview").src = e.target.value; });
  $("#pPreview").addEventListener("error", (e) => { if (e.target.getAttribute("src")) e.target.src = PLACEHOLDER_IMG; });
  $("#pImageFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Perkecil gambar agar tidak memenuhi LocalStorage
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 480 / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = img.width * scale; cv.height = img.height * scale;
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        const data = cv.toDataURL("image/jpeg", 0.75);
        $("#pImage").value = "";
        $("#pImage").dataset.upload = data;
        $("#pPreview").src = data;
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
  $("#productForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = $("#pId").value;
    const data = {
      name: $("#pName").value.trim(),
      category: $("#pCategory").value.trim(),
      age: $("#pAge").value,
      price: Math.max(0, Number($("#pPrice").value) || 0),
      stock: Math.max(0, parseInt($("#pStock").value, 10) || 0),
      image: $("#pImage").dataset.upload || $("#pImage").value.trim(),
      desc: $("#pDesc").value.trim(),
    };
    if (!data.name || !data.category || !data.age) return toast("Lengkapi nama, kategori, dan usia.", "error");
    const dup = products.find((p) => p.name.toLowerCase() === data.name.toLowerCase() && p.id !== id);
    if (dup) return toast("Nama mainan sudah ada. Gunakan nama lain.", "error");
    if (id) Object.assign(findProduct(id), data);
    else products.push({ id: uid("P"), ...data });
    saveProducts();
    closeModals();
    renderStock();
    toast(id ? "Data mainan diperbarui ✏️" : "Mainan baru ditambahkan 🎉");
  });

  /* ---------- IMPOR / EKSPOR ---------- */
  const PRODUCT_COLS = { ID: "id", Nama: "name", Kategori: "category", Usia: "age", Harga: "price", Stok: "stock", Gambar: "image", Deskripsi: "desc" };
  const HEADER_ALIASES = {
    id: "id", kode: "id",
    nama: "name", name: "name", "nama mainan": "name", produk: "name",
    kategori: "category", category: "category",
    usia: "age", umur: "age", age: "age",
    harga: "price", price: "price",
    stok: "stock", stock: "stock", jumlah: "stock",
    gambar: "image", image: "image", "url gambar": "image", foto: "image",
    deskripsi: "desc", description: "desc", keterangan: "desc",
  };

  function requireXLSX() {
    if (!window.XLSX) { toast("Pustaka Excel gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.", "error"); return false; }
    return true;
  }

  function downloadSheet(rows, filename, type, sheetName) {
    const ws = XLSX.utils.json_to_sheet(rows);
    if (rows.length) ws["!cols"] = Object.keys(rows[0]).map((k) => ({ wch: Math.min(48, Math.max(k.length, ...rows.map((r) => String(r[k] ?? "").length)) + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${filename}.${type}`, { bookType: type });
  }

  $$("[data-export-products]").forEach((b) => b.addEventListener("click", () => {
    if (!requireXLSX()) return;
    const rows = products.map((p) => Object.fromEntries(Object.entries(PRODUCT_COLS).map(([label, key]) => [label, key === "image" && p.image?.startsWith("data:") ? "" : p[key]])));
    downloadSheet(rows, `Produk-InduToys-${dateKey(new Date())}`, b.dataset.exportProducts, "Produk");
    toast(`Data ${products.length} produk diekspor ⬇️`);
  }));
  $("#templateBtn").addEventListener("click", () => {
    if (!requireXLSX()) return;
    downloadSheet([{ Nama: "Contoh Mobil Mainan", Kategori: "Kendaraan", Usia: "3-5 tahun", Harga: 50000, Stok: 10, Gambar: "https://...", Deskripsi: "Deskripsi singkat" }], "Template-Impor-InduToys", "csv", "Produk");
  });

  function normalizeAge(v) {
    const s = String(v || "").trim();
    const hit = AGES.find((a) => a.toLowerCase() === s.toLowerCase());
    if (hit) return hit;
    const n = parseInt(s, 10);
    if (isNaN(n)) return AGES[1];
    return n <= 2 ? AGES[0] : n <= 5 ? AGES[1] : n <= 8 ? AGES[2] : AGES[3];
  }

  $("#importFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file || !requireXLSX()) return;
    loading(true, `Mengimpor ${file.name}...`);
    try {
      const buf = await file.arrayBuffer();
      await sleep(300);
      const wb = XLSX.read(buf, { type: "array" });
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      if (!raw.length) throw new Error("File kosong atau tidak memiliki baris data.");
      let added = 0, updated = 0, skipped = 0;
      raw.forEach((r) => {
        const row = {};
        Object.entries(r).forEach(([k, v]) => { const key = HEADER_ALIASES[k.trim().toLowerCase()]; if (key) row[key] = v; });
        const name = String(row.name || "").trim();
        if (!name) { skipped++; return; }
        const data = {
          name,
          category: String(row.category || "Lainnya").trim(),
          age: normalizeAge(row.age),
          price: parseMoney(row.price),
          stock: Math.max(0, parseInt(row.stock, 10) || 0),
          image: String(row.image || "").trim().replace(/^https:\/\/\.\.\.$/, ""),
          desc: String(row.desc || "").trim(),
        };
        const existing = (row.id && findProduct(String(row.id))) || products.find((p) => p.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          Object.assign(existing, data, { image: data.image || existing.image, desc: data.desc || existing.desc });
          updated++;
        } else {
          products.push({ id: uid("P"), ...data });
          added++;
        }
      });
      if (!added && !updated) throw new Error("Tidak ada baris valid. Pastikan ada kolom 'Nama'.");
      saveProducts();
      renderStock();
      toast(`Impor selesai: ${added} baru, ${updated} diperbarui${skipped ? `, ${skipped} dilewati` : ""} ✅`);
    } catch (err) {
      console.error(err);
      toast("Gagal impor: " + err.message, "error");
    } finally {
      loading(false);
    }
  });

  /* ---------- PENGATURAN ---------- */
  function fillSettings() {
    $("#setStoreName").value = settings.storeName;
    $("#setWa").value = settings.wa;
    $("#setAddress").value = settings.address;
    $("#setBank").value = settings.bank;
    $("#bankText").textContent = settings.bank;
  }
  $("#settingsForm").addEventListener("submit", (e) => {
    e.preventDefault();
    settings = {
      storeName: $("#setStoreName").value.trim() || DEFAULT_SETTINGS.storeName,
      wa: $("#setWa").value.replace(/\D/g, ""),
      address: $("#setAddress").value.trim(),
      bank: $("#setBank").value.trim(),
    };
    store.set(KEYS.settings, settings);
    fillSettings();
    toast("Pengaturan toko disimpan 💾");
  });
  $("#resetDataBtn").addEventListener("click", async () => {
    if (!(await confirmDialog("Reset semua data?", "Produk, transaksi, keranjang, dan pengaturan akan dikembalikan ke data awal. Tindakan ini tidak bisa dibatalkan."))) return;
    Object.values(KEYS).forEach((k) => { try { localStorage.removeItem(k); } catch {} });
    location.reload();
  });

  /* =========================================================
     LAPORAN PENJUALAN
     ========================================================= */
  function periodRange() {
    const now = new Date();
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    switch (ui.reportPeriod) {
      case "today": return [start, end];
      case "7d": start.setDate(start.getDate() - 6); return [start, end];
      case "month": start.setDate(1); return [start, end];
      case "custom": {
        const f = $("#rangeFrom").value, t = $("#rangeTo").value;
        const from = f ? new Date(f + "T00:00:00") : new Date(0);
        const to = t ? new Date(t + "T23:59:59.999") : end;
        return [from, to];
      }
      default: return [new Date(0), end];
    }
  }
  const txInPeriod = () => {
    const [from, to] = periodRange();
    return transactions.filter((t) => { const d = new Date(t.date); return d >= from && d <= to; });
  };

  function renderReport() {
    const list = txInPeriod().sort((a, b) => b.date.localeCompare(a.date));
    const revenue = list.reduce((s, t) => s + t.total, 0);
    const items = list.reduce((s, t) => s + t.items.reduce((x, i) => x + i.qty, 0), 0);
    $("#kpiRevenue").textContent = fmtRp(revenue);
    $("#kpiTx").textContent = fmtNum(list.length);
    $("#kpiItems").textContent = fmtNum(items);
    $("#kpiAvg").textContent = fmtRp(list.length ? revenue / list.length : 0);

    renderRecapChart(list);

    // Terlaris
    const agg = {};
    list.forEach((t) => t.items.forEach((i) => { agg[i.name] = (agg[i.name] || 0) + i.qty; }));
    const top = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 5);
    $("#topProducts").innerHTML = top.length ? top.map(([n, q]) => `<li><span>${esc(n)}</span><b>${fmtNum(q)} pcs</b></li>`).join("")
      : `<div class="empty">Belum ada penjualan pada periode ini.</div>`;

    // Metode pembayaran
    const methods = ["Tunai", "Transfer Bank", "QRIS"].map((m) => {
      const txs = list.filter((t) => t.method === m);
      return { m, n: txs.length, sum: txs.reduce((s, t) => s + t.total, 0) };
    });
    $("#methodBreakdown").innerHTML = methods.map((x) => `
      <div class="method-row">
        <div><span>${x.m} · ${x.n} trx</span><b>${fmtRp(x.sum)}</b></div>
        <div class="meter"><i style="width:${revenue ? (x.sum / revenue) * 100 : 0}%"></i></div>
      </div>`).join("");

    // Riwayat
    $("#txTable tbody").innerHTML = list.length ? list.map((t) => `
      <tr>
        <td><b>${esc(t.id)}</b></td>
        <td>${fmtDateTime(t.date)}</td>
        <td>${t.items.map((i) => `${esc(i.name)} ×${i.qty}`).join("<br>")}</td>
        <td>${esc(t.method)}</td>
        <td class="num"><b>${fmtRp(t.total)}</b></td>
        <td class="center"><button class="btn btn-ghost btn-sm" data-reprint="${esc(t.id)}">📄 PDF</button></td>
      </tr>`).join("") : `<tr><td colspan="6"><div class="empty"><span class="big">🧾</span>Belum ada transaksi pada periode ini.</div></td></tr>`;
  }

  function renderRecapChart(list) {
    const buckets = new Map();
    const now = new Date();
    if (ui.recapMode === "daily") {
      // Hari-hari dalam periode, maks. 31 batang; "Hari ini" menampilkan 7 hari terakhir sebagai pembanding
      let [from, to] = periodRange();
      if (ui.reportPeriod === "today") { from = new Date(to); from.setDate(from.getDate() - 6); }
      if (ui.reportPeriod === "all") from = list.length ? new Date(list[list.length - 1].date) : to;
      const end = new Date(Math.min(+to, +now));
      const limit = new Date(end); limit.setDate(limit.getDate() - 30);
      const start = new Date(Math.max(+from, +limit)); start.setHours(0, 0, 0, 0);
      for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) buckets.set(dateKey(d), 0);
      transactions.forEach((t) => { const k = dateKey(new Date(t.date)); if (buckets.has(k)) buckets.set(k, buckets.get(k) + t.total); });
    } else {
      // 12 bulan terakhir (semua transaksi)
      for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); buckets.set(monthKey(d), 0); }
      transactions.forEach((t) => { const k = monthKey(new Date(t.date)); if (buckets.has(k)) buckets.set(k, buckets.get(k) + t.total); });
    }
    const entries = [...buckets.entries()];
    const max = Math.max(1, ...entries.map((e) => e[1]));
    const short = (v) => v >= 1e6 ? (v / 1e6).toFixed(1).replace(".0", "") + "jt" : v >= 1e3 ? Math.round(v / 1e3) + "rb" : v ? String(v) : "";
    const label = (k) => {
      if (ui.recapMode === "monthly") { const [y, m] = k.split("-"); return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "short", year: "2-digit" }); }
      const [y, m, d] = k.split("-"); return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
    };
    $("#recapChart").innerHTML = entries.map(([k, v]) => `
      <div class="bar-col">
        <span class="bar-val">${short(v)}</span>
        <div class="bar" style="height:${(v / max) * 100}%" data-tip="${label(k)}: ${fmtRp(v)}"></div>
        <span class="bar-lbl">${label(k)}</span>
      </div>`).join("");
  }

  $("#reportPeriod").addEventListener("click", (e) => {
    const b = e.target.closest("[data-period]");
    if (!b) return;
    ui.reportPeriod = b.dataset.period;
    $$("#reportPeriod button").forEach((x) => x.classList.toggle("active", x === b));
    $("#customRange").hidden = ui.reportPeriod !== "custom";
    if (ui.reportPeriod === "custom" && !$("#rangeFrom").value) {
      const d = new Date(); $("#rangeTo").value = dateKey(d); d.setDate(1); $("#rangeFrom").value = dateKey(d);
    }
    renderReport();
  });
  ["#rangeFrom", "#rangeTo"].forEach((s) => $(s).addEventListener("change", renderReport));
  $("#recapMode").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]");
    if (!b) return;
    ui.recapMode = b.dataset.mode;
    $$("#recapMode button").forEach((x) => x.classList.toggle("active", x === b));
    renderReport();
  });
  $("#txTable").addEventListener("click", (e) => {
    const b = e.target.closest("[data-reprint]");
    if (b) generateReceiptPDF(transactions.find((t) => t.id === b.dataset.reprint));
  });

  $$("[data-export-sales]").forEach((b) => b.addEventListener("click", () => {
    if (!requireXLSX()) return;
    const list = txInPeriod().sort((a, b) => a.date.localeCompare(b.date));
    if (!list.length) return toast("Tidak ada transaksi pada periode ini untuk diekspor.", "warn");
    const rows = [];
    list.forEach((t) => t.items.forEach((i) => rows.push({
      "No. Nota": t.id,
      Tanggal: dateKey(new Date(t.date)),
      Jam: new Date(t.date).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
      Produk: i.name,
      Qty: i.qty,
      "Harga Satuan": i.price,
      Subtotal: i.qty * i.price,
      "Total Nota": t.total,
      "Metode Bayar": t.method,
    })));
    downloadSheet(rows, `Penjualan-InduToys-${dateKey(new Date())}`, b.dataset.exportSales, "Penjualan");
    toast(`${list.length} transaksi diekspor ⬇️`);
  }));

  /* ---------- SINKRON ANTAR TAB ---------- */
  window.addEventListener("storage", (e) => {
    if (!Object.values(KEYS).includes(e.key)) return;
    products = store.get(KEYS.products, products);
    transactions = store.get(KEYS.transactions, transactions);
    catalogCart = store.get(KEYS.catalogCart, catalogCart);
    posCart = store.get(KEYS.posCart, posCart);
    settings = { ...DEFAULT_SETTINGS, ...store.get(KEYS.settings, {}) };
    fillSettings(); updateLowBadge(); renderView();
  });

  /* ---------- INIT ---------- */
  $("#year").textContent = new Date().getFullYear();
  fillSettings();
  updateLowBadge();
  const startView = location.hash.slice(1);
  setView(TITLES[startView] ? startView : "catalog");
})();
