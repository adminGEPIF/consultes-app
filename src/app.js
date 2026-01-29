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
                color: "#2e7d32"
            },
            vehicles: {
                title: "Consulta Vehicles",
                url: "https://services-eu1.arcgis.com/jukYmBukbIJBEB9m/arcgis/rest/services/survey123_4d92dc3fb88e4c2bb518a6399f049f08_form/FeatureServer/0",
                filterField: "vehicle_gepif",
                color: "#005e95"
            }
        }
    };

    let capaActual = null;
    let ultimResultat = []; // Guardarem els objectes aquí per mostrar detalls
    let campsCapa = []; // Guardarem els àlies dels camps

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

    document.getElementById("btn-nav-treballs").onclick = () => carregarCapa('treballs');
    document.getElementById("btn-nav-vehicles").onclick = () => carregarCapa('vehicles');
    document.getElementById("btn-back").onclick = () => showView('landing');
    document.getElementById("btn-logout").onclick = () => { esriId.destroyCredentials(); window.location.reload(); };
    document.getElementById("btn-refresh").onclick = () => executarConsulta();
    document.getElementById("btn-tanca-modal").onclick = () => document.getElementById("modal-detalls").open = false;

    async function carregarCapa(id) {
        capaActual = CONFIG.capes[id];
        showView('query');
        document.getElementById("query-title").innerText = capaActual.title;
        document.getElementById("query-title").style.color = capaActual.color;
        
        await carregarSelectors();
        executarConsulta();
    }

    async function carregarSelectors() {
        const selector = document.getElementById("select-filter");
        selector.innerHTML = '<calcite-option value="TOTS">Tots els registres</calcite-option>';
        
        const layer = new FeatureLayer({ url: capaActual.url });
        try {
            await layer.load();
            campsCapa = layer.fields; // Guardem els camps per als àlies
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
        if (filterVal !== "TOTS") where = `${capaActual.filterField} = '${filterVal}'`;

        try {
            const res = await layer.queryFeatures({
                where: where,
                outFields: ["*"],
                orderByFields: ["data DESC"],
                num: 20
            });

            ultimResultat = res.features; // Guardem a memòria
            countLabel.innerText = `Mostrant els darrers ${res.features.length} registres`;
            container.innerHTML = "";

            res.features.forEach((f, index) => {
                const a = f.attributes;
                const d = new Date(a.data);
                const dataFmt = isNaN(d) ? "Sense data" : d.toLocaleDateString("ca-ES", {day:'2-digit', month:'2-digit', year:'numeric'});

                const card = document.createElement("div");
                card.className = "result-card";
                card.style.borderLeftColor = capaActual.color;
                card.onclick = () => obrirDetalls(index); // Funció en clicar

                let titol = capaActual.title.includes("Treballs") ? (a.unitat_gepif || '---') : (a.vehicle_gepif || '---');
                let subtitol = capaActual.title.includes("Treballs") ? `Exp: ${a.id_expedient_de_feines || '---'}` : `Km: ${a.quilometres_finals || 0}`;

                card.innerHTML = `
                    <div class="card-header">
                        <span class="card-date"><b>${dataFmt}</b></span>
                        <span class="card-tag" style="background:${capaActual.color}15; color:${capaActual.color}">${titol}</span>
                    </div>
                    <div class="card-body">${subtitol}</div>
                    <div style="text-align:right; font-size:0.7rem; color:#999; margin-top:5px;">Premeu per veure detalls</div>
                `;
                container.appendChild(card);
            });
        } catch (e) {
            container.innerHTML = `<div class="error-msg">Error de permisos.<br><small>${e.message}</small></div>`;
        }
    }

    // FUNCIÓ PER MOSTRAR TOTS ELS CAMPS
    function obrirDetalls(index) {
        const feature = ultimResultat[index];
        const a = feature.attributes;
        const modal = document.getElementById("modal-detalls");
        const contingut = document.getElementById("modal-contingut");

        let html = '<div class="detall-llista">';
        
        // Recorrem tots els camps de la capa per mostrar la dada amb el seu Àlies (nom maco)
        campsCapa.forEach(camp => {
            // Saltem els camps tècnics lletjos si vols
            if (["objectid", "globalid", "Creator", "Editor", "EditDate", "CreationDate"].includes(camp.name)) return;

            let valor = a[camp.name];
            
            // Formatar dates si el camp és de tipus data
            if (camp.type === "date" && valor) {
                valor = new Date(valor).toLocaleString("ca-ES");
            }
            
            if (valor === null || valor === undefined) valor = "---";

            html += `
                <div class="detall-item">
                    <label>${camp.alias || camp.name}</label>
                    <div>${valor}</div>
                </div>
            `;
        });

        html += '</div>';
        contingut.innerHTML = html;
        modal.open = true;
    }
});
