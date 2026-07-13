// ------------------------------------------------
//  Conciliador Pro – Lógica del Frontend
// ------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    /* ---------- HELPERS ---------- */
    const showAlert = (containerId, type, message) => {
        const container = document.getElementById(containerId);
        container.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>`;
    };

    // Formatea número como moneda boliviana con separadores de miles
    const formatBs = amount => {
        return parseFloat(amount).toLocaleString('es-ES', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }) + ' Bs';
    };

    // Formatea fecha ISO → DD/MM/AAAA
    const formatDate = iso => {
        if (!iso) return '';
        const d = new Date(iso);
        const day   = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year  = d.getFullYear();
        return `${day}/${month}/${year}`;
    };

    /* ---------- BÚSQUEDA Y REGISTRO ---------- */
    document.getElementById("btn-buscar").addEventListener("click", async () => {
        const ref = document.getElementById("search-ref").value.trim();

        if (ref.length !== 4) {
            showAlert("search-result", "warning", "Ingresa exactamente 4 dígitos.");
            return;
        }
        if (API_URL.includes("URL_DE_TU_APPS_SCRIPT_AQUI")) {
            showAlert("search-result", "danger", "Configura la constant API_URL en index.html.");
            return;
        }

        document.getElementById("btn-buscar").innerText = "Buscando...";
        try {
            const res  = await fetch(`${API_URL}?action=buscarRef&ref=${ref}`);
            const data = await res.json();

            // ----- Respuestas del backend -----
            if (data.status === "reembolsado") {
                showAlert("search-result", "danger", "❌ Este pago ya fue REEMBOLSADO.");
                document.getElementById("form-registro").style.display = "none";
            } else if (data.status === "no_encontrado") {
                showAlert("search-result", "warning", "⚠️ Referencia no encontrada en el banco.");
                document.getElementById("form-registro").style.display = "none";
            } else if (data.status === "ya_asignado") {
                const alumno   = data.alumno;
                const fechaFmt = formatDate(alumno.fecha);
                showAlert("search-result", "info",
                    `ℹ️ Esta referencia ya está asignada a: <b>${alumno.Nombre}</b> — Monto: <b>${formatBs(alumno.monto)}</b> — Fecha del abono: <b>${fechaFmt}</b>`);
                document.getElementById("form-registro").style.display = "none";
            } else if (data.status === "ok") {
                const fechaFmt = formatDate(data.fecha);
                showAlert("search-result", "success",
                    `✅ Pago encontrado — Monto: <b>${formatBs(data.monto)}</b> — Fecha del abono: <b>${fechaFmt}</b>`);
                document.getElementById("form-registro").style.display = "block";
            } else {
                showAlert("search-result", "danger", "Respuesta inesperada del servidor.");
            }
        } catch (e) {
            showAlert("search-result", "danger", "Error de conexión con la API.");
        }
        document.getElementById("btn-buscar").innerText = "Buscar";
    });

    // ---- Guardar / Conciliar ----
    document.getElementById("btn-guardar").addEventListener("click", async () => {
        const ref      = document.getElementById("search-ref").value.trim();
        const tipo     = document.getElementById("reg-tipo").value;
        const fecha    = document.getElementById("reg-fecha").value;
        const colegio  = document.getElementById("reg-colegio").value;
        const profesor = document.getElementById("reg-profesor").value;
        const obs      = document.getElementById("reg-observacion").value;

        if (!tipo || !fecha) {
            alert("Los campos Tipo de Evento y Fecha del Evento son obligatorios.");
            return;
        }

        document.getElementById("btn-guardar").innerText = "Guardando...";
        try {
            const url = `${API_URL}?action=registrar&ref=${ref}`
                + `&tipo=${encodeURIComponent(tipo)}`
                + `&fecha=${encodeURIComponent(fecha)}`
                + `&colegio=${encodeURIComponent(colegio)}`
                + `&profesor=${encodeURIComponent(profesor)}`
                + `&observacion=${encodeURIComponent(obs)}`;

            const res  = await fetch(url);
            const data = await res.json();

            if (data.status === "ok") {
                alert("¡Registrado exitosamente!");
                // Reset UI
                document.getElementById("form-registro").style.display = "none";
                document.getElementById("search-ref").value = "";
                document.getElementById("reg-fecha").value = "";
                document.getElementById("reg-colegio").value = "";
                document.getElementById("reg-profesor").value = "";
                document.getElementById("reg-observacion").value = "";
                document.getElementById("search-result").innerHTML = "";
            } else {
                alert("Error al registrar: " + (data.message || "desconocido"));
            }
        } catch (e) {
            alert("Error de conexión con la API.");
        }
        document.getElementById("btn-guardar").innerText = "Guardar y Conciliar";
    });

    /* ---------- DASHBOARD ---------- */
    async function loadDashboard() {
        if (API_URL.includes("URL_DE_TU_APPS_SCRIPT_AQUI")) return;

        document.getElementById("kpi-ingresos").innerText = "...";
        document.getElementById("kpi-reembolsos").innerText = "...";
        document.getElementById("kpi-neto").innerText = "...";

        try {
            const res  = await fetch(`${API_URL}?action=getDashboard`);
            const data = await res.json();

            // ----- KPI (ya incluyen separadores de miles) -----
            document.getElementById("kpi-ingresos").innerText    = formatBs(data.ingresos);
            document.getElementById("kpi-reembolsos").innerText = formatBs(data.reembolsos);
            document.getElementById("kpi-neto").innerText      = formatBs(data.neto);

            // ----- Desglose por Evento -----
            const tbodyEventos = document.querySelector("#table-eventos tbody");
            tbodyEventos.innerHTML = "";
            for (const [evento, monto] of Object.entries(data.desglose)) {
                tbodyEventos.innerHTML += `<tr>
                    <td>${evento}</td>
                    <td class="text-end fw-bold">${formatBs(monto)}</td>
                </tr>`;
            }

            // ----- Desglose por Colegio (submenú de Profesores) -----
            const tbodyColegios = document.querySelector("#table-colegios tbody");
            tbodyColegios.innerHTML = "";
            let idx = 0;
            for (const [colegio, info] of Object.entries(data.desgloseColegios || {})) {
                const total = info.total || 0;
                const profs = info.profesores || {};

                tbodyColegios.innerHTML += `
                    <tr>
                        <td>${colegio}</td>
                        <td class="text-end fw-bold">${formatBs(total)}</td>
                        <td class="text-center">
                            <button class="btn btn-sm btn-outline-light"
                                    data-bs-toggle="collapse"
                                    data-bs-target="#prof-${idx}"
                                    aria-expanded="false"
                                    aria-controls="prof-${idx}">▶</button>
                        </td>
                    </tr>
                    <tr class="collapse" id="prof-${idx}">
                        <td colspan="3">
                            <table class="table table-sm table-dark mb-0">
                                <thead>
                                    <tr class="border-bottom border-secondary">
                                        <th>Profesor</th>
                                        <th class="text-end">Monto (Bs)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${Object.entries(profs).map(([prof, mnt]) => `
                                        <tr>
                                            <td>${prof}</td>
                                            <td class="text-end fw-bold">${formatBs(mnt)}</td>
                                        </tr>`).join("")}
                                </tbody>
                            </table>
                        </td>
                    </tr>`;
                idx++;
            }
        } catch (e) {
            console.error("Error al cargar el dashboard", e);
        }
    }

    document.getElementById("tab-dashboard").addEventListener("click", loadDashboard);
    document.getElementById("btn-refresh-dashboard").addEventListener("click", loadDashboard);

    /* ---------- REEMBOLSOS ---------- */
    document.getElementById("btn-buscar-reemb").addEventListener("click", async () => {
        const ref = document.getElementById("reemb-ref").value.trim();
        if (ref.length !== 4) return;

        document.getElementById("btn-buscar-reemb").innerText = "...";
        try {
            const res  = await fetch(`${API_URL}?action=buscarRef&ref=${ref}`);
            const data = await res.json();

            if (data.status === "ya_asignado") {
                showAlert("reemb-result", "success",
                    `Pago encontrado: <b>${data.alumno.Nombre}</b> — Monto: <b>${formatBs(data.alumno.monto)}</b>`);
                window.montoAReembolsar = data.alumno.monto;
                document.getElementById("form-reembolso").style.display = "block";
            } else if (data.status === "reembolsado") {
                showAlert("reemb-result", "danger", "Este pago ya fue reembolsado.");
                document.getElementById("form-reembolso").style.display = "none";
            } else {
                showAlert("reemb-result", "warning", "Referencia no conciliada – no se puede reembolsar.");
                document.getElementById("form-reembolso").style.display = "none";
            }
        } catch (e) {
            showAlert("reemb-result", "danger", "Error de conexión.");
        }
        document.getElementById("btn-buscar-reemb").innerText = "Verificar";
    });

    document.getElementById("btn-procesar-reemb").addEventListener("click", async () => {
        const ref    = document.getElementById("reemb-ref").value.trim();
        const motivo = document.getElementById("reemb-motivo").value || "Cancelación";

        if (!confirm(`¿Confirmas el reembolso de la referencia ${ref}?`)) return;

        document.getElementById("btn-procesar-reemb").innerText = "Procesando...";
        try {
            const res  = await fetch(`${API_URL}?action=reembolsar&ref=${ref}&motivo=${encodeURIComponent(motivo)}&monto=${window.montoAReembolsar}`);
            const data = await res.json();
            if (data.status === "ok") {
                alert("Reembolso procesado exitosamente.");
                document.getElementById("form-reembolso").style.display = "none";
                document.getElementById("reemb-ref").value = "";
                document.getElementById("reemb-motivo").value = "";
                document.getElementById("reemb-result").innerHTML = "";
            } else {
                alert("Error al procesar reembolso.");
            }
        } catch (e) {
            alert("Error de conexión.");
        }
        document.getElementById("btn-procesar-reemb").innerText = "Procesar Reembolso Definitivo";
    });
});