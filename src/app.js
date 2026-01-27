require([
    "esri/identity/OAuthInfo",
    "esri/identity/IdentityManager",
    "esri/layers/FeatureLayer"
], function(OAuthInfo, esriId, FeatureLayer) {

    // Configuració
    const CONFIG = {
        appId: "nqpbkytcOS0q53Ja",
        layerUrl: "https://services-eu1.arcgis.com/jukYmBukbIJBEB9m/arcgis/rest/services/survey123_4d92dc3fb88e4c2bb518a6399f049f08_form/FeatureServer/0",
        portalUrl: "https://arcgis.com"
    };

    // OAuth
    const info = new OAuthInfo({
        appId: CONFIG.appId,
        popup: false,
        portalUrl: CONFIG.portalUrl
    });
    esriId.registerOAuthInfos([info]);

    // DOM Elements
    const views = {
        loading: document.getElementById("view-loading"),
        landing: document.getElementById("view-landing"),
        query: document.getElementById("view-query")
    };

    // Autenticació automàtica al carregar
    esriId.checkSignInStatus(CONFIG.portalUrl + "/sharing")
        .then(() => { showView('landing'); })
        .catch(() => { esriId.getCredential(CONFIG.portalUrl + "/sharing"); });

    // Funció per canviar de vista
    function showView(viewName) {
        Object.keys(views).forEach(key => views[key].classList.add("hidden"));
        views[viewName].classList.remove("hidden");
    }

    // Inicialització de la capa de Vehicles
    const layerVehicles = new FeatureLayer({ url: CONFIG.layerUrl });

    // --- ESDEVENIMENTS ---

    document.getElementById("btn-select-vehicles").onclick = async () => {
        showView('query');
        setupDefaultFilters();
        await carregarUniqueVehicles();
        executarConsulta();
    };

    document.getElementById("btn-back").onclick = () => showView('landing');

    document.getElementById("btn-refresh").onclick = executarConsulta;

    document.getElementById("btn-logout").onclick = () => {
        esriId.destroyCredentials();
        window.location.reload();
    };

    // --- LÒGICA DE DADES ---

    function setupDefaultFilters() {
        const fa7dies = new Date();
        fa7dies.setDate(fa7dies.getDate() - 7);
        document.getElementById("filter-date").value = fa7dies.toISOString().split('T')[0];
    }

    async function carregarUniqueVehicles() {
        const selector = document.getElementById("select-vehicle-list");
        // Si ja té opcions (més de la de "Tots"), no tornem a carregar
        if (selector.options.length > 1) return;

        const query = layerVehicles.createQuery();
        query.where = "1=1";
        query.outFields = ["vehicle_gepif"];
        query.returnDistinctValues = true;
        query.orderByFields = ["vehicle_gepif"];

        try {
            const res = await layerVehicles.queryFeatures(query);
            res.features.forEach(f => {
                const val = f.attributes.vehicle_gepif;
                if (val) {
                    const opt = document.createElement("option");
                    opt.value = val;
                    opt.textContent = val;
                    selector.appendChild(opt);
                }
            });
        } catch (e) { console.error("Error carregar selectors", e); }
    }

    async function executarConsulta() {
        const container = document.getElementById("results-container");
        const countLabel = document.getElementById("results-count");
        
        container.innerHTML = "<calcite-loader label='Cercant...'></calcite-loader>";
        
        const vehicle = document.getElementById("select-vehicle-list").value;
        const data = document.getElementById("filter-date").value;

        let condicions = ["1=1"];
        if (data) condicions.push(`data >= DATE '${data}'`);
        if (vehicle !== "TOTS") condicions.push(`vehicle_gepif = '${vehicle}'`);

        const query = layerVehicles.createQuery();
        query.where = condicions.join(" AND ");
        query.outFields = ["data", "vehicle_gepif", "quilometres_finals"];
        query.orderByFields = ["data DESC"];

        try {
            const res = await layerVehicles.queryFeatures(query);
            countLabel.innerText = `${res.features.length} registres trobats`;
            container.innerHTML = "";

            if (res.features.length === 0) {
                container.innerHTML = "<p style='text-align:center; padding:20px;'>No hi ha dades per aquests filtres.</p>";
                return;
            }

            res.features.forEach(f => {
                const attr = f.attributes;
                const dataFmt = new Date(attr.data).toLocaleDateString("ca-ES", {
                    day: '2-digit', month: 'short', year: 'numeric'
                });

                const card = document.createElement("div");
                card.className = "vehicle-card";
                card.innerHTML = `
                    <div class="card-header">
                        <span class="card-title">${attr.vehicle_gepif || 'Sense ID'}</span>
                        <span class="card-date">${dataFmt}</span>
                    </div>
                    <div class="card-body">
                        Quilòmetres finals: <span class="km-badge">${attr.quilometres_finals || 0} km</span>
                    </div>
                `;
                container.appendChild(card);
            });
        } catch (e) {
            container.innerHTML = "<p>Error consultant dades.</p>";
        }
    }
});
