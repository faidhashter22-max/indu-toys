/* =========================================================
   Indu Toy — pembuat struk PDF ukuran printer kasir (80 mm)
   Dipakai panel kasir lewat window.buildReceiptPDF(tx, settings, fmt).
   ========================================================= */
(() => {
  "use strict";

  const W = 80;          // lebar kertas (mm)
  const M = 5;           // margin kiri-kanan (mm)
  const LH = 4.2;        // tinggi baris (mm)
  const LOGO_W = 30;     // lebar logo di struk (mm)
  const RED = [220, 38, 38];
  const YELLOW = [250, 204, 21];
  const INK = [43, 26, 16];
  const MUTED = [120, 100, 80];

  // Logo diperkecil sekali lalu disimpan, supaya ukuran PDF tetap ringan
  let logoPromise = null;
  function loadLogo() {
    if (!logoPromise) {
      logoPromise = new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const w = 360;
          const h = Math.round((img.height * w) / img.width);
          const c = document.createElement("canvas");
          c.width = w; c.height = h;
          c.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve({ data: c.toDataURL("image/png"), ratio: h / w });
        };
        img.onerror = () => resolve(null); // struk tetap dibuat tanpa logo
        img.src = "/assets/logo.png";
      });
    }
    return logoPromise;
  }

  // Menggambar seluruh struk; mengembalikan posisi y terakhir.
  function draw(doc, tx, settings, fmt, logo) {
    const { fmtRp, fmtDateTime } = fmt;
    let y = 0;
    const font = (size, bold = false, color = INK) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(size);
      doc.setTextColor(...color);
    };
    const center = (text, size = 8, bold = false, color = INK) => {
      font(size, bold, color);
      doc.text(text, W / 2, y, { align: "center" });
      y += LH;
    };
    const row = (left, right, size = 8, bold = false, color = INK) => {
      font(size, bold, color);
      doc.text(left, M, y);
      doc.text(right, W - M, y, { align: "right" });
      y += LH;
    };
    const dashed = () => {
      doc.setDrawColor(170, 150, 130);
      doc.setLineDashPattern([1, 0.8], 0);
      doc.line(M, y - 1.6, W - M, y - 1.6);
      doc.setLineDashPattern([], 0);
      y += 2.4;
    };

    // Pita merah atas
    doc.setFillColor(...RED);
    doc.rect(0, 0, W, 3, "F");
    y = 7;

    // Logo
    if (logo) {
      const h = LOGO_W * logo.ratio;
      doc.addImage(logo.data, "PNG", (W - LOGO_W) / 2, y, LOGO_W, h, "logo", "FAST");
      y += h + 4;
    } else {
      y += 3;
      center((settings.storeName || "Indu Toy").toUpperCase(), 14, true, RED);
    }

    // Identitas toko
    center(settings.storeName || "Indu Toy", 10, true);
    doc.setFontSize(7.5);
    doc.splitTextToSize(settings.address || "", W - 2 * M).forEach((t) => center(t, 7.5, false, MUTED));
    if (settings.wa) center("WhatsApp: " + settings.wa, 7.5, false, MUTED);
    y += 1;
    dashed();

    // Info nota
    row("No. Nota", tx.id, 7.5);
    row("Tanggal", fmtDateTime(tx.date), 7.5);
    row("Pembayaran", tx.method, 7.5);
    dashed();

    // Daftar barang
    row("Barang", "Subtotal", 7.5, true, MUTED);
    y += 0.6;
    tx.items.forEach((i) => {
      font(8, true);
      doc.setFontSize(8);
      doc.splitTextToSize(i.name, W - 2 * M).slice(0, 2).forEach((t) => {
        doc.text(t, M, y);
        y += LH - 0.4;
      });
      row(`${i.qty} x ${fmtRp(i.price)}`, fmtRp(i.qty * i.price), 7.5, false, MUTED);
      y += 0.8;
    });
    dashed();

    // Total
    const qty = tx.items.reduce((s, i) => s + i.qty, 0);
    row(`Jumlah barang`, `${qty} pcs`, 7.5, false, MUTED);
    y += 1;
    doc.setFillColor(254, 243, 199);
    doc.roundedRect(M - 1.5, y - 4.6, W - 2 * M + 3, 7.4, 1.5, 1.5, "F");
    row("TOTAL", fmtRp(tx.total), 11, true, RED);
    y += 1.6;
    row(`Bayar (${tx.method})`, fmtRp(tx.paid), 8);
    if (tx.method === "Tunai") row("Kembalian", fmtRp(tx.change), 8, true);
    y += 1;
    dashed();

    // Penutup
    center("Terima kasih telah berbelanja!", 9, true, RED);
    center("Simpan struk ini sebagai bukti pembelian.", 7, false, MUTED);
    center("Barang yang sudah dibeli tidak dapat ditukar", 7, false, MUTED);
    center("atau dikembalikan tanpa struk ini.", 7, false, MUTED);
    return y + 4;
  }

  window.buildReceiptPDF = async (tx, settings, fmt) => {
    const { jsPDF } = window.jspdf;
    const logo = await loadLogo();
    // Lintasan pertama mengukur tinggi struk, lintasan kedua mencetak di kertas yang pas
    const height = draw(new jsPDF({ unit: "mm", format: [W, 400], compress: true }), tx, settings, fmt, logo);
    const pageH = Math.max(Math.ceil(height + 3), 100);
    const doc = new jsPDF({ unit: "mm", format: [W, pageH], compress: true });
    draw(doc, tx, settings, fmt, logo);
    // Pita kuning bawah
    doc.setFillColor(...YELLOW);
    doc.rect(0, pageH - 3, W, 3, "F");
    return doc;
  };
})();
