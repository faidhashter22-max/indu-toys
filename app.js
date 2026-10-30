/* =========================================================
   Indu Toys — Katalog, Kasir POS, Kelola Stok & Laporan
   Data produk, transaksi, pengaturan & staf disimpan di Supabase.
   Keranjang dan tema disimpan di LocalStorage perangkat.
   ========================================================= */
(async () => {
  "use strict";

  /* ---------- KONSTANTA ---------- */
  const KEYS = {
    catalogCart: "indutoys.catalogCart",
    posCart: "indutoys.posCart",
    theme: "indutoys.theme",
    favorites: "indutoys.favorites",
  };
  const LOW_STOCK = 5;
  const AGES = ["0-2 tahun", "3-5 tahun", "6-8 tahun", "9+ tahun"];
  const ROLES = { pending: "Menunggu", kasir: "Kasir", admin: "Admin" };
  const IMAGE_BUCKET = "product-images";
  const DEFAULT_SETTINGS = {
    storeName: "Indu Toys",
    wa: "6281234567890",
    address: "Jl. Ceria No. 1, Indonesia",
    bank: "BCA 1234567890 a.n. Indu Toys",
  };

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
      try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* penyimpanan lokal tidak tersedia */ }
    },
  };

  /* ---------- TOAST / LOADING / CONFIRM ---------- */
  function toast(msg, type = "success") {
    const el = document.createElement("div");
    el.className = "toast " + type;
    el.textContent = msg;
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), type === "error" ? 6000 : 3500);
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
  const anyModalOpen = () => $$(".modal").some((m) => !m.hidden);
  const errMsg = (e) => {
    const m = e?.message || String(e);
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Tidak bisa terhubung ke server. Periksa koneksi internet.";
    if (/row-level security|permission denied|42501/i.test(m)) return "Akses ditolak. Akun kamu tidak punya izin untuk tindakan ini.";
    if (/duplicate key.*products_name_key/i.test(m)) return "Nama mainan sudah ada. Gunakan nama lain.";
    return m;
  };

  /* ---------- KONEKSI SUPABASE ---------- */
  const CFG = window.INDU_CONFIG || {};
  if (!window.supabase || !CFG.supabaseUrl || !CFG.supabaseKey) {
    document.querySelector(".main").innerHTML = `
      <div class="card locked-card">
        <span class="big">⚙️</span>
        <h2>Koneksi database belum siap</h2>
        <p>${!window.supabase
          ? "Pustaka Supabase gagal dimuat. Periksa koneksi internet lalu muat ulang halaman."
          : "Isi <b>supabaseUrl</b> dan <b>supabaseKey</b> di file <code>config.js</code> dengan data dari Supabase Dashboard → Project Settings → API Keys."}</p>
      </div>`;
    return;
  }
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);

  /* ---------- STATE ---------- */
  let products = [];
  let transactions = [];
  let catalogCart = store.get(KEYS.catalogCart, []);
  let posCart = store.get(KEYS.posCart, []);
  let settings = { ...DEFAULT_SETTINGS };
  let session = null;
  let profile = null;

  const ui = {
    view: "catalog",
    catCategory: "all",
    catTab: "all",
    payMethod: "Tunai",
    reportPeriod: "today",
    recapMode: "daily",
    lastTx: null,
    reportToken: 0,
  };

  const saveCatalogCart = () => store.set(KEYS.catalogCart, catalogCart);
  const savePosCart = () => store.set(KEYS.posCart, posCart);
  const findProduct = (id) => products.find((p) => p.id === id);
  const categories = () => [...new Set(products.map((p) => p.category).filter(Boolean))].sort();

  const role = () => profile?.role || null;
  const isStaff = () => role() === "kasir" || role() === "admin";
  const isAdmin = () => role() === "admin";
  const ACCESS = { catalog: () => true, pos: isStaff, stock: isAdmin, report: isAdmin };

  // Dua link: "/" untuk pembeli (katalog saja), "/staff" (atau ?staff) untuk kasir & admin
  const MODE = /^\/(staff|kasir|admin)\/?$/i.test(location.pathname) || new URLSearchParams(location.search).has("staff") ? "staff" : "shop";
  const MODE_VIEWS = { shop: ["catalog"], staff: ["pos", "stock", "report"] };
  document.body.dataset.mode = MODE;
  if (MODE === "staff") {
    document.title = "Indu Toys — Panel Staf";
    $("#brandTagline").textContent = "Panel Staf & Kasir";
    // Jangan sempat menampilkan katalog selama data dimuat
    $("#pageTitle").textContent = "Panel Staf";
    $("#openCartBtn").hidden = true;
    $$(".view").forEach((v) => v.classList.remove("active"));
    $$(".nav-item").forEach((b) => b.classList.remove("active"));
  }

  /* ---------- DATA LAYER ---------- */
  const fromDbProduct = (r) => ({
    id: r.id, name: r.name, category: r.category, age: r.age,
    price: Number(r.price) || 0, stock: Number(r.stock) || 0, image: r.image || "", desc: r.description || "",
  });
  const toDbProduct = (p) => ({
    name: p.name, category: p.category, age: p.age, price: p.price, stock: p.stock,
    image: p.image || null, description: p.desc || null, updated_at: new Date().toISOString(),
  });
  const fromDbTx = (r) => ({
    id: r.id, date: r.created_at, items: r.items || [], total: r.total, method: r.method,
    paid: r.paid, change: r.change_amount, cashier: r.cashier_name || "",
  });

  async function loadProducts() {
    const { data, error } = await sb.from("products").select("*").order("name");
    if (error) throw error;
    products = data.map(fromDbProduct);
  }
  async function loadSettings() {
    const { data, error } = await sb.from("settings").select("*").eq("id", 1).maybeSingle();
    if (error) throw error;
    if (data) settings = { storeName: data.store_name, wa: data.wa, address: data.address || "", bank: data.bank || "" };
  }
  async function loadProfile() {
    profile = null;
    if (!session) return;
    const { data, error } = await sb.from("profiles").select("*").eq("user_id", session.user.id).maybeSingle();
    if (error) console.error(error);
    profile = data || { user_id: session.user.id, email: session.user.email, role: "pending" };
  }
  async function loadTransactions(since) {
    const all = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      let q = sb.from("transactions").select("*").order("created_at", { ascending: false }).range(from, from + PAGE - 1);
      if (since) q = q.gte("created_at", since.toISOString());
      const { data, error } = await q;
      if (error) throw error;
      all.push(...data);
      if (data.length < PAGE) break;
    }
    transactions = all.map(fromDbTx);
  }

  /* ---------- TEMA & NAVIGASI ---------- */
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $("#themeToggle").checked = theme === "dark";
    $("#themeBtnShop").textContent = theme === "dark" ? "☀️" : "🌙";
  }
  const setTheme = (t) => { applyTheme(t); store.set(KEYS.theme, t); };
  const savedTheme = store.get(KEYS.theme, null);
  applyTheme(savedTheme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  $("#themeToggle").addEventListener("change", (e) => setTheme(e.target.checked ? "dark" : "light"));
  $("#themeBtnShop").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

  const TITLES = { catalog: "Katalog Mainan", pos: "Kasir / POS", stock: "Kelola Stok", report: "Laporan Penjualan" };
  function setView(view) {
    if (!MODE_VIEWS[MODE].includes(view)) view = MODE_VIEWS[MODE][0];
    ui.view = view;
    $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    $("#pageTitle").textContent = TITLES[view];
    $$("[data-show-on]").forEach((el) => { el.hidden = el.dataset.showOn !== view; });
    toggleSidebar(false);
    renderView();
    window.scrollTo({ top: 0 });
    history.replaceState(null, "", "#" + view);
  }
  function renderView() {
    const allowed = ACCESS[ui.view]();
    $$(".view").forEach((v) => v.classList.toggle("active", v.id === (allowed ? "view-" + ui.view : "view-locked")));
    if (!allowed) return renderLocked();
    ({ catalog: renderCatalog, pos: renderPOS, stock: renderStock, report: renderReport })[ui.view]();
  }
  function renderLocked() {
    const needs = ui.view === "pos" ? "kasir atau admin" : "admin";
    $("#lockedTitle").textContent = session ? `${TITLES[ui.view]} khusus ${needs}` : "Panel Staf Indu Toys";
    $("#lockedLoginBtn").hidden = !!session;
    $("#lockedText").textContent = !session
      ? "Halaman ini khusus kasir dan admin toko. Silakan masuk dengan akun staf."
      : role() === "pending"
        ? "Akun kamu belum diberi peran. Minta admin toko mengaktifkan akunmu di Kelola Stok → Pengguna & Peran Staf."
        : `Akun kamu berperan ${ROLES[role()]}. Halaman ini hanya untuk ${needs}.`;
  }
  function toggleSidebar(open) {
    $("#sidebar").classList.toggle("open", open);
    $("#sidebarBackdrop").classList.toggle("show", open);
  }
  $$(".nav-item[data-view]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
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
    b.hidden = low === 0 || !isAdmin();
    b.textContent = low;
    b.title = `${low} produk stok menipis`;
  }

  function stockBadge(p) {
    if (p.stock <= 0) return `<span class="badge badge-out">Habis</span>`;
    if (p.stock <= LOW_STOCK) return `<span class="badge badge-low">⚠️ Sisa ${p.stock}</span>`;
    return "";
  }

  /* =========================================================
     LOGIN STAF
     ========================================================= */
  function renderAuth() {
    $$(".nav-item[data-view]").forEach((b) => b.classList.toggle("locked", !ACCESS[b.dataset.view]()));
    $("#userBox").innerHTML = session
      ? `<div class="user-email" title="${esc(session.user.email)}">👤 ${esc(profile?.full_name || session.user.email)}</div>
         <div class="user-row"><span class="role-tag">${ROLES[role()] || "Menunggu"}</span><button class="link" id="logoutBtn">Keluar</button></div>`
      : `<button id="openLoginBtn">🔑 Masuk Staf</button>`;
    updateLowBadge();
  }
  function openLogin() {
    $("#loginError").hidden = true;
    $("#loginPassword").value = "";
    openModal("#loginModal");
    setTimeout(() => $("#loginEmail").focus(), 50);
  }
  $("#userBox").addEventListener("click", async (e) => {
    if (e.target.id === "openLoginBtn") openLogin();
    if (e.target.id === "logoutBtn") {
      await sb.auth.signOut();
      toast("Kamu sudah keluar.");
    }
  });
  $("#lockedLoginBtn").addEventListener("click", openLogin);
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#loginSubmit");
    btn.disabled = true; btn.textContent = "Memeriksa...";
    const { error } = await sb.auth.signInWithPassword({ email: $("#loginEmail").value.trim(), password: $("#loginPassword").value });
    btn.disabled = false; btn.textContent = "Masuk";
    if (error) {
      $("#loginError").hidden = false;
      $("#loginError").textContent = /invalid login/i.test(error.message) ? "Email atau kata sandi salah." : errMsg(error);
      return;
    }
    closeModals();
  });

  async function onSessionChange(newSession) {
    session = newSession;
    await loadProfile();
    renderAuth();
    renderView();
    if (session) toast(`Halo, ${profile?.full_name || session.user.email}! Peran: ${ROLES[role()]}`);
  }
  sb.auth.onAuthStateChange((event, s) => {
    if (event === "SIGNED_IN" && s?.user?.id === session?.user?.id) { session = s; return; } // token/tab refresh
    if (event === "SIGNED_IN" || event === "SIGNED_OUT") setTimeout(() => onSessionChange(s), 0);
    else if (s) session = s;
  });

  /* =========================================================
     MODE KATALOG
     ========================================================= */
  function fillSelect(sel, options, allLabel) {
    const current = sel.value;
    sel.innerHTML = `<option value="all">${allLabel}</option>` + options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join("");
    sel.value = options.includes(current) ? current : "all";
  }

  const CATEGORY_ICONS = {
    edukatif: "🧠", boneka: "🧸", kendaraan: "🚗", puzzle: "🧩", konstruksi: "🧱", peran: "🍳",
    bayi: "🍼", outdoor: "⚽", olahraga: "⚽", musik: "🎵", seni: "🎨", robot: "🤖", lainnya: "🎁",
  };
  const categoryIcon = (c) => CATEGORY_ICONS[String(c).toLowerCase()] || "🎁";
  const SORTERS = {
    name: (a, b) => a.name.localeCompare(b.name),
    "price-asc": (a, b) => a.price - b.price,
    "price-desc": (a, b) => b.price - a.price,
    stock: (a, b) => b.stock - a.stock,
  };
  // Favorit pembeli disimpan di perangkat masing-masing
  let favorites = new Set(store.get(KEYS.favorites, []));
  const saveFavorites = () => store.set(KEYS.favorites, [...favorites]);

  function renderCatalog() {
    const cats = categories();
    if (ui.catCategory !== "all" && !cats.includes(ui.catCategory)) ui.catCategory = "all";

    const countBy = (c) => c === "all" ? products.length : products.filter((p) => p.category === c).length;
    $("#catChips").innerHTML = ["all", ...cats].map((c) => `
      <button class="cat-card ${ui.catCategory === c ? "active" : ""}" data-chip="${esc(c)}">
        <span class="cat-ico">${c === "all" ? "✨" : categoryIcon(c)}</span>
        <b>${c === "all" ? "Semua" : esc(c)}</b>
        <small>${countBy(c)} mainan</small>
      </button>`).join("");

    const q = $("#catSearch").value.trim().toLowerCase();
    const priceSel = $("#catPrice");
    const [min, max] = priceSel.value === "all" ? [0, Infinity] : priceSel.value.split("-").map(Number);
    const list = products.filter((p) =>
      (!q || p.name.toLowerCase().includes(q)) &&
      (ui.catCategory === "all" || p.category === ui.catCategory) &&
      (ui.catTab !== "fav" || favorites.has(p.id)) &&
      p.price >= min && p.price <= max).sort(SORTERS[$("#catSort").value] || SORTERS.name);

    // Jejak filter aktif
    const parts = [];
    if (ui.catCategory !== "all") parts.push(esc(ui.catCategory));
    if (priceSel.value !== "all") parts.push(esc(priceSel.selectedOptions[0].textContent));
    if (q) parts.push(`“${esc(q)}”`);
    if (ui.catTab === "fav") parts.push("Favorit");
    $("#catCrumbs").innerHTML = `Beranda${parts.map((p) => ` &nbsp;|&nbsp; <b>${p}</b>`).join("")} &nbsp;·&nbsp; ${list.length} mainan`;
    $("#catReset").hidden = !parts.length;

    $("#catalogGrid").innerHTML = list.length ? list.map((p) => {
      const inCart = catalogCart.find((c) => c.id === p.id)?.qty || 0;
      const soldOut = p.stock <= 0;
      const fav = favorites.has(p.id);
      return `
        <article class="product">
          <div class="product-img">
            ${imgTag(p.image, p.name)}
            <span class="age-tag">${esc(p.age)}</span>
            <button class="fav-btn ${fav ? "on" : ""}" data-fav="${p.id}" aria-label="${fav ? "Hapus dari" : "Tambah ke"} favorit" aria-pressed="${fav}">${fav ? "❤️" : "🤍"}</button>
            ${stockBadge(p)}
          </div>
          <div class="product-body">
            <div class="pb-row"><h4>${esc(p.name)}</h4><span class="price">${fmtRp(p.price)}</span></div>
            <div class="pb-meta">${categoryIcon(p.category)} ${esc(p.category)}</div>
            <div class="pb-foot">
              <span class="stock-txt">${soldOut ? "Stok habis" : `Stok ${p.stock} pcs`}${inCart ? ` · <span class="in-cart">🛒 ${inCart} di keranjang</span>` : ""}</span>
              <button class="add-btn" data-add-catalog="${p.id}" ${soldOut ? "disabled" : ""} aria-label="Tambah ${esc(p.name)} ke keranjang" title="Tambah ke keranjang">🛒</button>
            </div>
          </div>
        </article>`;
    }).join("") : `<div class="empty"><span class="big">${ui.catTab === "fav" ? "🤍" : "🔍"}</span>${
      !products.length ? "Belum ada mainan di etalase."
      : ui.catTab === "fav" && !favorites.size ? "Belum ada favorit. Ketuk 🤍 pada mainan untuk menyimpannya."
      : "Mainan tidak ditemukan. Coba ubah kata kunci atau filter."}</div>`;

    renderCatalogCart();
  }

  const scrollToSection = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  $$("[data-scroll]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); scrollToSection(a.dataset.scroll); }));
  $("#catGo").addEventListener("click", () => { renderCatalog(); scrollToSection("featured"); });
  $("#catSearch").addEventListener("input", renderCatalog);
  $("#catSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") scrollToSection("featured"); });
  ["#catPrice", "#catSort"].forEach((s) => $(s).addEventListener("change", renderCatalog));
  $("#catChips").addEventListener("click", (e) => {
    const c = e.target.closest("[data-chip]");
    if (c) { ui.catCategory = c.dataset.chip; renderCatalog(); scrollToSection("featured"); }
  });
  $("#catTabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    ui.catTab = b.dataset.tab;
    $$("#catTabs button").forEach((x) => x.classList.toggle("active", x === b));
    renderCatalog();
  });
  $("#catReset").addEventListener("click", () => {
    $("#catSearch").value = ""; $("#catPrice").value = "all"; ui.catCategory = "all";
    ui.catTab = "all"; $$("#catTabs button").forEach((x) => x.classList.toggle("active", x.dataset.tab === "all"));
    renderCatalog();
  });
  $("#catalogGrid").addEventListener("click", (e) => {
    const f = e.target.closest("[data-fav]");
    if (f) {
      const id = f.dataset.fav;
      favorites.has(id) ? favorites.delete(id) : favorites.add(id);
      saveFavorites();
      renderCatalog();
      return;
    }
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
    if (products.length) catalogCart = catalogCart.filter((c) => findProduct(c.id));
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
        cart().splice(cart().indexOf(item), 1);
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
    if (products.length) posCart = posCart.filter((c) => findProduct(c.id));
    const lines = cartLines(posCart);
    $("#posCartList").innerHTML = lines.length ? lines.map((c) => cartRowHTML(c, "pc")).join("")
      : `<div class="empty"><span class="big">🧾</span>Belum ada barang. Klik mainan untuk menambah.</div>`;
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
    const finders = [[0, 0], [0, 9], [9, 0]];
    const finderCell = (r, c) => {
      for (const [fr, fc] of finders) {
        if (r >= fr && r < fr + 4 && c >= fc && c < fc + 4) {
          const rr = r - fr, cc = c - fc;
          return rr === 0 || rr === 3 || cc === 0 || cc === 3 || (rr > 0 && rr < 3 && cc > 0 && cc < 3);
        }
      }
      return null;
    };
    let html = "";
    for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) {
      const f = finderCell(r, c);
      const on = f === null ? rnd() > 0.5 : f;
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
    let paid = total;
    if (ui.payMethod === "Tunai") {
      paid = parseMoney($("#cashInput").value);
      if (paid < total) return toast(`Uang diterima kurang ${fmtRp(total - paid)}.`, "error");
    }
    const ok = await confirmDialog("Proses transaksi?", `Total ${fmtRp(total)} dibayar via ${ui.payMethod}. Stok akan otomatis berkurang.`);
    if (!ok) return;

    loading(true, "Menyimpan transaksi...");
    try {
      // Harga, stok, dan nomor nota dihitung ulang di server secara atomik
      const { data, error } = await sb.rpc("process_sale", {
        p_items: lines.map((c) => ({ id: c.id, qty: c.qty })),
        p_method: ui.payMethod,
        p_paid: paid,
      });
      if (error) throw error;
      const tx = fromDbTx(data);
      posCart = []; savePosCart();
      $("#cashInput").value = "";
      await loadProducts();
      renderPOS(); updateLowBadge();

      const lowNow = tx.items.map((i) => findProduct(i.id)).filter((p) => p && p.stock <= LOW_STOCK);
      if (lowNow.length) toast(`Stok menipis: ${lowNow.map((p) => `${p.name} (${p.stock})`).join(", ")}`, "warn");
      showReceipt(tx);
    } catch (err) {
      console.error(err);
      toast("Transaksi gagal: " + errMsg(err), "error");
      await loadProducts().catch(() => {});
      renderPOS();
    } finally {
      loading(false);
    }
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
      ${tx.cashier ? `<div class="r-row"><span>Kasir</span><span>${esc(tx.cashier)}</span></div>` : ""}
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
      const height = 82 + tx.items.length * lh * 2 + (tx.method === "Tunai" ? lh : 0);
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
      doc.splitTextToSize(settings.address || "", W - 2 * M).forEach((t) => center(t));
      center("WA: " + settings.wa);
      line();
      row("No. Nota", tx.id);
      row("Tanggal", fmtDateTime(tx.date));
      row("Kasir", doc.splitTextToSize(tx.cashier || "-", 45)[0]);
      line();
      tx.items.forEach((i) => {
        doc.setFont("helvetica", "normal"); doc.setFontSize(8);
        doc.text(doc.splitTextToSize(i.name, W - 2 * M)[0], M, y); y += lh;
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
     MODE KELOLA STOK (admin)
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
    if ($("#usersPanel").open) renderUsers();
  }

  $("#stockSearch").addEventListener("input", renderStock);
  $("#stockLowOnly").addEventListener("change", renderStock);
  $("#stockTable").addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    const { stockInc, stockDec, edit, del } = t.dataset;
    if (stockInc || stockDec) {
      const id = stockInc || stockDec;
      t.disabled = true;
      const { data, error } = await sb.rpc("adjust_stock", { p_id: id, p_delta: stockInc ? 1 : -1 });
      if (error) { t.disabled = false; return toast("Gagal mengubah stok: " + errMsg(error), "error"); }
      const p = findProduct(id);
      if (p && data !== null) p.stock = data;
      renderStock();
    } else if (edit) {
      openProductForm(findProduct(edit));
    } else if (del) {
      const p = findProduct(del);
      if (!(await confirmDialog("Hapus mainan?", `"${p.name}" akan dihapus dari daftar produk. Riwayat penjualan tetap tersimpan.`))) return;
      const { error } = await sb.from("products").delete().eq("id", del);
      if (error) return toast("Gagal menghapus: " + errMsg(error), "error");
      products = products.filter((x) => x.id !== del);
      renderStock();
      toast(`${p.name} dihapus.`);
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
    $("#pImage").value = p?.image || "";
    $("#pDesc").value = p?.desc || "";
    $("#pImageFile").value = "";
    $("#pPreview").src = p?.image || "";
    openModal("#productModal");
    setTimeout(() => $("#pName").focus(), 50);
  }
  $("#addProductBtn").addEventListener("click", () => openProductForm(null));
  $("#pImage").addEventListener("input", (e) => { $("#pPreview").src = e.target.value; });
  $("#pPreview").addEventListener("error", (e) => { if (e.target.getAttribute("src")) e.target.src = PLACEHOLDER_IMG; });

  // Perkecil gambar lalu unggah ke Supabase Storage
  function resizeImage(file, maxSize = 800) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(img.src);
        cv.toBlob((b) => (b ? resolve(b) : reject(new Error("Gagal memproses gambar."))), "image/jpeg", 0.8);
      };
      img.onerror = () => reject(new Error("File bukan gambar yang valid."));
      img.src = URL.createObjectURL(file);
    });
  }
  $("#pImageFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    loading(true, "Mengunggah gambar...");
    try {
      const blob = await resizeImage(file);
      const path = `${uid("IMG")}.jpg`;
      const { error } = await sb.storage.from(IMAGE_BUCKET).upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      const url = sb.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
      $("#pImage").value = url;
      $("#pPreview").src = url;
      toast("Gambar berhasil diunggah 🖼️");
    } catch (err) {
      console.error(err);
      toast("Gagal mengunggah gambar: " + errMsg(err), "error");
      e.target.value = "";
    } finally {
      loading(false);
    }
  });

  $("#productForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("#pId").value;
    const data = {
      name: $("#pName").value.trim(),
      category: $("#pCategory").value.trim(),
      age: $("#pAge").value,
      price: Math.max(0, Math.round(Number($("#pPrice").value) || 0)),
      stock: Math.max(0, parseInt($("#pStock").value, 10) || 0),
      image: $("#pImage").value.trim(),
      desc: $("#pDesc").value.trim(),
    };
    if (!data.name || !data.category || !data.age) return toast("Lengkapi nama, kategori, dan usia.", "error");
    if (products.some((p) => p.name.toLowerCase() === data.name.toLowerCase() && p.id !== id)) return toast("Nama mainan sudah ada. Gunakan nama lain.", "error");

    loading(true, "Menyimpan mainan...");
    try {
      const { error } = id
        ? await sb.from("products").update(toDbProduct(data)).eq("id", id)
        : await sb.from("products").insert({ id: uid("P"), ...toDbProduct(data) });
      if (error) throw error;
      await loadProducts();
      closeModals();
      renderStock();
      toast(id ? "Data mainan diperbarui ✏️" : "Mainan baru ditambahkan 🎉");
    } catch (err) {
      console.error(err);
      toast("Gagal menyimpan: " + errMsg(err), "error");
    } finally {
      loading(false);
    }
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
    const rows = products.map((p) => Object.fromEntries(Object.entries(PRODUCT_COLS).map(([label, key]) => [label, p[key]])));
    downloadSheet(rows, `Produk-InduToys-${dateKey(new Date())}`, b.dataset.exportProducts, "Produk");
    toast(`Data ${products.length} produk diekspor ⬇️`);
  }));
  $("#templateBtn").addEventListener("click", () => {
    if (!requireXLSX()) return;
    downloadSheet([{ Nama: "Contoh Mobil Mainan", Kategori: "Kendaraan", Usia: "3-5 tahun", Harga: 50000, Stok: 10, Gambar: "", Deskripsi: "Deskripsi singkat" }], "Template-Impor-InduToys", "csv", "Produk");
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
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      if (!raw.length) throw new Error("File kosong atau tidak memiliki baris data.");
      const upserts = new Map(); // kunci: nama huruf kecil (baris terakhir menang)
      let skipped = 0;
      raw.forEach((r) => {
        const row = {};
        Object.entries(r).forEach(([k, v]) => { const key = HEADER_ALIASES[k.trim().toLowerCase()]; if (key) row[key] = v; });
        const name = String(row.name || "").trim();
        if (!name) { skipped++; return; }
        const existing = (row.id && findProduct(String(row.id).trim())) || products.find((p) => p.name.toLowerCase() === name.toLowerCase());
        const data = {
          name,
          category: String(row.category || "").trim() || existing?.category || "Lainnya",
          age: row.age ? normalizeAge(row.age) : existing?.age || AGES[1],
          price: parseMoney(row.price),
          stock: Math.max(0, parseInt(row.stock, 10) || 0),
          image: String(row.image || "").trim() || existing?.image || "",
          desc: String(row.desc || "").trim() || existing?.desc || "",
        };
        upserts.set(name.toLowerCase(), { id: existing?.id || upserts.get(name.toLowerCase())?.id || uid("P"), ...toDbProduct(data), _new: !existing });
      });
      const rows = [...upserts.values()];
      if (!rows.length) throw new Error("Tidak ada baris valid. Pastikan ada kolom 'Nama'.");
      const added = rows.filter((r) => r._new).length;
      rows.forEach((r) => delete r._new);
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from("products").upsert(rows.slice(i, i + 500), { onConflict: "id" });
        if (error) throw error;
      }
      await loadProducts();
      renderStock();
      toast(`Impor selesai: ${added} baru, ${rows.length - added} diperbarui${skipped ? `, ${skipped} dilewati` : ""} ✅`);
    } catch (err) {
      console.error(err);
      toast("Gagal impor: " + errMsg(err), "error");
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
    const chatUrl = `https://wa.me/${settings.wa}?text=${encodeURIComponent(`Halo ${settings.storeName}, saya mau tanya-tanya mainan 😊`)}`;
    $$(".chat-store-link").forEach((a) => { a.href = chatUrl; });
  }
  $("#settingsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const next = {
      storeName: $("#setStoreName").value.trim() || DEFAULT_SETTINGS.storeName,
      wa: $("#setWa").value.replace(/\D/g, ""),
      address: $("#setAddress").value.trim(),
      bank: $("#setBank").value.trim(),
    };
    const { error } = await sb.from("settings")
      .update({ store_name: next.storeName, wa: next.wa, address: next.address, bank: next.bank, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) return toast("Gagal menyimpan pengaturan: " + errMsg(error), "error");
    settings = next;
    fillSettings();
    toast("Pengaturan toko disimpan 💾");
  });

  /* ---------- PENGGUNA & PERAN ---------- */
  async function renderUsers() {
    const tbody = $("#usersTable tbody");
    const { data, error } = await sb.from("profiles").select("*").order("created_at");
    if (error) { tbody.innerHTML = `<tr><td colspan="3">${esc(errMsg(error))}</td></tr>`; return; }
    tbody.innerHTML = data.map((u) => `
      <tr>
        <td><b>${esc(u.full_name || u.email)}</b>${u.full_name ? `<div class="muted">${esc(u.email)}</div>` : ""}${u.user_id === session?.user.id ? ' <span class="badge badge-cat">kamu</span>' : ""}</td>
        <td>${fmtDateTime(u.created_at)}</td>
        <td>
          <select class="role-select" data-user-role="${u.user_id}">
            ${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${u.role === k ? "selected" : ""}>${v}</option>`).join("")}
          </select>
        </td>
      </tr>`).join("");
  }
  $("#usersPanel").addEventListener("toggle", (e) => { if (e.target.open) renderUsers(); });
  $("#usersTable").addEventListener("change", async (e) => {
    const sel = e.target.closest("[data-user-role]");
    if (!sel) return;
    const userId = sel.dataset.userRole;
    if (userId === session?.user.id && sel.value !== "admin" &&
        !(await confirmDialog("Turunkan peranmu sendiri?", "Kamu akan kehilangan akses admin dan tidak bisa mengembalikannya sendiri."))) {
      sel.value = "admin";
      return;
    }
    const { error } = await sb.from("profiles").update({ role: sel.value }).eq("user_id", userId);
    if (error) { toast("Gagal mengubah peran: " + errMsg(error), "error"); return renderUsers(); }
    toast(`Peran diubah menjadi ${ROLES[sel.value]} ✅`);
    if (userId === session?.user.id) { await loadProfile(); renderAuth(); renderView(); }
  });

  /* =========================================================
     LAPORAN PENJUALAN (admin)
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
  // Ambil cukup data untuk periode terpilih + jendela grafik (31 hari / 12 bulan)
  function fetchSince() {
    if (ui.reportPeriod === "all") return null;
    const now = new Date();
    const chartStart = ui.recapMode === "monthly"
      ? new Date(now.getFullYear(), now.getMonth() - 11, 1)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 31);
    const [from, to] = periodRange();
    const customChart = new Date(to); customChart.setDate(customChart.getDate() - 31);
    return new Date(Math.min(+from, +chartStart, +customChart));
  }
  async function refreshTransactions() {
    await loadTransactions(fetchSince());
  }

  async function renderReport() {
    const token = ++ui.reportToken;
    $("#txTable tbody").innerHTML = `<tr><td colspan="6"><div class="empty">⏳ Memuat data penjualan...</div></td></tr>`;
    try {
      await refreshTransactions();
    } catch (err) {
      console.error(err);
      if (token === ui.reportToken) $("#txTable tbody").innerHTML = `<tr><td colspan="6"><div class="empty">⚠️ ${esc(errMsg(err))}</div></td></tr>`;
      return;
    }
    if (token !== ui.reportToken || ui.view !== "report") return;

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
        <td><b>${esc(t.id)}</b>${t.cashier ? `<div class="muted">${esc(t.cashier)}</div>` : ""}</td>
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
      // 12 bulan terakhir
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

  $$("[data-export-sales]").forEach((b) => b.addEventListener("click", async () => {
    if (!requireXLSX()) return;
    loading(true, "Menyiapkan file ekspor...");
    try {
      await refreshTransactions();
      const list = txInPeriod().sort((a, b) => a.date.localeCompare(b.date));
      if (!list.length) return toast("Tidak ada transaksi pada periode ini untuk diekspor.", "warn");
      const rows = [];
      list.forEach((t) => t.items.forEach((i) => rows.push({
        "No. Nota": t.id,
        Tanggal: dateKey(new Date(t.date)),
        Jam: new Date(t.date).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
        Kasir: t.cashier,
        Produk: i.name,
        Qty: i.qty,
        "Harga Satuan": i.price,
        Subtotal: i.qty * i.price,
        "Total Nota": t.total,
        "Metode Bayar": t.method,
      })));
      downloadSheet(rows, `Penjualan-InduToys-${dateKey(new Date())}`, b.dataset.exportSales, "Penjualan");
      toast(`${list.length} transaksi diekspor ⬇️`);
    } catch (err) {
      toast("Gagal ekspor: " + errMsg(err), "error");
    } finally {
      loading(false);
    }
  }));

  /* ---------- REALTIME: stok & produk dari perangkat lain ---------- */
  let rtTimer;
  sb.channel("products-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => {
      clearTimeout(rtTimer);
      rtTimer = setTimeout(async () => {
        try { await loadProducts(); } catch { return; }
        updateLowBadge();
        if (!anyModalOpen() && ui.view !== "report") renderView();
      }, 500);
    })
    .subscribe();

  // Keranjang antar tab di perangkat yang sama
  window.addEventListener("storage", (e) => {
    if (e.key === KEYS.catalogCart) catalogCart = store.get(KEYS.catalogCart, []);
    else if (e.key === KEYS.posCart) posCart = store.get(KEYS.posCart, []);
    else return;
    if (ui.view === "catalog" || ui.view === "pos") renderView();
  });

  /* ---------- INIT ---------- */
  $$(".year").forEach((el) => { el.textContent = new Date().getFullYear(); });
  loading(true, "Memuat data toko...");
  try {
    const [{ data: sess }] = await Promise.all([sb.auth.getSession(), loadSettings(), loadProducts()]);
    session = sess.session;
    await loadProfile();
  } catch (err) {
    console.error(err);
    toast("Gagal memuat data: " + errMsg(err), "error");
  } finally {
    loading(false);
  }
  fillSettings();
  renderAuth();
  const startView = location.hash.slice(1);
  setView(TITLES[startView] ? startView : "catalog");
})();
