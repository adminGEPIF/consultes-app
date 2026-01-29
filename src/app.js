require([
    "esri/config",
    "esri/intl",
    "esri/identity/OAuthInfo",
    "esri/identity/IdentityManager",
    "esri/layers/FeatureLayer"
], function(esriConfig, esriIntl, OAuthInfo, esriId, FeatureLayer) {

    esriIntl.setLocale("ca");

    const CONFIG = {
        appId: "nqpbkytcOS0q53Ja",
        portalUrl: "https://www.arcgis.com", 
        layerResultats: "https://services-eu1.arcgis.com/jukYmBukbIJBEB9m/arcgis/rest/services/survey123_4d92dc3fb88e4c2bb518a6399f049f08_form/FeatureServer/0",
        layerMestre: "https://services-eu1.arcgis.com/jukYmBukbIJBEB9m/arcgis/rest/services/Vehicles_enViu/FeatureServer/0"
    };

    const info = new OAuthInfo({ appId: CONFIG.appId, portalUrl: CONFIG.portalUrl, popup: false });
    esriId.registerOAuthInfos([info]);

    const views = {
        loading: document.getElementById("view-loading"),
        landing: document.getElementById("view-landing"),
        query: document.getElementById("view-query")
    };

    function showView(viewName) {
        Object.keys(views).forEach(key => views[key].classList.add("hidden"));
        views[viewName].classList.remove("hidden");
    }

    esriId.checkSignInStatus(CONFIG.portalUrl + "/sharing").then(() => showView('landing')).catch(() => esriId.getCredential(CONFIG.portalUrl + "/sharing"));

    const surveyLayer = new FeatureLayer({ url: CONFIG.layerResultats });
    const mestreLayer = new FeatureLayer({ url: CONFIG.layerMestre });

    document.getElementById("btn-select-vehicles").onclick = async () => {
        showView('query');
        await carregarSelectorMestre();
        executarConsulta(); // Cridem a la consulta general
    };

    document.getElementById("btn-back").onclick = () => showView('landing');
    document.getElementById("btn-refresh").onclick = executarConsulta;
    document.getElementById("btn-logout").onclick = () => { esriId.destroyCredentials(); window.location.reload(); };

    async function carregarSelectorMestre() {
        const selector = document.getElementById("select-vehicle-list");
        if (selector.childElementCount > 1) return;
        try {
            const res = await mestreLayer.queryFeatures({ where: "1=1", outFields: ["Codi_vehicle"], orderByFields: ["Codi_vehicle ASC"] });
            res.features.forEach(f => {
                const opt = document.createElement("calcite-option");
                opt.value = f.attributes.Codi_vehicle;
                opt.label = f.attributes.Codi_vehicle;
                selector.appendChild(opt);
            });
        } catch (e) { console.error("Error mestre:", e); }
    }

    // --- CONSULTA DE DIAGNÒSTIC ---
    async function executarConsulta() {
        const container = document.getElementById("results-container");
        const countLabel = document.getElementById("results-count");
        container.innerHTML = "<calcite-loader label='Llegint format de dades...'></calcite-loader>";
        
        // FEM UNA CONSULTA SENSE FILTRES DE DATA PER VEURE QUÈ HI HA
        const query = surveyLayer.createQuery();
        query.where = "1=1"; // Cap filtre, ho volem tot per ara
        query.outFields = ["data", "vehicle_gepif", "quilometres_finals", "objectid"];
        query.orderByFields = ["data DESC"];
        query.num = 10; // Només els últims 10 registres

        try {
            const res = await surveyLayer.queryFeatures(query);
            countLabel.innerText = `Mode Diagnòstic: Mostrant últims ${res.features.length} registres`;
            container.innerHTML = "";

            if (res.features.length === 0) {
                container.innerHTML = "<p>La capa és buida o no tens permisos de lectura.</p>";
                return;
            }

            console.log("DADES RAW REBUDES DEL SERVIDOR:");
            
            res.features.forEach(f => {
                const a = f.attributes;
                
                // Analitzem el valor de 'data' a la consola
                console.log(`ID: ${a.objectid} | Valor camp 'data':`, a.data, typeof a.data);

                // Intentem convertir-la
                const d = new Date(a.data);
                const dataText = isNaN(d) ? `Error format (${a.data})` : d.toLocaleString("ca-ES");

                const card = document.createElement("div");
                card.className = "vehicle-card";
                card.style.borderLeft = "6px solid orange"; // Color per indicar mode diagnòstic
                card.innerHTML = `
                    <div class="card-header">
                        <span class="card-date"><b>${dataText}</b></span>
                        <span class="card-title">${a.vehicle_gepif || '---'}</span>
                    </div>
                    <div class="card-body">
                        Km: <b>${a.quilometres_finals || 0}</b><br>
                        <small style="color:blue">Valor RAW data: ${a.data}</small>
                    </div>
                `;
                container.appendChild(card);
            });

        } catch (e) {
            console.error("Error en diagnòstic:", e);
            container.innerHTML = `<div style="color:red; padding:20px;">
                <b>Error Crític en la consulta</b><br>
                Missatge: ${e.message}
            </div>`;
        }
    }
});
