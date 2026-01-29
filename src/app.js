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

    const layerVehicles = new FeatureLayer({ 
        url: CONFIG.layerUrl,
        outFields: ["*"] 
    });

    // BOTONS
    document.getElementById("btn-select-vehicles").onclick = async () => {
        showView('query');
        setupDefaultFilters();
        await carregarConfiguracioCapa();
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

    // DIAGNÒSTIC I CÀRREGA DE SELECTOR
    async function carregarConfiguracioCapa() {
        const selector = document.getElementById("select-vehicle-list");
        if (selector.childElementCount > 1) return;

        try {
            await layerVehicles.load();
            console.log("Camps trobats a la capa:", layerVehicles.fields.map(f => f.name));

            // Busquem el camp del vehicle (ignorant majúscules/minúscules)
            const campVehicle = layerVehicles.fields.find(f => f.name.toLowerCase() === "vehicle_gepif");
            
            if (campVehicle && campVehicle.domain && campVehicle.domain.codedValues) {
                campVehicle.domain.codedValues.forEach(cv => {
                    const opt = document.createElement("calcite-option");
                    opt.value = cv.code;
                    opt.label = cv.name;
                    selector.appendChild(opt);
                });
                console.log("Selector carregat per Domini");
            } else {
                // Fallback: Valors únics
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
                console.log("Selector carregat per Valors Únics");
            }
        } catch (e) {
            console.error("Error carregant config capa:", e);
        }
    }

    async function executarConsulta() {
        const container = document.getElementById("results-container");
        const countLabel = document.getElementById("results-count");
        container.innerHTML = "<calcite-loader label='Actualitzant...'></calcite-loader>";
        
        const vehicle = document.getElementById("select-vehicle-list").value;
        const dataInput = document.getElementById("filter-date").value;

        // FORMAT DE DATA CORREGIT PER EVITAR ERROR 400
        // En lloc de DATE 'YYYY-MM-DD', usem el format simple que accepta la majoria de servidors
        let conds = ["1=1"];
        if (dataInput) {
            // Intentem el format YYYY-MM-DD HH:MM:SS per a més compatibilitat
            conds.push(`data >= '${dataInput} 00:00:00'`);
        }
        if (vehicle && vehicle !== "TOTS") {
            conds.push(`vehicle_gepif = '${vehicle}'`);
        }

        const query = layerVehicles.createQuery();
        query.where = conds.join(" AND ");
        query.outFields = ["data", "vehicle_gepif", "quilometres_finals"];
        query.orderByFields = ["data DESC"];

        console.log("Enviant consulta SQL:", query.where);

        try {
            const res = await layerVehicles.queryFeatures(query);
            countLabel.innerText = `${res.features.length} registres trobats`;
            container.innerHTML = "";

            if (res.features.length === 0) {
                container.innerHTML = "<p style='text-align:center; padding:20px;'>No s'han trobat dades.</p>";
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
            console.error("Error detallat:", e);
            // Si torna a fallar, provem una consulta sense data per descartar
            container.innerHTML = `<div style="color:red; padding:20px;">
                <b>Error 400 en la consulta</b><br>
                SQL enviat: <code>${query.where}</code><br><br>
                Revisa a la consola si el camp "data" existeix realment amb aquest nom.
            </div>`;
        }
    }
});
