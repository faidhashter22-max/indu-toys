// Konfigurasi koneksi Supabase.
// Isi dari Supabase Dashboard → Project Settings → API Keys.
// Kunci "publishable" / "anon" memang aman diletakkan di sisi browser;
// keamanan data dijaga oleh Row Level Security (lihat supabase/schema.sql).
// JANGAN pernah menaruh kunci "secret" / "service_role" di sini.
window.INDU_CONFIG = {
  supabaseUrl: "https://sxdyvylislyogzlkalyf.supabase.co",
  supabaseKey: "sb_publishable_dnFZywgDECGLqJGuebGhZw_SHMI1VaD",
};
