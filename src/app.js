require([
    "esri/config",
    "esri/intl",
    "esri/identity/OAuthInfo",
    "esri/identity/IdentityManager",
    "esri/layers/FeatureLayer"
], function(esriConfig, esriIntl, OAuthInfo, esriId, FeatureLayer) {

    // 1. IDIOMA EN CATALÀ
    esriIntl.setLocale("ca");
    console.log("Idioma configurat: Català");

    const CONFIG = {
        appId: "nqpbkytcOS0q53Ja",
        // Nota: He usat la URL base del teu portal (services-eu1) per a l'autenticació
        portalUrl: "https://www.arcgis.com", 
        layerUrl: "https://services-eu1.arcgis.com/jukYmBukbIJBEB9m/arcgis/rest/services/survey123_4d92dc3fb88e4c2bb518a6399f049f08_form/FeatureServer/0"
    };

    const info = new OAuthInfo({
        appId: CONFIG.appId,
        portalUrl: CONFIG.portalUrl,
        popup: false // Redirecció completa (millor per a mòbils)
    });

    esriId.registerOAuthInfos([info]);

    // GESTIÓ DE VISTES
    const views = {
        loading: document.getElementById("view-loading"),
        landing: document.getElementById("view-landing"),
        query: document.getElementById("view-query")
    };

    function showView(viewName) {
        console.log("Canviant a vista:", viewName);
        Object.keys(views).forEach(key => {
            if (views[key]) views[key].classList.add("hidden");
        });
        if (views[viewName]) views[viewName].classList.remove("hidden");
    }

    // --- PROCES D'AUTENTICACIÓ ---
    console.log("Comprovant estat de la sessió...");
    
    esriId.checkSignInStatus(CONFIG.portalUrl + "/sharing")
        .then(() => {
            console.log("Sessió trobada!");
            showView('landing');
        })
        .catch(() => {
            console.log("No s'ha trobat sessió. Redirigint a login d'ArcGIS...");
            // Si no hi ha sessió, forcem el login immediat
            esriId.getCredential(CONFIG.portalUrl + "/sharing");
        });

    // --- LÒGICA DE CAPA ---
    const layerVehicles = new FeatureLayer({ 
        url: CONFIG.layerUrl,
        outFields: ["data", "vehicle_gepif", "quilometres_finals"]
    });

    // --- BOTONS ---

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

    // --- FUNCIONS DE DADES ---

    function setupDefaultFilters() {
        const fa7dies = new Date();
        fa7dies.setDate(fa7dies.getDate() - 7);
        const inputData = document.getElementById("filter-date");
        if (inputData) inputData.value = fa7dies.toISOString().split('T')[0];
    }

    async function carregarUniqueVehicles() {
        const selector = document.getElementById("select-vehicle-list");
        if (selector.options.length > 1) return;

        console.log("Carregant llista de vehicles únics...");
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
            console.log("Llista de vehicles carregada.");
        } catch (e) {
            console.error("Error carregant vehicles:", e);
        }
    }

    async function executarConsulta() {
        const container = document.getElementById("results-container");
        const countLabel = document.getElementById("results-count");
        
        container.innerHTML = "<calcite-loader label='Cercant...'></calcite-loader>";
        
        const vehicle = document.getElementById("select-vehicle-list").value;
        const dataInput = document.getElementById("filter-date").value;

        let condicions = ["1=1"];
        if (dataInput) condicions.push(`data >= DATE '${dataInput}'`);
        if (vehicle !== "TOTS") condicions.push(`vehicle_gepif = '${vehicle}'`);

        const query = layerVehicles.createQuery();
        query.where = condicions.join(" AND ");
        query.outFields = ["data", "vehicle_gepif", "quilometres_finals"];
        query.orderByFields = ["data DESC"];

        try {
            console.log("Executant consulta:", query.where);
            const res = await layerVehicles.queryFeatures(query);
            countLabel.innerText = `${res.features.length} registres trobats`;
            container.innerHTML = "";

            if (res.features.length === 0) {
                container.innerHTML = "<p style='text-align:center; padding:20px;'>No s'han trobat dades amb aquests filtres.</p>";
                return;
            }

            res.features.forEach(f => {
                const a = f.attributes;
                const d = new Date(a.data);
                const dataFmt = isNaN(d) ? "Data desconeguda" : d.toLocaleDateString("ca-ES");

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
            console.error("Error en la consulta:", e);
            container.innerHTML = "<p>Error en carregar les dades. Revisa els permisos.</p>";
        }
    }
});
