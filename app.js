/* ══════════════════════════════════════════════════════════
   Conciliador Pro — app.js
   Lógica completa: búsqueda, registro, dashboard, reembolsos
══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ────────────────────────────────────────────────────────
     1. HELPERS
  ──────────────────────────────────────────────────────── */

  /** Muestra un alert estilizado dentro del contenedor dado */
  function showAlert(containerId, type, icon, message) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
      <div class="alert alert-${type}">
        <span class="alert-icon">${icon}</span>
        <div class="alert-body">${message}</div>
      </div>`;
  }

  /** Formatea un número con separadores de miles → "1.234,56 Bs" */
  function formatBs(amount) {
    const n = parseFloat(amount) || 0;
    return n.toLocaleString("es-BO", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " Bs";
  }

  /** Convierte una cadena ISO o fecha de Sheets → "DD/MM/AAAA" */
  function formatDate(raw) {
    if (!raw) return "";
    // Sheets a veces devuelve "Date(2026,5,15)" o ISO
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw; // si no parsea, devuelve tal cual
    const dd   = String(d.getDate()).padStart(2, "0");
    const mm   = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  /** Estado de la última búsqueda */
  let _currentRef   = null;
  let _currentMonto = null;

  /* ────────────────────────────────────────────────────────
     2. NAVEGACIÓN
  ──────────────────────────────────────────────────────── */

  const panelTitles = {
    "panel-registro"   : "Búsqueda y Registro",
    "panel-dashboard"  : "Dashboard",
    "panel-reembolsos" : "Reembolsos",
  };

  function switchPanel(panelId) {
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));

    const panel = document.getElementById(panelId);
    if (panel) panel.classList.add("active");

    const navId = "nav-" + panelId.replace("panel-", "");
    const nav   = document.getElementById(navId);
    if (nav) nav.classList.add("active");

    const title = document.getElementById("topbar-title");
    if (title) title.textContent = panelTitles[panelId] || "";

    // Mostrar/ocultar botón refresh
    const btnRefresh = document.getElementById("btn-refresh-dashboard");
    if (btnRefresh) btnRefresh.style.display = panelId === "panel-dashboard" ? "flex" : "none";

    // Auto-cargar el dashboard al entrar
    if (panelId === "panel-dashboard") loadDashboard();

    // Cerrar sidebar móvil
    document.getElementById("sidebar").classList.remove("open");
  }

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => switchPanel(btn.dataset.panel));
  });

  // Hamburger (móvil)
  const btnHamburger = document.getElementById("btn-hamburger");
  if (btnHamburger) {
    btnHamburger.addEventListener("click", () => {
      document.getElementById("sidebar").classList.toggle("open");
    });
  }

  /* ────────────────────────────────────────────────────────
     3. BÚSQUEDA Y REGISTRO
  ──────────────────────────────────────────────────────── */

  const btnBuscar   = document.getElementById("btn-buscar");
  const formRegistro = document.getElementById("form-registro");

  if (btnBuscar) {
    btnBuscar.addEventListener("click", async () => {
      const ref = document.getElementById("search-ref").value.trim();

      if (ref.length !== 4) {
        showAlert("search-result", "warning", "⚠️", "Ingresa exactamente <strong>4 dígitos</strong> de la referencia.");
        return;
      }

      btnBuscar.textContent = "Buscando…";
      btnBuscar.disabled = true;
      formRegistro.style.display = "none";
      document.getElementById("search-result").innerHTML = "";

      try {
        const res  = await fetch(`${API_URL}?action=buscarRef&ref=${encodeURIComponent(ref)}`);
        const data = await res.json();
        _currentRef = ref;

        switch (data.status) {
          case "reembolsado":
            showAlert("search-result", "danger", "❌",
              "Este pago ya fue <strong>REEMBOLSADO</strong> anteriormente.");
            break;

          case "no_encontrado":
            showAlert("search-result", "warning", "🔍",
              "Referencia <strong>no encontrada</strong> en el banco. Verifica los dígitos.");
            break;

          case "ya_asignado": {
            const a = data.alumno || {};
            showAlert("search-result", "info", "ℹ️",
              `Esta referencia ya está conciliada.<br>
              <strong>Nombre:</strong> ${a.Nombre || "—"} &nbsp;|&nbsp;
              <strong>Monto:</strong> ${formatBs(a.monto)} &nbsp;|&nbsp;
              <strong>Fecha abono:</strong> ${formatDate(a.fecha)}`);
            break;
          }

          case "ok": {
            _currentMonto = data.monto;
            showAlert("search-result", "success", "✅",
              `Pago encontrado. &nbsp;<strong>Monto:</strong> ${formatBs(data.monto)} &nbsp;|&nbsp;
              <strong>Fecha abono:</strong> ${formatDate(data.fecha)}`);
            formRegistro.style.display = "block";
            break;
          }

          default:
            showAlert("search-result", "danger", "⛔", "Respuesta inesperada del servidor.");
        }
      } catch (err) {
        console.error(err);
        showAlert("search-result", "danger", "🌐", "Error de conexión con la API. Intenta nuevamente.");
      } finally {
        btnBuscar.textContent = "Buscar";
        btnBuscar.disabled = false;
      }
    });
  }

  /* Guardar / Conciliar */
  const btnGuardar = document.getElementById("btn-guardar");
  if (btnGuardar) {
    btnGuardar.addEventListener("click", async () => {
      const tipo     = document.getElementById("reg-tipo").value.trim();
      const fecha    = document.getElementById("reg-fecha").value.trim();
      const colegio  = document.getElementById("reg-colegio").value.trim();
      const profesor = document.getElementById("reg-profesor").value.trim();
      const obs      = document.getElementById("reg-observacion").value.trim();

      if (!tipo) {
        showAlert("search-result", "warning", "⚠️", "El campo <strong>Tipo de Evento</strong> es obligatorio.");
        return;
      }

      btnGuardar.textContent = "Guardando…";
      btnGuardar.disabled = true;

      try {
        const params = new URLSearchParams({
          action: "registrar",
          ref:    _currentRef,
          tipo,
          fecha,
          colegio,
          profesor,
          observacion: obs,
        });

        const res  = await fetch(`${API_URL}?${params.toString()}`);
        const data = await res.json();

        if (data.status === "ok") {
          showAlert("search-result", "success", "🎉", "¡Registro guardado exitosamente!");
          formRegistro.style.display = "none";
          // Limpiar formulario
          ["search-ref", "reg-fecha", "reg-colegio", "reg-profesor", "reg-observacion"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = "";
          });
          document.getElementById("reg-tipo").selectedIndex = 0;
          _currentRef = null;
        } else {
          showAlert("search-result", "danger", "⛔",
            "Error al guardar: " + (data.message || "desconocido"));
        }
      } catch (err) {
        console.error(err);
        showAlert("search-result", "danger", "🌐", "Error de conexión con la API.");
      } finally {
        btnGuardar.textContent = "✔ Guardar y Conciliar";
        btnGuardar.disabled = false;
      }
    });
  }

  /* ────────────────────────────────────────────────────────
     4. DASHBOARD
  ──────────────────────────────────────────────────────── */

  let chartEventos  = null;
  let chartColegios = null;
  let dashData      = null;  // cache para el filtro

  async function loadDashboard() {
    // Mostrar estado de carga
    ["kpi-ingresos", "kpi-reembolsos", "kpi-neto"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = "Cargando…";
    });

    try {
      const res  = await fetch(`${API_URL}?action=getDashboard`);
      dashData   = await res.json();

      // ── KPIs ──────────────────────────────────────────
      document.getElementById("kpi-ingresos").textContent   = formatBs(dashData.ingresos);
      document.getElementById("kpi-reembolsos").textContent = formatBs(dashData.reembolsos);
      document.getElementById("kpi-neto").textContent       = formatBs(dashData.neto);

      // ── Desglose por Evento ───────────────────────────
      renderEventos(dashData.desglose || {});

      // ── Desglose por Colegio ──────────────────────────
      const colegios = dashData.desgloseColegios || {};
      renderColegioFilter(colegios);
      renderColegios(colegios, "");

    } catch (err) {
      console.error("Error al cargar dashboard:", err);
      ["kpi-ingresos", "kpi-reembolsos", "kpi-neto"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = "Error";
      });
    }
  }

  /* ── Eventos: tabla + gráfico */
  function renderEventos(desglose) {
    const tbody = document.querySelector("#table-eventos tbody");
    if (!tbody) return;

    const labels = Object.keys(desglose);
    const values = Object.values(desglose);

    tbody.innerHTML = labels.map((ev, i) => `
      <tr>
        <td>${ev}</td>
        <td class="align-right fw-bold">${formatBs(values[i])}</td>
      </tr>`).join("");

    // Gráfico
    const ctx = document.getElementById("chart-eventos");
    if (!ctx) return;
    if (chartEventos) chartEventos.destroy();
    chartEventos = new Chart(ctx.getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Monto",
          data: values,
          backgroundColor: "rgba(59,130,246,.55)",
          borderColor: "#3b82f6",
          borderWidth: 1,
          borderRadius: 6,
        }],
      },
      options: chartOptions(v => formatBs(v)),
    });
  }

  /* ── Colegios: tabla + gráfico + sub-profesores */
  function renderColegios(colegios, filtro) {
    const tbody = document.getElementById("tbody-colegios");
    if (!tbody) return;

    const entries = Object.entries(colegios).filter(([key]) =>
      !filtro || key === filtro
    );

    const labelsChart = [];
    const valuesChart = [];

    tbody.innerHTML = "";

    entries.forEach(([key, info], idx) => {
      const nombre = info.nombre || key;
      const total  = info.total  || 0;
      const profs  = info.profesores || {};
      const hasProfs = Object.keys(profs).length > 0;

      labelsChart.push(nombre);
      valuesChart.push(total);

      // Fila principal
      const trMain = document.createElement("tr");
      trMain.dataset.colegio = key;
      trMain.innerHTML = `
        <td>${nombre}</td>
        <td class="align-right fw-bold">${formatBs(total)}</td>
        <td class="align-center">
          ${hasProfs
            ? `<button class="toggle-btn" data-idx="${idx}">Ver profesores ▾</button>`
            : `<span style="color:var(--text-muted);font-size:.8rem">—</span>`}
        </td>`;
      tbody.appendChild(trMain);

      // Fila sub-profesores
      if (hasProfs) {
        const trSub = document.createElement("tr");
        trSub.classList.add("prof-row");
        trSub.id = `prof-row-${idx}`;

        const profRows = Object.entries(profs).map(([p, m]) =>
          `<tr><td>👤 ${p}</td><td>${formatBs(m)}</td></tr>`
        ).join("");

        trSub.innerHTML = `
          <td colspan="3">
            <div class="prof-inner-wrap">
              <table class="prof-table">
                <tbody>${profRows}</tbody>
              </table>
            </div>
          </td>`;
        tbody.appendChild(trSub);

        // Toggle
        trMain.querySelector(".toggle-btn").addEventListener("click", function () {
          const sub = document.getElementById(`prof-row-${idx}`);
          const open = sub.classList.toggle("open");
          this.classList.toggle("open", open);
          this.textContent = open ? "Ocultar ▴" : "Ver profesores ▾";
        });
      }
    });

    // Gráfico colegios
    const ctx = document.getElementById("chart-colegios");
    if (!ctx) return;
    if (chartColegios) chartColegios.destroy();
    chartColegios = new Chart(ctx.getContext("2d"), {
      type: "bar",
      data: {
        labels: labelsChart,
        datasets: [{
          label: "Monto",
          data: valuesChart,
          backgroundColor: "rgba(16,185,129,.55)",
          borderColor: "#10b981",
          borderWidth: 1,
          borderRadius: 6,
        }],
      },
      options: chartOptions(v => formatBs(v)),
    });
  }

  /* ── Filtro por colegio */
  function renderColegioFilter(colegios) {
    const sel = document.getElementById("filter-colegio");
    if (!sel) return;

    sel.innerHTML = `<option value="">Todos los colegios</option>`;
    Object.entries(colegios).forEach(([key, info]) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = info.nombre || key;
      sel.appendChild(opt);
    });

    sel.onchange = () => {
      if (dashData) renderColegios(dashData.desgloseColegios || {}, sel.value);
    };
  }

  /* ── Opciones comunes de Chart.js (oscuro) */
  function chartOptions(tickFmt) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => " " + formatBs(ctx.parsed.y),
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#9ca3af", font: { size: 11 } },
          grid:  { color: "rgba(255,255,255,.06)" },
        },
        y: {
          beginAtZero: true,
          ticks: { color: "#9ca3af", font: { size: 11 }, callback: tickFmt },
          grid:  { color: "rgba(255,255,255,.06)" },
        },
      },
    };
  }

  // Botón de actualizar
  const btnRefresh = document.getElementById("btn-refresh-dashboard");
  if (btnRefresh) btnRefresh.addEventListener("click", loadDashboard);

  /* ────────────────────────────────────────────────────────
     5. REEMBOLSOS
  ──────────────────────────────────────────────────────── */

  const btnBuscarReemb  = document.getElementById("btn-buscar-reemb");
  const formReembolso   = document.getElementById("form-reembolso");

  if (btnBuscarReemb) {
    btnBuscarReemb.addEventListener("click", async () => {
      const ref = document.getElementById("reemb-ref").value.trim();
      if (ref.length !== 4) {
        showAlert("reemb-result", "warning", "⚠️", "Ingresa exactamente 4 dígitos.");
        return;
      }

      btnBuscarReemb.textContent = "Verificando…";
      btnBuscarReemb.disabled = true;
      formReembolso.style.display = "none";
      document.getElementById("reemb-result").innerHTML = "";

      try {
        const res  = await fetch(`${API_URL}?action=buscarRef&ref=${encodeURIComponent(ref)}`);
        const data = await res.json();

        if (data.status === "ya_asignado") {
          const a = data.alumno || {};
          _currentRef   = ref;
          _currentMonto = a.monto;
          showAlert("reemb-result", "success", "✅",
            `Pago conciliado encontrado. <strong>Nombre:</strong> ${a.Nombre || "—"} — <strong>Monto:</strong> ${formatBs(a.monto)}`);
          formReembolso.style.display = "block";
        } else if (data.status === "reembolsado") {
          showAlert("reemb-result", "danger", "❌", "Este pago ya fue reembolsado anteriormente.");
        } else if (data.status === "no_encontrado" || data.status === "ok") {
          showAlert("reemb-result", "warning", "🔍",
            "Referencia no conciliada — no se puede reembolsar aún.");
        } else {
          showAlert("reemb-result", "warning", "⚠️", "Respuesta inesperada.");
        }
      } catch (err) {
        console.error(err);
        showAlert("reemb-result", "danger", "🌐", "Error de conexión.");
      } finally {
        btnBuscarReemb.textContent = "Verificar";
        btnBuscarReemb.disabled = false;
      }
    });
  }

  const btnProcesarReemb = document.getElementById("btn-procesar-reemb");
  if (btnProcesarReemb) {
    btnProcesarReemb.addEventListener("click", async () => {
      const motivo = document.getElementById("reemb-motivo").value.trim() || "Cancelación";

      if (!confirm(`¿Confirmas el reembolso de la referencia ${_currentRef}?\nEsta acción no se puede deshacer.`)) return;

      btnProcesarReemb.textContent = "Procesando…";
      btnProcesarReemb.disabled = true;

      try {
        const params = new URLSearchParams({
          action: "reembolsar",
          ref: _currentRef,
          motivo,
          monto: _currentMonto,
        });

        const res  = await fetch(`${API_URL}?${params.toString()}`);
        const data = await res.json();

        if (data.status === "ok") {
          showAlert("reemb-result", "success", "🎉", "Reembolso procesado exitosamente.");
          formReembolso.style.display = "none";
          document.getElementById("reemb-ref").value = "";
          document.getElementById("reemb-motivo").value = "";
          _currentRef = null;
          _currentMonto = null;
        } else {
          showAlert("reemb-result", "danger", "⛔", "Error al procesar el reembolso.");
        }
      } catch (err) {
        console.error(err);
        showAlert("reemb-result", "danger", "🌐", "Error de conexión.");
      } finally {
        btnProcesarReemb.textContent = "⚠ Procesar Reembolso Definitivo";
        btnProcesarReemb.disabled = false;
      }
    });
  }

})();