require([
    "esri/intl",
    "esri/identity/OAuthInfo",
    "esri/identity/IdentityManager",
    "esri/layers/FeatureLayer"
], function(esriIntl, OAuthInfo, esriId, FeatureLayer) {

    esriIntl.setLocale("ca");

    const CONFIG = {
        appId: "nqpbkytcOS0q53Ja",
        portalUrl: "https://www.arcgis.com",
        capes: {
            treballs: {
                title: "Seguiment de Treballs",
                url: "https://services-eu1.arcgis.com/jukYmBukbIJBEB9m/arcgis/rest/services/survey123_6b2f7fbe67a948dd9da7006de6592414/FeatureServer/0",
                filterField: "unitat_gepif",
                displayFields: ["data", "unitat_gepif", "id_expedient_de_feines", "jornals"],
                color: "#2e7d32"
            },
            vehicles: {
                title: "Control de Flota",
                url: "https://services-eu1.arcgis.com/jukYmBukbIJBEB9m/arcgis/rest/services/survey123_4d92dc3fb88e4c2bb518a6399f049f08_form/FeatureServer/0",
                filterField: "vehicle_gepif",
                displayFields: ["data", "vehicle_gepif", "quilometres_finals"],
                color: "#005e95"
            }
        }
    };

    let capaActual = null;
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

    // LOGIN
    esriId.checkSignInStatus(CONFIG.portalUrl + "/sharing")
        .then(() => showView('landing'))
        .catch(() => esriId.getCredential(CONFIG.portalUrl + "/sharing"));

    // NAVEGACIÓ
    document.getElementById("btn-nav-treballs").onclick = () => carregarCapa('treballs');
    document.getElementById("btn-nav-vehicles").onclick = () => carregarCapa('vehicles');
    document.getElementById("btn-back").onclick = () => showView('landing');
    document.getElementById("btn-logout").onclick = () => { esriId.destroyCredentials(); window.location.reload(); };
    document.getElementById("btn-refresh").onclick = () => executarConsulta();

    async function carregarCapa(id) {
        capaActual = CONFIG.capes[id];
        showView('query');
        document.getElementById("query-title").innerText = capaActual.title;
        document.getElementById("query-title").style.color = capaActual.color;
        
        await carregarSelectors(id);
        executarConsulta();
    }

    async function carregarSelectors(id) {
        const selector = document.getElementById("select-filter");
        selector.innerHTML = '<calcite-option value="TOTS">Tots els registres</calcite-option>';
        
        const layer = new FeatureLayer({ url: capaActual.url });
        try {
            await layer.load();
            const field = layer.fields.find(f => f.name === capaActual.filterField);
            if (field && field.domain && field.domain.codedValues) {
                field.domain.codedValues.forEach(cv => {
                    const opt = document.createElement("calcite-option");
                    opt.value = cv.code;
                    opt.label = cv.name;
                    selector.appendChild(opt);
                });
            }
        } catch (e) { console.error("Error carregant domini", e); }
    }

    async function executarConsulta() {
        const container = document.getElementById("results-container");
        const countLabel = document.getElementById("results-count");
        container.innerHTML = "<calcite-loader label='Actualitzant...'></calcite-loader>";
        
        const filterVal = document.getElementById("select-filter").value;
        const layer = new FeatureLayer({ url: capaActual.url });

        let where = "1=1";
        if (filterVal !== "TOTS") {
            where = `${capaActual.filterField} = '${filterVal}'`;
        }

        try {
            const res = await layer.queryFeatures({
                where: where,
                outFields: ["*"],
                orderByFields: ["data DESC"],
                num: 20
            });

            countLabel.innerText = `Mostrant els darrers ${res.features.length} registres`;
            container.innerHTML = "";

            res.features.forEach(f => {
                const a = f.attributes;
                const d = new Date(a.data);
                const dataFmt = isNaN(d) ? "Sense data" : d.toLocaleDateString("ca-ES", {day:'2-digit', month:'2-digit'});

                const card = document.createElement("div");
                card.className = "result-card";
                card.style.borderLeftColor = capaActual.color;

                // Contingut dinàmic segons la capa
                let bodyHTML = "";
                if (capaActual.title.includes("Treballs")) {
                    bodyHTML = `
                        <div class="card-header">
                            <span class="card-date"><b>${dataFmt}</b></span>
                            <span class="card-tag">${a.unitat_gepif || '---'}</span>
                        </div>
                        <div class="card-body">
                            Expedient: <b>${a.id_expedient_de_feines || '---'}</b><br>
                            Jornals: <span class="badge">${a.jornals || 0}</span>
                        </div>`;
                } else {
                    bodyHTML = `
                        <div class="card-header">
                            <span class="card-date"><b>${dataFmt}</b></span>
                            <span class="card-tag">${a.vehicle_gepif || '---'}</span>
                        </div>
                        <div class="card-body">
                            Km finals: <span class="badge">${a.quilometres_finals || 0} km</span>
                        </div>`;
                }

                card.innerHTML = bodyHTML;
                container.appendChild(card);
            });
        } catch (e) {
            container.innerHTML = `<div class="error-msg">Error de permisos o de capa.<br><small>${e.message}</small></div>`;
        }
    }
});
