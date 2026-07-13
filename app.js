document.addEventListener("DOMContentLoaded", () => {
    
    // Alertas Helper
    function showAlert(containerId, type, message) {
        const container = document.getElementById(containerId);
        container.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>`;
    }

    // Formatear moneda
    function formatBs(amount) {
        return parseFloat(amount).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Bs';
    }

    // --- BÚSQUEDA Y REGISTRO ---
    document.getElementById("btn-buscar").addEventListener("click", async () => {
        const ref = document.getElementById("search-ref").value;
        if (ref.length !== 4) {
            showAlert("search-result", "warning", "Por favor ingresa los últimos 4 dígitos.");
            return;
        }

        if (API_URL === "URL_DE_TU_APPS_SCRIPT_AQUI") {
            showAlert("search-result", "danger", "Falta configurar la API_URL en el index.html");
            return;
        }

        document.getElementById("btn-buscar").innerText = "Buscando...";
        try {
            const res = await fetch(`${API_URL}?action=buscarRef&ref=${ref}`);
            const data = await res.json();
            
            if (data.status === "reembolsado") {
                showAlert("search-result", "danger", "❌ Este pago ya fue REEMBOLSADO.");
                document.getElementById("form-registro").style.display = "none";
            } else if (data.status === "no_encontrado") {
                showAlert("search-result", "warning", "⚠️ Referencia no encontrada en el banco.");
                document.getElementById("form-registro").style.display = "none";
            } else if (data.status === "ya_asignado") {
                showAlert("search-result", "info", `ℹ️ Esta referencia ya está asignada al alumno: <b>${data.alumno.Nombre}</b>`);
                document.getElementById("form-registro").style.display = "none";
            } else if (data.status === "ok") {
                showAlert("search-result", "success", `✅ ¡Pago encontrado! Monto: <b>${formatBs(data.monto)}</b>`);
                document.getElementById("form-registro").style.display = "block";
            }
        } catch (e) {
            showAlert("search-result", "danger", "Error de conexión con Google Sheets.");
        }
        document.getElementById("btn-buscar").innerText = "Buscar";
    });

    document.getElementById("btn-guardar").addEventListener("click", async () => {
        const ref = document.getElementById("search-ref").value;
        const id = document.getElementById("reg-id").value;
        const nombre = document.getElementById("reg-nombre").value;
        const tipo = document.getElementById("reg-tipo").value;
        const fecha = document.getElementById("reg-fecha").value;
        const colegio = document.getElementById("reg-colegio").value;
        const profesor = document.getElementById("reg-profesor").value;

        if (!id || !nombre || !tipo) {
            alert("Completa los campos obligatorios (*)");
            return;
        }

        document.getElementById("btn-guardar").innerText = "Guardando...";
        try {
            const res = await fetch(`${API_URL}?action=registrar&ref=${ref}&id=${encodeURIComponent(id)}&nombre=${encodeURIComponent(nombre)}&tipo=${encodeURIComponent(tipo)}&fecha=${encodeURIComponent(fecha)}&colegio=${encodeURIComponent(colegio)}&profesor=${encodeURIComponent(profesor)}`);
            const data = await res.json();
            if (data.status === "ok") {
                alert("¡Registrado exitosamente!");
                document.getElementById("form-registro").style.display = "none";
                document.getElementById("search-ref").value = "";
                // Reset form
                document.getElementById("reg-id").value = "";
                document.getElementById("reg-nombre").value = "";
                document.getElementById("reg-fecha").value = "";
                document.getElementById("reg-colegio").value = "";
                document.getElementById("reg-profesor").value = "";
                document.getElementById("search-result").innerHTML = "";
            } else {
                alert("Error al registrar: " + data.message);
            }
        } catch (e) {
            alert("Error de conexión.");
        }
        document.getElementById("btn-guardar").innerText = "Guardar y Conciliar";
    });


    // --- DASHBOARD ---
    async function loadDashboard() {
        if (API_URL === "URL_DE_TU_APPS_SCRIPT_AQUI") return;
        
        document.getElementById("kpi-ingresos").innerText = "...";
        document.getElementById("kpi-reembolsos").innerText = "...";
        document.getElementById("kpi-neto").innerText = "...";
        
        try {
            const res = await fetch(`${API_URL}?action=getDashboard`);
            const data = await res.json();
            
            document.getElementById("kpi-ingresos").innerText = formatBs(data.ingresos);
            document.getElementById("kpi-reembolsos").innerText = formatBs(data.reembolsos);
            document.getElementById("kpi-neto").innerText = formatBs(data.neto);

            const tbodyEventos = document.querySelector("#table-eventos tbody");
            tbodyEventos.innerHTML = "";
            
            for (const [evento, monto] of Object.entries(data.desglose)) {
                tbodyEventos.innerHTML += `<tr>
                    <td>${evento}</td>
                    <td class="text-end fw-bold">${formatBs(monto)}</td>
                </tr>`;
            }

            const tbodyColegios = document.querySelector("#table-colegios tbody");
            if (tbodyColegios) {
                tbodyColegios.innerHTML = "";
                for (const [colegio, monto] of Object.entries(data.desgloseColegios || {})) {
                    if (colegio.trim() !== "") {
                        tbodyColegios.innerHTML += `<tr>
                            <td>${colegio}</td>
                            <td class="text-end fw-bold">${formatBs(monto)}</td>
                        </tr>`;
                    }
                }
            }
        } catch (e) {
            console.error("Error al cargar dashboard", e);
        }
    }

    document.getElementById("tab-dashboard").addEventListener("click", loadDashboard);
    document.getElementById("btn-refresh-dashboard").addEventListener("click", loadDashboard);


    // --- REEMBOLSOS ---
    let montoAReembolsar = 0;
    document.getElementById("btn-buscar-reemb").addEventListener("click", async () => {
        const ref = document.getElementById("reemb-ref").value;
        if (ref.length !== 4) return;

        document.getElementById("btn-buscar-reemb").innerText = "...";
        try {
            // Reutiliza el buscar, pero verifica que sí exista en Registro (Conciliado)
            const res = await fetch(`${API_URL}?action=buscarRef&ref=${ref}`);
            const data = await res.json();
            
            if (data.status === "ya_asignado") {
                showAlert("reemb-result", "success", `Pago encontrado: <b>${data.alumno.Nombre}</b> (${formatBs(data.alumno.monto)})`);
                montoAReembolsar = data.alumno.monto;
                document.getElementById("form-reembolso").style.display = "block";
            } else if (data.status === "reembolsado") {
                showAlert("reemb-result", "danger", "Este pago ya fue reembolsado.");
                document.getElementById("form-reembolso").style.display = "none";
            } else {
                showAlert("reemb-result", "warning", "Esta referencia no ha sido conciliada (No se puede reembolsar).");
                document.getElementById("form-reembolso").style.display = "none";
            }
        } catch (e) {
            showAlert("reemb-result", "danger", "Error de conexión.");
        }
        document.getElementById("btn-buscar-reemb").innerText = "Verificar";
    });

    document.getElementById("btn-procesar-reemb").addEventListener("click", async () => {
        const ref = document.getElementById("reemb-ref").value;
        const motivo = document.getElementById("reemb-motivo").value || "Cancelación";
        
        if (!confirm(`¿Estás seguro de reembolsar la ref ${ref}?`)) return;

        document.getElementById("btn-procesar-reemb").innerText = "Procesando...";
        try {
            const res = await fetch(`${API_URL}?action=reembolsar&ref=${ref}&motivo=${encodeURIComponent(motivo)}&monto=${montoAReembolsar}`);
            const data = await res.json();
            if (data.status === "ok") {
                alert("Reembolso procesado exitosamente.");
                document.getElementById("form-reembolso").style.display = "none";
                document.getElementById("reemb-ref").value = "";
                document.getElementById("reemb-motivo").value = "";
                document.getElementById("reemb-result").innerHTML = "";
            }
        } catch (e) {
            alert("Error al reembolsar.");
        }
        document.getElementById("btn-procesar-reemb").innerText = "Procesar Reembolso Definitivo";
    });

});
