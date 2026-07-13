/* ═══════════════════════════════════════════════════════
   Conciliador Pro — app.js
   Sin gráficos. Lógica correcta basada en:
     • Banco        col A=Fecha B=Ref(4dig) C=Tipo D=Desc E=Monto
     • Reg_Eventos  col A=Ref B='' C='' D=Tipo E=Fecha F=Colegio G=Profesor H=Obs
     • Reembolsos   col A=Fecha B=Ref C=Monto D=Motivo
═══════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ────────────────────────────────────────────────────
     HELPERS
  ──────────────────────────────────────────────────── */

  /**
   * Muestra un alert dentro de un contenedor.
   * @param {string} id        – id del contenedor
   * @param {string} type      – success | danger | warning | info
   * @param {string} icon      – emoji
   * @param {string} html      – contenido HTML del mensaje
   */
  function showAlert(id, type, icon, html) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `<div class="alert alert-${type}">
      <span class="alert-icon">${icon}</span>
      <div>${html}</div>
    </div>`;
  }

  function clearAlert(id) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  }

  /**
   * Formatea un número como moneda boliviana.
   * Ej: 1234.5 → "1.234,50 Bs"
   */
  function formatBs(val) {
    const n = parseFloat(val) || 0;
    return n.toLocaleString("es-BO", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " Bs";
  }

  /**
   * Convierte cualquier valor de fecha devuelto por Sheets a "DD/MM/AAAA".
   * Maneja ISO strings, objetos Date, y cadenas de Sheets como "/Date(...)/" .
   */
  function formatDate(raw) {
    if (!raw) return "—";
    const d = new Date(raw);
    if (isNaN(d.getTime())) return String(raw);
    const dd   = String(d.getUTCDate()).padStart(2, "0");
    const mm   = String(d.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = d.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  /* Estado de búsqueda activa */
  let _ref   = null;   // referencia actualmente buscada
  let _monto = null;   // monto para reembolso

  /* ────────────────────────────────────────────────────
     NAVEGACIÓN (Sidebar)
  ──────────────────────────────────────────────────── */
  const TITLES = {
    "panel-registro"   : "Búsqueda y Registro",
    "panel-dashboard"  : "Dashboard",
    "panel-reembolsos" : "Reembolsos",
  };

  function switchPanel(panelId) {
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));

    const panel = document.getElementById(panelId);
    if (panel) panel.classList.add("active");

    // Buscar el nav-item que tiene data-panel igual
    const nav = document.querySelector(`.nav-item[data-panel="${panelId}"]`);
    if (nav) nav.classList.add("active");

    const titleEl = document.getElementById("topbar-title");
    if (titleEl) titleEl.textContent = TITLES[panelId] || "";

    const btnRefresh = document.getElementById("btn-refresh-dashboard");
    if (btnRefresh) btnRefresh.style.display = panelId === "panel-dashboard" ? "" : "none";

    if (panelId === "panel-dashboard") loadDashboard();

    // Cierra sidebar en móvil
    document.getElementById("sidebar").classList.remove("open");
  }

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => switchPanel(btn.dataset.panel));
  });

  const hamburger = document.getElementById("btn-hamburger");
  if (hamburger) {
    hamburger.addEventListener("click", () => {
      document.getElementById("sidebar").classList.toggle("open");
    });
  }

  /* ────────────────────────────────────────────────────
     BÚSQUEDA Y REGISTRO
  ──────────────────────────────────────────────────── */
  const btnBuscar    = document.getElementById("btn-buscar");
  const formRegistro = document.getElementById("form-registro");

  btnBuscar && btnBuscar.addEventListener("click", async () => {
    const ref = document.getElementById("search-ref").value.trim();

    if (!/^\d{6}$/.test(ref)) {
      showAlert("search-result", "warning", "⚠️",
        "Ingresa exactamente <strong>6 dígitos</strong> de la referencia.");
      return;
    }

    btnBuscar.textContent = "Buscando…";
    btnBuscar.disabled = true;
    formRegistro.style.display = "none";
    clearAlert("search-result");

    try {
      const res  = await fetch(`${API_URL}?action=buscarRef&ref=${encodeURIComponent(ref)}`);
      const data = await res.json();
      _ref = ref;

      switch (data.status) {

        case "reembolsado":
          showAlert("search-result", "danger", "❌",
            "Este pago ya fue <strong>REEMBOLSADO</strong> anteriormente.");
          break;

        case "no_encontrado":
          showAlert("search-result", "warning", "🔍",
            "Referencia <strong>no encontrada</strong> en la hoja Banco. Verifica los dígitos.");
          break;

        case "ya_asignado": {
          const a = data.alumno || {};
          showAlert("search-result", "info", "ℹ️",
            `Esta referencia ya fue conciliada.<br>
             <strong>Monto:</strong> ${formatBs(a.monto)} &nbsp;|&nbsp;
             <strong>Fecha abono:</strong> ${formatDate(a.fecha)}`);
          break;
        }

        case "ok":
          _monto = data.monto;
          showAlert("search-result", "success", "✅",
            `Pago encontrado. &nbsp;
             <strong>Monto:</strong> ${formatBs(data.monto)} &nbsp;|&nbsp;
             <strong>Fecha abono:</strong> ${formatDate(data.fecha)}`);
          formRegistro.style.display = "block";
          break;

        default:
          showAlert("search-result", "danger", "⛔",
            "Respuesta inesperada del servidor: " + JSON.stringify(data));
      }

    } catch (err) {
      console.error(err);
      showAlert("search-result", "danger", "🌐",
        "Error de conexión con la API. Intenta nuevamente.");
    } finally {
      btnBuscar.textContent = "Buscar";
      btnBuscar.disabled = false;
    }
  });

  /* ── Guardar y Conciliar ── */
  const btnGuardar = document.getElementById("btn-guardar");

  btnGuardar && btnGuardar.addEventListener("click", async () => {
    const tipo     = document.getElementById("reg-tipo").value.trim();
    const fecha    = document.getElementById("reg-fecha").value.trim();
    const colegio  = document.getElementById("reg-colegio").value.trim();
    const profesor = document.getElementById("reg-profesor").value.trim();
    const obs      = document.getElementById("reg-observacion").value.trim();

    if (!tipo) {
      showAlert("search-result", "warning", "⚠️",
        "El campo <strong>Tipo de Evento</strong> es obligatorio.");
      return;
    }

    btnGuardar.textContent = "Guardando…";
    btnGuardar.disabled = true;

    try {
      const params = new URLSearchParams({
        action: "registrar",
        ref: _ref,
        tipo,
        fecha,
        colegio,
        profesor,
        observacion: obs,
      });

      const res  = await fetch(`${API_URL}?${params}`);
      const data = await res.json();

      if (data.status === "ok") {
        showAlert("search-result", "success", "🎉",
          `¡Conciliación guardada exitosamente! (Ref: ${_ref})`);
        formRegistro.style.display = "none";
        // Limpiar campos
        ["search-ref","reg-fecha","reg-colegio","reg-profesor","reg-observacion"].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = "";
        });
        document.getElementById("reg-tipo").selectedIndex = 0;
        _ref = null;
      } else {
        showAlert("search-result", "danger", "⛔",
          "Error al guardar: " + (data.error || data.message || "respuesta desconocida"));
      }

    } catch (err) {
      console.error(err);
      showAlert("search-result", "danger", "🌐", "Error de conexión con la API.");
    } finally {
      btnGuardar.textContent = "✔ Guardar y Conciliar";
      btnGuardar.disabled = false;
    }
  });

  /* ────────────────────────────────────────────────────
     DASHBOARD
  ──────────────────────────────────────────────────── */
  async function loadDashboard() {
    // Estado de carga
    ["kpi-ingresos","kpi-reembolsos","kpi-neto"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = "Cargando…";
    });

    try {
      const res  = await fetch(`${API_URL}?action=getDashboard`);
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      /* ── KPIs ── */
      document.getElementById("kpi-ingresos").textContent   = formatBs(data.ingresos);
      document.getElementById("kpi-reembolsos").textContent = formatBs(data.reembolsos);
      document.getElementById("kpi-neto").textContent       = formatBs(data.neto);

      /* ── Tabla de Eventos ── */
      renderTablaEventos(data.desglose || {});

      /* ── Tabla de Colegios ── */
      const colegios = data.desgloseColegios || {};
      llenarFiltroColegios(colegios);
      renderTablaColegios(colegios, "");

    } catch (err) {
      console.error("Dashboard error:", err);
      ["kpi-ingresos","kpi-reembolsos","kpi-neto"].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.textContent = "Error"; el.style.color = "var(--red)"; }
      });
    }
  }

  /* ── Tabla Eventos ── */
  function renderTablaEventos(desglose) {
    const tbody = document.querySelector("#table-eventos tbody");
    const empty = document.getElementById("empty-eventos");
    if (!tbody) return;

    const entries = Object.entries(desglose);
    if (entries.length === 0) {
      tbody.innerHTML = "";
      if (empty) empty.style.display = "";
      return;
    }
    if (empty) empty.style.display = "none";

    tbody.innerHTML = entries
      .sort((a, b) => b[1] - a[1])   // mayor a menor
      .map(([evento, monto]) => `
        <tr>
          <td>${evento}</td>
          <td class="align-right fw-bold">${formatBs(monto)}</td>
        </tr>`)
      .join("");
  }

  /* ── Tabla Colegios con sub-profesores ── */
  function renderTablaColegios(colegios, filtro) {
    const tbody = document.getElementById("tbody-colegios");
    const empty = document.getElementById("empty-colegios");
    if (!tbody) return;

    const entries = Object.entries(colegios).filter(([key]) =>
      !filtro || key === filtro
    );

    if (entries.length === 0) {
      tbody.innerHTML = "";
      if (empty) empty.style.display = "";
      return;
    }
    if (empty) empty.style.display = "none";

    tbody.innerHTML = "";

    entries
      .sort((a, b) => (b[1].total || 0) - (a[1].total || 0))
      .forEach(([key, info], idx) => {
        const nombre  = info.nombre || key;
        const total   = info.total  || 0;
        const profs   = info.profesores || {};
        const hasProfs = Object.keys(profs).length > 0;

        /* Fila principal */
        const trMain = document.createElement("tr");
        trMain.dataset.colegio = key;
        trMain.innerHTML = `
          <td>${nombre}</td>
          <td class="align-right fw-bold">${formatBs(total)}</td>
          <td class="align-center">
            ${hasProfs
              ? `<button class="toggle-btn" data-target="prof-${idx}">Ver ▾</button>`
              : `<span style="color:var(--text-muted)">—</span>`}
          </td>`;
        tbody.appendChild(trMain);

        /* Fila sub-profesores */
        if (hasProfs) {
          const trSub = document.createElement("tr");
          trSub.classList.add("prof-subrow");
          trSub.id = `prof-${idx}`;

          const rows = Object.entries(profs)
            .sort((a, b) => b[1] - a[1])
            .map(([p, m]) => `<tr><td>👤 ${p}</td><td>${formatBs(m)}</td></tr>`)
            .join("");

          trSub.innerHTML = `
            <td colspan="3">
              <div class="prof-inner">
                <table><tbody>${rows}</tbody></table>
              </div>
            </td>`;
          tbody.appendChild(trSub);

          /* Toggle */
          trMain.querySelector(".toggle-btn").addEventListener("click", function () {
            const sub  = document.getElementById(this.dataset.target);
            const open = sub.classList.toggle("open");
            this.classList.toggle("open", open);
            this.textContent = open ? "Ocultar ▴" : "Ver ▾";
          });
        }
      });
  }

  /* ── Filtro de colegios ── */
  function llenarFiltroColegios(colegios) {
    const sel = document.getElementById("filter-colegio");
    if (!sel) return;
    sel.innerHTML = `<option value="">Todos los colegios</option>`;
    Object.entries(colegios).forEach(([key, info]) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = info.nombre || key;
      sel.appendChild(opt);
    });
    // Guardamos referencia para el filtro
    sel._colegios = colegios;
    sel.onchange = () => renderTablaColegios(sel._colegios, sel.value);
  }

  /* Botón refrescar */
  const btnRefresh = document.getElementById("btn-refresh-dashboard");
  if (btnRefresh) btnRefresh.addEventListener("click", loadDashboard);

  /* ────────────────────────────────────────────────────
     REEMBOLSOS
  ──────────────────────────────────────────────────── */
  const btnBuscarReemb = document.getElementById("btn-buscar-reemb");
  const formReembolso  = document.getElementById("form-reembolso");

  btnBuscarReemb && btnBuscarReemb.addEventListener("click", async () => {
    const ref = document.getElementById("reemb-ref").value.trim();

    if (!/^\d{6}$/.test(ref)) {
      showAlert("reemb-result", "warning", "⚠️",
        "Ingresa exactamente <strong>6 dígitos</strong>.");
      return;
    }

    btnBuscarReemb.textContent = "Verificando…";
    btnBuscarReemb.disabled = true;
    formReembolso.style.display = "none";
    clearAlert("reemb-result");

    try {
      const res  = await fetch(`${API_URL}?action=buscarRef&ref=${encodeURIComponent(ref)}`);
      const data = await res.json();

      if (data.status === "ya_asignado") {
        const a = data.alumno || {};
        _ref   = ref;
        _monto = a.monto;
        showAlert("reemb-result", "success", "✅",
          `Pago conciliado encontrado.<br>
           <strong>Monto:</strong> ${formatBs(a.monto)} &nbsp;|&nbsp;
           <strong>Fecha abono:</strong> ${formatDate(a.fecha)}`);
        formReembolso.style.display = "block";

      } else if (data.status === "reembolsado") {
        showAlert("reemb-result", "danger", "❌",
          "Este pago ya fue reembolsado anteriormente.");

      } else if (data.status === "ok") {
        showAlert("reemb-result", "warning", "⚠️",
          "Esta referencia existe en el banco pero <strong>aún no está conciliada</strong>. No se puede reembolsar.");

      } else if (data.status === "no_encontrado") {
        showAlert("reemb-result", "warning", "🔍",
          "Referencia no encontrada en la hoja Banco.");

      } else {
        showAlert("reemb-result", "warning", "⚠️", "Respuesta inesperada.");
      }

    } catch (err) {
      console.error(err);
      showAlert("reemb-result", "danger", "🌐", "Error de conexión con la API.");
    } finally {
      btnBuscarReemb.textContent = "Verificar";
      btnBuscarReemb.disabled = false;
    }
  });

  const btnProcesar = document.getElementById("btn-procesar-reemb");

  btnProcesar && btnProcesar.addEventListener("click", async () => {
    const motivo = document.getElementById("reemb-motivo").value.trim() || "Cancelación";

    if (!confirm(
      `¿Confirmas el reembolso de la referencia "${_ref}"?\n` +
      `Monto: ${formatBs(_monto)}\n\nEsta acción no se puede deshacer.`
    )) return;

    btnProcesar.textContent = "Procesando…";
    btnProcesar.disabled = true;

    try {
      const params = new URLSearchParams({
        action: "reembolsar",
        ref:    _ref,
        monto:  _monto,
        motivo,
      });

      const res  = await fetch(`${API_URL}?${params}`);
      const data = await res.json();

      if (data.status === "ok") {
        showAlert("reemb-result", "success", "🎉",
          `Reembolso de la referencia <strong>${_ref}</strong> procesado exitosamente.`);
        formReembolso.style.display = "none";
        document.getElementById("reemb-ref").value = "";
        document.getElementById("reemb-motivo").value = "";
        _ref = null; _monto = null;
      } else {
        showAlert("reemb-result", "danger", "⛔",
          "Error al procesar: " + (data.error || "desconocido"));
      }

    } catch (err) {
      console.error(err);
      showAlert("reemb-result", "danger", "🌐", "Error de conexión.");
    } finally {
      btnProcesar.textContent = "⚠ Procesar Reembolso Definitivo";
      btnProcesar.disabled = false;
    }
  });

})();