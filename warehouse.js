// warehouse.js
// =====================================================
// WAREHOUSE MODULE (standalone navigation + section show)
// =====================================================
//
// ✅ Pastikan tombol Warehouse di sidebar seperti ini:
//
// <button id="navWarehouse" class="side-item" data-wh-nav="1" type="button">
//   Warehouse
// </button>
//
// ✅ Pastikan section warehouse ada:
//
// <section id="warehouseSection" class="hidden"> ... </section>
//
// NOTE:
// - script.js sudah dipatch untuk skip element yang punya data-wh-nav="1"
// - jadi klik Warehouse tidak akan di-handle script.js

(function () {
  const $ = (id) => document.getElementById(id);

  const navWarehouse = $("navWarehouse");
  const warehouseSection = $("warehouseSection");
  const sidebar = $("sidebar");

  // daftar section app yang mau kita hide kalau masuk warehouse
  const knownSections = [
    "salesSection",
    "inventorySection",
    "recipeSection",
    "dashboardSection",
    "opnameSection",
    "reportsSection",
    "warehouseSection",
  ];

  function hideAllMainSections() {
    knownSections.forEach((id) => {
      const el = $(id);
      if (el) el.classList.add("hidden");
    });
  }

  function openWarehouse() {
    hideAllMainSections();
    if (warehouseSection) warehouseSection.classList.remove("hidden");

    // reset active state semua menu internal (opsional)
    document.querySelectorAll(".side-item").forEach((b) => b.classList.remove("active"));
    if (navWarehouse) navWarehouse.classList.add("active");

    // auto close sidebar di mobile
    if (window.innerWidth <= 900 && sidebar) sidebar.classList.remove("open");

    // scroll halus
    if (warehouseSection) warehouseSection.scrollIntoView({ behavior: "smooth" });
  }

  // kalau section warehouse belum ada, jangan error
  if (!navWarehouse) {
    console.warn("[warehouse.js] tombol #navWarehouse tidak ditemukan.");
    return;
  }
  if (!warehouseSection) {
    console.warn("[warehouse.js] section #warehouseSection tidak ditemukan.");
  }

  navWarehouse.addEventListener("click", (e) => {
    // amanin supaya event tidak "nyasar"
    e.preventDefault();
    e.stopPropagation();
    openWarehouse();
  });

  // expose global (kalau butuh dipanggil dari tempat lain)
  window.openWarehouse = openWarehouse;
})();