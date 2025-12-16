// warehouse.js
// =====================================================
// WAREHOUSE NAVIGATION CONTROLLER (FIXED FOR YOUR HTML)
// =====================================================

(() => {
  const $ = (id) => document.getElementById(id);

  /* =======================
     NAV BUTTONS (SIDEBAR)
     ======================= */
  const navs = {
    dashboard: $("navWhDashboard"),
    opname: $("navWhOpname"),
    waste: $("navWhWaste"),
    report: $("navWhReport"),
  };

  /* =======================
     SECTIONS (MAIN)
     ======================= */
  const sections = {
    dashboard: $("whDashboardSection"),
    opname: $("whOpnameSection"),
    waste: $("whWasteSection"),
    report: $("whReportSection"),
  };

  const sidebar = $("sidebar");

  /* =======================
     ALL MAIN SECTIONS
     (biar section lama ikut ke-hide)
     ======================= */
  const ALL_SECTION_IDS = [
    // warehouse
    "whDashboardSection",
    "whOpnameSection",
    "whWasteSection",
    "whReportSection",

    // legacy (script.js)
    "salesSection",
    "inventorySection",
    "recipeSection",
    "dashboardSection",
    "opnameSection",
    "reportsSection",
  ];

  function hideAllSections() {
    ALL_SECTION_IDS.forEach((id) => {
      const el = $(id);
      if (el) el.classList.add("hidden");
    });
  }

  function clearActiveMenu() {
    document.querySelectorAll(".side-item").forEach((btn) => {
      btn.classList.remove("active");
    });
  }

  function openSection(key) {
    hideAllSections();
    clearActiveMenu();

    if (sections[key]) sections[key].classList.remove("hidden");
    if (navs[key]) navs[key].classList.add("active");

    // auto close sidebar mobile
    if (window.innerWidth <= 900 && sidebar) {
      sidebar.classList.remove("open");
    }
  }

  /* =======================
     BIND EVENTS
     ======================= */
  Object.entries(navs).forEach(([key, btn]) => {
    if (!btn) return;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openSection(key);
    });
  });

  /* =======================
     DEFAULT OPEN
     ======================= */
  // buka dashboard warehouse pertama kali
  if (sections.dashboard) {
    hideAllSections();
    sections.dashboard.classList.remove("hidden");
    navs.dashboard?.classList.add("active");
  }

  /* =======================
     DEBUG (opsional)
     ======================= */
  console.log("[warehouse.js] Warehouse navigation ready");
})();