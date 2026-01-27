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
        layerUrl: "https://services-eu1.arcgis.com/jukYmBukbIJBEB9m/arcgis/rest/services/survey123_4d92dc3fb88e4c2bb518a6399f049f08_form/FeatureServer/0"
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
        Object.keys(views).forEach(key => views[key].classList.add("hidden"));
        views[viewName].classList.remove("hidden");
    }

    // LOGIN
    esriId.checkSignInStatus(CONFIG.portalUrl + "/sharing")
        .then(() => { showView('landing'); })
        .catch(() => { esriId.getCredential(CONFIG.portalUrl + "/sharing"); });

    const layerVehicles = new FeatureLayer({ url: CONFIG.layerUrl });

    // BOTONS
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

    function setupDefaultFilters() {
        if (!document.getElementById("filter-date").value) {
            const fa7dies = new Date();
            fa7dies.setDate(fa7dies.getDate() - 7);
            document.getElementById("filter-date").value = fa7dies.toISOString().split('T')[0];
        }
    }

    // CORREGIT: Funció per carregar vehicles en un calcite-select
    async function carregarUniqueVehicles() {
        const selector = document.getElementById("select-vehicle-list");
        
        // Comprovem si ja hem carregat els vehicles (si té més d'un fill)
        if (selector.childElementCount > 1) return;

        const query = layerVehicles.createQuery();
        query.where = "vehicle_gepif IS NOT NULL";
        query.outFields = ["vehicle_gepif"];
        query.returnDistinctValues = true;
        query.orderByFields = ["vehicle_gepif"];

        try {
            const res = await layerVehicles.queryFeatures(query);
            res.features.forEach(f => {
                const val = f.attributes.vehicle_gepif;
                if (val) {
                    const opt = document.createElement("calcite-option");
                    opt.value = val;
                    opt.label = val; // En Calcite s'usa label per al text visible
                    selector.appendChild(opt);
                }
            });
        } catch (e) {
            console.error("Error carregant llista de vehicles:", e);
        }
    }

    async function executarConsulta() {
        const container = document.getElementById("results-container");
        const countLabel = document.getElementById("results-count");
        
        container.innerHTML = "<calcite-loader label='Cercant...'></calcite-loader>";
        
        const vehicle = document.getElementById("select-vehicle-list").value;
        const dataInput = document.getElementById("filter-date").value;

        let condicions = ["1=1"];
        // Important: ArcGIS Online hosted layers necessiten format DATE 'YYYY-MM-DD'
        if (dataInput) condicions.push(`data >= DATE '${dataInput}'`);
        if (vehicle && vehicle !== "TOTS") condicions.push(`vehicle_gepif = '${vehicle}'`);

        const query = layerVehicles.createQuery();
        query.where = condicions.join(" AND ");
        query.outFields = ["data", "vehicle_gepif", "quilometres_finals"];
        query.orderByFields = ["data DESC"];

        try {
            const res = await layerVehicles.queryFeatures(query);
            countLabel.innerText = `${res.features.length} registres trobats`;
            container.innerHTML = "";

            if (res.features.length === 0) {
                container.innerHTML = "<calcite-notice open icon='沮喪'><div slot='message'>No hi ha dades per aquests filtres</div></calcite-notice>";
                return;
            }

            res.features.forEach(f => {
                const a = f.attributes;
                const d = new Date(a.data);
                const dataFmt = d.toLocaleDateString("ca-ES", {day:'2-digit', month:'2-digit', year:'numeric'});

                const card = document.createElement("div");
                card.className = "vehicle-card";
                card.innerHTML = `
                    <div class="card-header">
                        <span class="card-title">${a.vehicle_gepif || 'Sense ID'}</span>
                        <span class="card-date">${dataFmt}</span>
                    </div>
                    <div class="card-body">
                        Km finals: <span class="km-badge">${a.quilometres_finals || 0} km</span>
                    </div>
                `;
                container.appendChild(card);
            });
        } catch (e) {
            console.error("Error consulta:", e);
            container.innerHTML = "<p>Error de connexió. Revisa si la capa és pública o si tens permisos.</p>";
        }
    }
});
