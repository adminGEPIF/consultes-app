// Afegim "esri/intl" per al català i "esri/config" per a la configuració global
require([
    "esri/config",
    "esri/intl",
    "esri/identity/OAuthInfo",
    "esri/identity/IdentityManager",
    "esri/layers/FeatureLayer"
], function(esriConfig, esriIntl, OAuthInfo, esriId, FeatureLayer) {

    // 1. CONFIGURACIÓ DE L'IDIOMA (CATALÀ)
    esriIntl.setLocale("ca");

    const CONFIG = {
        appId: "nqpbkytcOS0q53Ja",
        layerUrl: "https://services-eu1.arcgis.com/jukYmBukbIJBEB9m/arcgis/rest/services/survey123_4d92dc3fb88e4c2bb518a6399f049f08_form/FeatureServer/0",
        portalUrl: "https://www.arcgis.com" // Afegit el 'www' per estabilitat
    };

    const info = new OAuthInfo({
        appId: CONFIG.appId,
        portalUrl: CONFIG.portalUrl,
        authNamespace: "portal",
        popup: false // Redirigeix a la mateixa finestra
    });

    esriId.registerOAuthInfos([info]);

    // 2. GESTIÓ DE VISTES
    const views = {
        loading: document.getElementById("view-loading"),
        landing: document.getElementById("view-landing"),
        query: document.getElementById("view-query")
    };

    function showView(viewName) {
        Object.keys(views).forEach(key => {
            if (views[key]) views[key].classList.add("hidden");
        });
        if (views[viewName]) views[viewName].classList.remove("hidden");
    }

    // 3. CONTROL DE LOGIN (CORREGIT)
    // Intentem veure si l'usuari ja està loguejat
    esriId.checkSignInStatus(CONFIG.portalUrl + "/sharing")
        .then(() => {
            console.log("Usuari ja autenticat");
            showView('landing');
        })
        .catch(() => {
            console.log("Usuari no autenticat. Intentant login...");
            // Si no està loguejat, forcem el login
            // Afegim un petit retard per evitar bucles infinits de càrrega
            setTimeout(() => {
                esriId.getCredential(CONFIG.portalUrl + "/sharing", { oAuthPopupConfirmation: false });
            }, 500);
        });

    // 4. LOGICA DE LA CAPA
    const layerVehicles = new FeatureLayer({ 
        url: CONFIG.layerUrl,
        outFields: ["*"] 
    });

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

    // --- FUNCIONS AUXILIARS ---

    function setupDefaultFilters() {
        const fa7dies = new Date();
        fa7dies.setDate(fa7dies.getDate() - 7);
        const inputData = document.getElementById("filter-date");
        if (inputData) inputData.value = fa7dies.toISOString().split('T')[0];
    }

    async function carregarUniqueVehicles() {
        const selector = document.getElementById("select-vehicle-list");
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
            const res = await layerVehicles.queryFeatures(query);
            countLabel.innerText = `${res.features.length} registres trobats`;
            container.innerHTML = "";

            if (res.features.length === 0) {
                container.innerHTML = "<p style='text-align:center; padding:20px;'>No s'han trobat dades amb aquests filtres.</p>";
                return;
            }

            res.features.forEach(f => {
                const attr = f.attributes;
                const dataFmt = new Date(attr.data).toLocaleDateString("ca-ES", {
                    day: '2-digit', month: '2-digit', year: 'numeric'
                });

                const card = document.createElement("div");
                card.className = "vehicle-card";
                card.innerHTML = `
                    <div class="card-header">
                        <span class="card-title">${attr.vehicle_gepif || 'Sense ID'}</span>
                        <span class="card-date">${dataFmt}</span>
                    </div>
                    <div class="card-body">
                        Km finals: <span class="km-badge">${attr.quilometres_finals || 0} km</span>
                    </div>
                `;
                container.appendChild(card);
            });
        } catch (e) {
            container.innerHTML = "<p>Error en carregar les dades. Revisa els permisos de la capa.</p>";
            console.error(e);
        }
    }
});
