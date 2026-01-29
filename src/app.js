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
    let ultimResultat = [];
    let campsCapa = [];

    const info = new OAuthInfo({ appId: CONFIG.appId, portalUrl: CONFIG.portalUrl, popup: false });
    esriId.registerOAuthInfos([info]);

    // MAPA DE VISTES
    const views = {
        loading: document.getElementById("view-loading"),
        landing: document.getElementById("view-landing"),
        query: document.getElementById("view-query")
    };

    // Funció corregida per canviar de vista de forma segura
    function showView(viewName) {
        console.log("Canviant a vista:", viewName);
        // Primer amaguem TOTES les vistes
        Object.keys(views).forEach(key => {
            if (views[key]) views[key].classList.add("hidden");
        });
        // Després mostrem només la que volem
        if (views[viewName]) {
            views[viewName].classList.remove("hidden");
        }
    }

    // CONTROL D'ACCÉS
    esriId.checkSignInStatus(CONFIG.portalUrl + "/sharing")
        .then(() => {
            console.log("Usuari loguejat correctament");
            showView('landing');
        })
        .catch(() => {
            console.log("Cal fer login");
            esriId.getCredential(CONFIG.portalUrl + "/sharing");
        });

    // ESDEVENIMENTS
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
            campsCapa = layer.fields;
            const field = layer.fields.find(f => f.name === capaActual.filterField);
            if (field && field.domain && field.domain.codedValues) {
                field.domain.codedValues.forEach(cv => {
                    const opt = document.createElement("calcite-option");
                    opt.value = cv.code;
                    opt.label = cv.name;
                    selector.appendChild(opt);
                });
            }
        } catch (e) { console.error("Error selectors", e); }
    }

    async function executarConsulta() {
        const container = document.getElementById("results-container");
        const countLabel = document.getElementById("results-count");
        container.innerHTML = "<calcite-loader label='Actualitzant...' scale='m'></calcite-loader>";
        
        const filterVal = document.getElementById("select-filter").value;
        const layer = new FeatureLayer({ url: capaActual.url });

        let where = "1=1";
        if (filterVal !== "TOTS") where = `${capaActual.filterField} = '${filterVal}'`;

        try {
            const res = await layer.queryFeatures({
                where: where,
                outFields: ["*"],
                orderByFields: ["data DESC"],
                num: 30
            });

            ultimResultat = res.features;
            countLabel.innerText = `Darrers ${res.features.length} registres`;
            container.innerHTML = "";

            res.features.forEach((f, index) => {
                const a = f.attributes;
                const d = new Date(a.data);
                const dataFmt = isNaN(d) ? "Sense data" : d.toLocaleDateString("ca-ES", {day:'2-digit', month:'2-digit'});

                const card = document.createElement("div");
                card.className = "result-card";
                card.style.borderLeftColor = capaActual.color;
                card.onclick = () => obrirDetalls(index);

                let titol = (capaActual.filterField === "unitat_gepif") ? (a.unitat_gepif || '---') : (a.vehicle_gepif || '---');
                
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <b>${dataFmt}</b>
                        <span style="background:${capaActual.color}15; color:${capaActual.color}; padding:2px 8px; border-radius:4px; font-weight:bold; font-size:0.8rem;">${titol}</span>
                    </div>
                    <div style="margin-top:8px; color:#555;">Prem per obrir fitxa</div>
                `;
                container.appendChild(card);
            });
        } catch (e) {
            container.innerHTML = `<div style="color:red; padding:15px; text-align:center;">Error carregant dades.</div>`;
        }
    }

    function obrirDetalls(index) {
        const feature = ultimResultat[index];
        const a = feature.attributes;
        const modal = document.getElementById("modal-detalls");
        const contingut = document.getElementById("modal-contingut");

        const ordrePrioritari = ["data", "unitat_gepif", "id_expedient_de_feines", "jornals", "observacions", "component_que_entra_la_informac", "vehicle_gepif", "quilometres_finals"];

        let html = '<div class="detall-llista">';
        let processats = new Set();

        const getHTML = (name) => {
            const c = campsCapa.find(item => item.name === name);
            if (!c) return '';
            let val = a[c.name];
            if (c.type === "date" && val) val = new Date(val).toLocaleString("ca-ES");
            if (!val) val = "---";
            processats.add(c.name);
            return `<div class="detall-item"><label>${c.alias || c.name}</label><div>${val}</div></div>`;
        };

        ordrePrioritari.forEach(n => html += getHTML(n));
        campsCapa.forEach(c => {
            if (!["objectid", "globalid", "Creator", "Editor", "EditDate", "CreationDate"].includes(c.name) && !processats.has(c.name)) {
                html += getHTML(c.name);
            }
        });

        contingut.innerHTML = html + '</div>';
        modal.open = true;
    }
});
