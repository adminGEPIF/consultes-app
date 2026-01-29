require([
    "esri/config",
    "esri/intl",
    "esri/identity/OAuthInfo",
    "esri/identity/IdentityManager",
    "esri/layers/FeatureLayer"
], function(esriConfig, esriIntl, OAuthInfo, esriId, FeatureLayer) {

    // 1. Idioma
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

    // GESTIÓ D'ACCÉS
    esriId.checkSignInStatus(CONFIG.portalUrl + "/sharing")
        .then(() => { 
            console.log("Sessió iniciada");
            showView('landing'); 
        })
        .catch(() => { 
            console.log("Cal iniciar sessió");
            esriId.getCredential(CONFIG.portalUrl + "/sharing"); 
        });

    // Definició de la capa amb autenticació forçada
    const layerVehicles = new FeatureLayer({ 
        url: CONFIG.layerUrl,
        outFields: ["data", "vehicle_gepif", "quilometres_finals"]
    });

    // BOTONS
    document.getElementById("btn-select-vehicles").onclick = async () => {
        showView('query');
        setupDefaultFilters();
        await carregarVehiclesSegur();
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
        document.getElementById("filter-date").value = fa7dies.toISOString().split('T')[0];
    }

    // FUNCIÓ SEGURA DE CÀRREGA DE VEHICLES
    async function carregarVehiclesSegur() {
        const selector = document.getElementById("select-vehicle-list");
        if (selector.childElementCount > 1) return;

        try {
            console.log("Carregant metadades de la capa...");
            await layerVehicles.load();
            
            // Busquem el camp (intentem varis noms per si de cas)
            const camp = layerVehicles.fields.find(f => f.name.toLowerCase() === "vehicle_gepif");
            
            if (camp && camp.domain && camp.domain.codedValues) {
                console.log("Dominis trobats:", camp.domain.codedValues.length);
                camp.domain.codedValues.forEach(cv => {
                    const opt = document.createElement("calcite-option");
                    opt.value = cv.code;
                    opt.label = cv.name; 
                    selector.appendChild(opt);
                });
            } else {
                console.warn("No s'han trobat dominis. Intentant consulta de valors únics...");
                const q = layerVehicles.createQuery();
                q.where = "1=1";
                q.outFields = ["vehicle_gepif"];
                q.returnDistinctValues = true;
                const res = await layerVehicles.queryFeatures(q);
                res.features.forEach(f => {
                    const val = f.attributes.vehicle_gepif;
                    if(val) {
                        const opt = document.createElement("calcite-option");
                        opt.value = val; opt.label = val;
                        selector.appendChild(opt);
                    }
                });
            }
        } catch (e) {
            console.error("Error carregant el selector:", e);
        }
    }

    async function executarConsulta() {
        const container = document.getElementById("results-container");
        const countLabel = document.getElementById("results-count");
        container.innerHTML = "<calcite-loader label='Cercant dades...'></calcite-loader>";
        
        const vehicle = document.getElementById("select-vehicle-list").value;
        const dataInput = document.getElementById("filter-date").value;

        // Construcció de la consulta SQL d'ArcGIS
        let conds = ["1=1"];
        if (dataInput) conds.push(`data >= DATE '${dataInput}'`);
        if (vehicle && vehicle !== "TOTS") conds.push(`vehicle_gepif = '${vehicle}'`);

        const query = layerVehicles.createQuery();
        query.where = conds.join(" AND ");
        query.outFields = ["*"];
        query.orderByFields = ["data DESC"];

        try {
            const res = await layerVehicles.queryFeatures(query);
            countLabel.innerText = `${res.features.length} registres trobats`;
            container.innerHTML = "";

            if (res.features.length === 0) {
                container.innerHTML = "<p style='padding:20px; text-align:center'>No hi ha dades.</p>";
                return;
            }

            res.features.forEach(f => {
                const a = f.attributes;
                const d = new Date(a.data);
                const dataFmt = isNaN(d) ? "Sense data" : d.toLocaleDateString("ca-ES", {day:'2-digit', month:'2-digit', year:'numeric'});

                const card = document.createElement("div");
                card.className = "vehicle-card";
                card.innerHTML = `
                    <div class="card-header">
                        <span class="card-date"><b>${dataFmt}</b></span>
                        <span class="card-title">${a.vehicle_gepif || '---'}</span>
                    </div>
                    <div class="card-body">
                        Km finals: <span class="km-badge">${a.quilometres_finals || 0} km</span>
                    </div>
                `;
                container.appendChild(card);
            });
        } catch (e) {
            console.error("Error en executar consulta:", e);
            // Si l'error és de permisos, aquest log ens ho dirà
            if (e.message && e.message.includes("403")) {
                container.innerHTML = "<div style='color:red; padding:10px;'><b>Error 403: Permisos insuficients.</b><br>Verifica que la capa està compartida correctament i que l'usuari té permís de visualització.</div>";
            } else {
                container.innerHTML = "<p>Error en carregar les dades. Mira la consola (F12).</p>";
            }
        }
    }
});
