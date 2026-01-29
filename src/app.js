require([
    "esri/intl", "esri/identity/OAuthInfo", "esri/identity/IdentityManager", "esri/layers/FeatureLayer"
], function(esriIntl, OAuthInfo, esriId, FeatureLayer) {

    esriIntl.setLocale("ca");

    const CONFIG = {
        appId: "nqpbkytcOS0q53Ja",
        portalUrl: "https://www.arcgis.com",
        masterVehiclesUrl: "https://services-eu1.arcgis.com/jukYmBukbIJBEB9m/arcgis/rest/services/Vehicles_enViu/FeatureServer/0",
        capes: {
            treballs: { id: "treballs", title: "Seguiment de Treballs", url: "https://services-eu1.arcgis.com/jukYmBukbIJBEB9m/arcgis/rest/services/survey123_6b2f7fbe67a948dd9da7006de6592414/FeatureServer/0", filterField: "unitat_gepif", color: "#2e7d32" },
            vehicles: { id: "vehicles", title: "Consulta Vehicles", url: "https://services-eu1.arcgis.com/jukYmBukbIJBEB9m/arcgis/rest/services/survey123_4d92dc3fb88e4c2bb518a6399f049f08_form/FeatureServer/0", filterField: "vehicle_gepif", color: "#005e95" },
            expedients: { id: "expedients", title: "Expedients de Treballs", url: "https://services-eu1.arcgis.com/jukYmBukbIJBEB9m/arcgis/rest/services/survey123_dddbaf4e75c24ecaae39c1b6bfa0d201/FeatureServer/0", filterField: "unitat_gepif", color: "#6a1b9a" }
        }
    };

    let capaActual = null, dadesLocals = [], campsCapa = [];
    const info = new OAuthInfo({ appId: CONFIG.appId, portalUrl: CONFIG.portalUrl, popup: false });
    esriId.registerOAuthInfos([info]);

    const showView = (name) => {
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.getElementById(`view-${name}`).classList.remove('hidden');
    };

    esriId.checkSignInStatus(CONFIG.portalUrl + "/sharing").then(() => showView('landing')).catch(() => esriId.getCredential(CONFIG.portalUrl + "/sharing"));

    document.getElementById("btn-nav-treballs").onclick = () => carregarCapa('treballs');
    document.getElementById("btn-nav-vehicles").onclick = () => carregarCapa('vehicles');
    document.getElementById("btn-nav-expedients").onclick = () => carregarCapa('expedients');
    document.getElementById("btn-back").onclick = () => showView('landing');
    document.getElementById("btn-refresh").onclick = () => renderitzarLlista();
    document.getElementById("btn-tanca-modal").onclick = () => document.getElementById("modal-detalls").open = false;

    async function carregarCapa(id) {
        capaActual = CONFIG.capes[id];
        showView('query');
        document.getElementById("query-title").innerText = capaActual.title;
        document.getElementById("query-title").style.color = capaActual.color;

        // Gestió de selectors de data/any
        document.getElementById("label-data").classList.toggle("hidden", id === "expedients");
        document.getElementById("label-any").classList.toggle("hidden", id !== "expedients");

        await carregarSelectors();
        await descarregarDades();
    }

    async function carregarSelectors() {
        const selector = document.getElementById("select-filter");
        selector.innerHTML = '<calcite-option value="TOTS">Totes les Unitats</calcite-option>';
        const layer = new FeatureLayer({ url: capaActual.url });
        await layer.load();
        campsCapa = layer.fields;
        
        // Emplenar Unitats
        const field = layer.fields.find(f => f.name === capaActual.filterField);
        if (field?.domain?.codedValues) {
            field.domain.codedValues.forEach(cv => {
                const opt = document.createElement("calcite-option");
                opt.value = cv.code; opt.label = cv.name;
                selector.appendChild(opt);
            });
        }

        // Emplenar Anys si és expedients
        if (capaActual.id === "expedients") {
            const selectorAny = document.getElementById("select-any");
            selectorAny.innerHTML = '<calcite-option value="TOTS">Tots els anys</calcite-option>';
            const anys = [2023, 2024, 2025, 2026]; // Podria ser dinàmic, però per ara fix
            anys.forEach(a => {
                const opt = document.createElement("calcite-option");
                opt.value = a.toString(); opt.label = a.toString();
                selectorAny.appendChild(opt);
            });
        }
    }

    async function descarregarDades() {
        const container = document.getElementById("results-container");
        container.innerHTML = "<calcite-loader label='Baixant dades...'></calcite-loader>";
        const layer = new FeatureLayer({ url: capaActual.url });
        try {
            const res = await layer.queryFeatures({ where: "1=1", outFields: ["*"], num: 150 });
            dadesLocals = res.features.sort((a, b) => (b.attributes.CreationDate || 0) - (a.attributes.CreationDate || 0));
            renderitzarLlista();
        } catch (e) { console.error(e); }
    }

    function renderitzarLlista() {
        const container = document.getElementById("results-container");
        const filterVal = document.getElementById("select-filter").value;
        const anyVal = document.getElementById("select-any").value;
        const dataVal = document.getElementById("filter-date").value;
        const dataLimit = dataVal ? new Date(dataVal).getTime() : 0;

        const filtrades = dadesLocals.filter(f => {
            const a = f.attributes;
            const cUnitat = (filterVal === "TOTS" || a[capaActual.filterField] === filterVal);
            let cData = true;
            if (capaActual.id === "expedients" && anyVal !== "TOTS") {
                cData = new Date(a.CreationDate).getFullYear().toString() === anyVal;
            } else if (dataVal) {
                cData = (a.data >= dataLimit);
            }
            return cUnitat && cData;
        });

        document.getElementById("results-count").innerText = `${filtrades.length} registres trobats`;
        container.innerHTML = "";

        filtrades.forEach(f => {
            const a = f.attributes;
            const card = document.createElement("div");
            card.className = "result-card";
            card.onclick = () => obrirDetalls(f);

            if (capaActual.id === "expedients") {
                // LÒGICA VISUAL EXPEDIENTS
                const estat = (a.estat_dels_treballs || "").toLowerCase().replace(/ /g, "-").replace(/\./g, "");
                card.classList.add(`estat-${estat}`);
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div style="flex:1;">
                            <span class="card-titol-gran">${a._id || ''} ${a.paratge || ''}</span>
                            <div class="card-subtitol-estat">${a.estat_dels_treballs || 'Sense estat'}</div>
                        </div>
                        <div style="text-align:right; font-size:0.8rem; font-weight:bold; opacity:0.7;">
                            ${a.unitat_gepif || ''}
                        </div>
                    </div>
                `;
            } else {
                // LÒGICA VISUAL TREBALLS / VEHICLES
                card.style.borderLeftColor = capaActual.color;
                const d = new Date(a.data);
                const dataFmt = isNaN(d) ? "---" : d.toLocaleDateString("ca-ES", {day:'2-digit', month:'2-digit'});
                let t = (capaActual.id === "treballs") ? a.unitat_gepif : a.vehicle_gepif;
                card.innerHTML = `<div style="display:flex; justify-content:space-between;"><b>${dataFmt}</b><span>${t || ''}</span></div>`;
            }
            container.appendChild(card);
        });
    }

    function obrirDetalls(feature) {
        const a = feature.attributes;
        const modal = document.getElementById("modal-detalls");
        const contingut = document.getElementById("modal-contingut");
        const prioritat = ["_id", "paratge", "estat_dels_treballs", "unitat_gepif", "data_dassignaci", "tipus_de_feines", "data", "jornals", "observacions"];
        
        let html = '<div class="detall-llista">', processats = new Set();
        const getHTML = (name) => {
            const c = campsCapa.find(item => item.name === name);
            if (!c) return '';
            let val = a[c.name];
            if (c.type === "date" && val) val = new Date(val).toLocaleDateString("ca-ES");
            processats.add(c.name);
            return `<div class="detall-item"><label>${c.alias || c.name}</label><div>${val || '---'}</div></div>`;
        };
        prioritat.forEach(n => html += getHTML(n));
        campsCapa.forEach(c => {
            if (!["objectid", "globalid", "Shape__Area", "Shape__Length", "CreationDate", "Creator", "EditDate", "Editor"].includes(c.name) && !processats.has(c.name)) html += getHTML(c.name);
        });
        contingut.innerHTML = html + '</div>';
        modal.open = true;
    }
});
