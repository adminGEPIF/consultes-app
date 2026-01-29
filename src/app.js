require([
    "esri/config",
    "esri/intl",
    "esri/identity/OAuthInfo",
    "esri/identity/IdentityManager",
    "esri/layers/FeatureLayer"
], function(esriConfig, esriIntl, OAuthInfo, esriId, FeatureLayer) {

    // 1. Configurar idioma
    esriIntl.setLocale("ca");

    const CONFIG = {
        appId: "nqpbkytcOS0q53Ja",
        portalUrl: "https://www.arcgis.com", 
        // Capa de dades (Survey123)
        layerResultats: "https://services-eu1.arcgis.com/jukYmBukbIJBEB9m/arcgis/rest/services/survey123_4d92dc3fb88e4c2bb518a6399f049f08_form/FeatureServer/0",
        // Capa mestre per al selector
        layerMestre: "https://services-eu1.arcgis.com/jukYmBukbIJBEB9m/arcgis/rest/services/Vehicles_enViu/FeatureServer/0"
    };

    const info = new OAuthInfo({
        appId: CONFIG.appId,
        portalUrl: CONFIG.portalUrl,
        popup: false
    });
    esriId.registerOAuthInfos([info]);

    const views = {
        loading: document.getElementById("view-loading"),
        landing: document.getElementById("view-landing"),
        query: document.getElementById("view-query")
    };

    function showView(viewName) {
        Object.keys(views).forEach(key => {
            if(views[key]) views[key].classList.add("hidden");
        });
        if(views[viewName]) views[viewName].classList.remove("hidden");
    }

    // GESTIÓ D'IDENTITAT
    esriId.checkSignInStatus(CONFIG.portalUrl + "/sharing")
        .then(() => { showView('landing'); })
        .catch(() => { esriId.getCredential(CONFIG.portalUrl + "/sharing"); });

    const surveyLayer = new FeatureLayer({ url: CONFIG.layerResultats });
    const mestreLayer = new FeatureLayer({ url: CONFIG.layerMestre });

    // ESDEVENIMENTS
    document.getElementById("btn-select-vehicles").onclick = async () => {
        showView('query');
        setupDefaultFilters();
        await carregarSelectorMestre();
        executarConsulta();
    };

    document.getElementById("btn-back").onclick = () => showView('landing');
    document.getElementById("btn-refresh").onclick = executarConsulta;
    document.getElementById("btn-logout").onclick = () => {
        esriId.destroyCredentials();
        window.location.reload();
    };

    function setupDefaultFilters() {
        const fa7dies = new Date();
        fa7dies.setDate(fa7dies.getDate() - 7);
        const inputDate = document.getElementById("filter-date");
        if (inputDate && !inputDate.value) {
            inputDate.value = fa7dies.toISOString().split('T')[0];
        }
    }

    // OMPLIR SELECTOR DES DE CAPA MESTRE
    async function carregarSelectorMestre() {
        const selector = document.getElementById("select-vehicle-list");
        if (selector.childElementCount > 1) return;

        console.log("Obtenint vehicles de la capa mestre...");
        const query = mestreLayer.createQuery();
        query.where = "1=1";
        query.outFields = ["Codi_vehicle"];
        query.orderByFields = ["Codi_vehicle ASC"];
        query.returnGeometry = false;

        try {
            const res = await mestreLayer.queryFeatures(query);
            res.features.forEach(f => {
                const codi = f.attributes.Codi_vehicle;
                if (codi) {
                    const opt = document.createElement("calcite-option");
                    opt.value = codi;
                    opt.label = codi;
                    selector.appendChild(opt);
                }
            });
        } catch (e) {
            console.error("Error carregant mestre:", e);
        }
    }

    // CONSULTA PRINCIPAL
    async function executarConsulta() {
        const container = document.getElementById("results-container");
        const countLabel = document.getElementById("results-count");
        container.innerHTML = "<calcite-loader label='Actualitzant...'></calcite-loader>";
        
        const vehicleId = document.getElementById("select-vehicle-list").value;
        const dataInput = document.getElementById("filter-date").value;

        // SQL Dinàmic
        let conds = ["1=1"];
        if (dataInput) {
            // Per a camps de tipus Date en Hosted Services, el format timestamp és el més segur
            conds.push(`data >= timestamp '${dataInput} 00:00:00'`);
        }
        if (vehicleId && vehicleId !== "TOTS") {
            conds.push(`vehicle_gepif = '${vehicleId}'`);
        }

        const query = surveyLayer.createQuery();
        query.where = conds.join(" AND ");
        query.outFields = ["data", "vehicle_gepif", "quilometres_finals"];
        query.orderByFields = ["data DESC"]; // Ordenat de més nou a més antic
        query.returnGeometry = false;

        try {
            const res = await surveyLayer.queryFeatures(query);
            countLabel.innerText = `${res.features.length} registres trobats`;
            container.innerHTML = "";

            if (res.features.length === 0) {
                container.innerHTML = "<p style='text-align:center; padding:20px;'>No s'han trobat dades.</p>";
                return;
            }

            res.features.forEach(f => {
                const attr = f.attributes;
                
                // Formatar data
                const d = new Date(attr.data);
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
                        <span class="card-title">${attr.vehicle_gepif || '---'}</span>
                    </div>
                    <div class="card-body">
                        Km finals: <span class="km-badge">${attr.quilometres_finals || 0} km</span>
                    </div>
                `;
                container.appendChild(card);
            });
        } catch (e) {
            console.error("Error consulta:", e);
            container.innerHTML = `
                <calcite-notice open kind="danger">
                    <div slot="title">Error 400 o Permisos</div>
                    <div slot="message">SQL: ${query.where}</div>
                </calcite-notice>`;
        }
    }
});
