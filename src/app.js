require([
    "esri/config",
    "esri/intl",
    "esri/identity/OAuthInfo",
    "esri/identity/IdentityManager",
    "esri/layers/FeatureLayer"
], function(esriConfig, esriIntl, OAuthInfo, esriId, FeatureLayer) {

    // 1. Configuració bàsica
    esriIntl.setLocale("ca");

    const CONFIG = {
        appId: "nqpbkytcOS0q53Ja",
        portalUrl: "https://www.arcgis.com", 
        // Capa on hi ha les dades (Survey123)
        layerResultats: "https://services-eu1.arcgis.com/jukYmBukbIJBEB9m/arcgis/rest/services/survey123_4d92dc3fb88e4c2bb518a6399f049f08_form/FeatureServer/0",
        // Capa per omplir el selector (Vehicles_enViu)
        layerMestre: "https://services-eu1.arcgis.com/jukYmBukbIJBEB9m/arcgis/rest/services/Vehicles_enViu/FeatureServer/0"
    };

    // 2. Autenticació
    const info = new OAuthInfo({ appId: CONFIG.appId, portalUrl: CONFIG.portalUrl, popup: false });
    esriId.registerOAuthInfos([info]);

    // 3. Gestió de Vistes
    const views = {
        loading: document.getElementById("view-loading"),
        landing: document.getElementById("view-landing"),
        query: document.getElementById("view-query")
    };

    function showView(viewName) {
        Object.keys(views).forEach(key => views[key].classList.add("hidden"));
        views[viewName].classList.remove("hidden");
    }

    // Comprovació d'inici de sessió
    esriId.checkSignInStatus(CONFIG.portalUrl + "/sharing")
        .then(() => showView('landing'))
        .catch(() => esriId.getCredential(CONFIG.portalUrl + "/sharing"));

    // 4. Definició de Capes
    const surveyLayer = new FeatureLayer({ url: CONFIG.layerResultats });
    const mestreLayer = new FeatureLayer({ url: CONFIG.layerMestre });

    // 5. Botons i Esdeveniments
    document.getElementById("btn-select-vehicles").onclick = async () => {
        showView('query');
        await carregarSelectorMestre();
        executarConsulta(); // Consulta automàtica en entrar
    };

    document.getElementById("btn-back").onclick = () => showView('landing');
    document.getElementById("btn-refresh").onclick = executarConsulta;
    document.getElementById("btn-logout").onclick = () => { esriId.destroyCredentials(); window.location.reload(); };

    // 6. Funcions Principals

    async function carregarSelectorMestre() {
        const selector = document.getElementById("select-vehicle-list");
        if (selector.childElementCount > 1) return;

        try {
            const res = await mestreLayer.queryFeatures({ 
                where: "1=1", 
                outFields: ["Codi_vehicle"], 
                orderByFields: ["Codi_vehicle ASC"] 
            });
            
            res.features.forEach(f => {
                const codi = f.attributes.Codi_vehicle;
                if (codi) {
                    const opt = document.createElement("calcite-option");
                    opt.value = codi;
                    opt.label = codi;
                    selector.appendChild(opt);
                }
            });
        } catch (e) { console.error("Error carregant llista vehicles:", e); }
    }

    async function executarConsulta() {
        const container = document.getElementById("results-container");
        const countLabel = document.getElementById("results-count");
        container.innerHTML = "<calcite-loader label='Carregant dades...'></calcite-loader>";
        
        const vehicleId = document.getElementById("select-vehicle-list").value;

        // --- CONFIGURACIÓ DE LA CONSULTA ---
        const query = surveyLayer.createQuery();
        
        // Si hi ha un vehicle seleccionat, filtrem per vehicle. Si no, ho portem tot (1=1).
        if (vehicleId && vehicleId !== "TOTS") {
            query.where = `vehicle_gepif = '${vehicleId}'`;
        } else {
            query.where = "1=1";
        }

        query.outFields = ["data", "vehicle_gepif", "quilometres_finals"];
        query.orderByFields = ["data DESC"]; // Ordenat del més nou al més antic
        query.num = 30; // LIMIT: Només els últims 30 registres

        try {
            const res = await surveyLayer.queryFeatures(query);
            countLabel.innerText = `Mostrant els darrers ${res.features.length} registres`;
            container.innerHTML = "";

            if (res.features.length === 0) {
                container.innerHTML = "<p style='text-align:center; padding:20px;'>No hi ha registres disponibles.</p>";
                return;
            }

            res.features.forEach(f => {
                const a = f.attributes;
                const d = new Date(a.data);
                
                // Format de data en català (dd/mm/aaaa)
                const dataFmt = isNaN(d) ? "Sense data" : d.toLocaleDateString("ca-ES", {
                    day: '2-digit', 
                    month: '2-digit', 
                    year: 'numeric'
                });

                const card = document.createElement("div");
                card.className = "vehicle-card";
                card.innerHTML = `
                    <div class="card-header">
                        <span class="card-date"><b>${dataFmt}</b></span>
                        <span class="card-title">${a.vehicle_gepif || 'Desconegut'}</span>
                    </div>
                    <div class="card-body">
                        Km finals: <span class="km-badge">${a.quilometres_finals || 0} km</span>
                    </div>
                `;
                container.appendChild(card);
            });
        } catch (e) {
            console.error("Error:", e);
            container.innerHTML = `<div style="color:red; padding:20px;">
                <b>Error de connexió</b><br>
                Revisa els permisos de la capa o la connexió a internet.
            </div>`;
        }
    }
});
