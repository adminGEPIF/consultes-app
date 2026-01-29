require([
    "esri/intl", 
    "esri/identity/OAuthInfo", 
    "esri/identity/IdentityManager", 
    "esri/layers/FeatureLayer"
], function(esriIntl, OAuthInfo, esriId, FeatureLayer) {

    // 1. CONFIGURACIÓ D'IDIOMA
    esriIntl.setLocale("ca");

    const CONFIG = {
        appId: "nqpbkytcOS0q53Ja",
        portalUrl: "https://www.arcgis.com",
        masterVehiclesUrl: "https://services-eu1.arcgis.com/jukYmBukbIJBEB9m/arcgis/rest/services/Vehicles_enViu/FeatureServer/0",
        capes: {
            treballs: { 
                id: "treballs", 
                title: "Seguiment de Treballs", 
                url: "https://services-eu1.arcgis.com/jukYmBukbIJBEB9m/arcgis/rest/services/survey123_6b2f7fbe67a948dd9da7006de6592414/FeatureServer/0", 
                filterField: "unitat_gepif", 
                color: "#2e7d32" 
            },
            vehicles: { 
                id: "vehicles", 
                title: "Consulta Vehicles", 
                url: "https://services-eu1.arcgis.com/jukYmBukbIJBEB9m/arcgis/rest/services/survey123_4d92dc3fb88e4c2bb518a6399f049f08_form/FeatureServer/0", 
                filterField: "vehicle_gepif", 
                color: "#005e95" 
            },
            expedients: { 
                id: "expedients", 
                title: "Expedients de Treballs", 
                url: "https://services-eu1.arcgis.com/jukYmBukbIJBEB9m/arcgis/rest/services/survey123_dddbaf4e75c24ecaae39c1b6bfa0d201/FeatureServer/0", 
                filterField: "unitat_gepif", 
                color: "#6a1b9a" 
            },
            robots: { 
                id: "robots", 
                title: "Estat dels Robots", 
                url: "https://services-eu1.arcgis.com/jukYmBukbIJBEB9m/arcgis/rest/services/survey123_6b2f7fbe67a948dd9da7006de6592414/FeatureServer/0",
                color: "#ff5722" 
            }
        }
    };

    let capaActual = null;
    let dadesLocals = []; 
    let campsCapa = [];

    // 2. AUTENTICACIÓ OAUTH
    const info = new OAuthInfo({ appId: CONFIG.appId, portalUrl: CONFIG.portalUrl, popup: false });
    esriId.registerOAuthInfos([info]);

    const views = {
        loading: document.getElementById("view-loading"),
        landing: document.getElementById("view-landing"),
        query: document.getElementById("view-query")
    };

    function showView(name) {
        Object.keys(views).forEach(key => { if (views[key]) views[key].classList.add("hidden"); });
        if (views[name]) views[name].classList.remove("hidden");
    }

    esriId.checkSignInStatus(CONFIG.portalUrl + "/sharing")
        .then(() => showView('landing'))
        .catch(() => esriId.getCredential(CONFIG.portalUrl + "/sharing"));

    // 3. NAVEGACIÓ I BOTONS
    document.getElementById("btn-nav-treballs").onclick = () => carregarSeccio('treballs');
    document.getElementById("btn-nav-vehicles").onclick = () => carregarSeccio('vehicles');
    document.getElementById("btn-nav-expedients").onclick = () => carregarSeccio('expedients');
    document.getElementById("btn-nav-robots").onclick = () => carregarSeccioRobots();
    
    document.getElementById("btn-back").onclick = () => showView('landing');
    document.getElementById("btn-logout").onclick = () => { esriId.destroyCredentials(); window.location.reload(); };
    document.getElementById("btn-refresh").onclick = () => executarConsultaLocal();
    document.getElementById("btn-tanca-modal").onclick = () => document.getElementById("modal-detalls").open = false;

    // 4. LÒGICA DE CÀRREGA DE SECCIÓ
    async function carregarSeccio(id) {
        capaActual = CONFIG.capes[id];
        showView('query');
        
        // UI Reset
        document.getElementById("query-title").innerText = capaActual.title;
        document.getElementById("query-title").style.color = capaActual.color;
        document.querySelector(".filter-panel").classList.remove("hidden");
        document.getElementById("results-container").innerHTML = "";
        
        // Configuració de filtres visuals
        document.getElementById("label-data").classList.toggle("hidden", id === "expedients");
        document.getElementById("label-any").classList.toggle("hidden", id !== "expedients");

        // Data per defecte (fa 30 dies)
        const fa30 = new Date();
        fa30.setDate(fa30.getDate() - 30);
        document.getElementById("filter-date").value = fa30.toISOString().split('T')[0];

        await carregarSelectors();
        await descarregarDadesServidor();
    }

    // 5. LÒGICA ESPECÍFICA ROBOTS (DASHBOARD)
    async function carregarSeccioRobots() {
        capaActual = CONFIG.capes.robots;
        showView('query');
        document.getElementById("query-title").innerText = capaActual.title;
        document.getElementById("query-title").style.color = capaActual.color;
        document.querySelector(".filter-panel").classList.add("hidden");
        
        const container = document.getElementById("results-container");
        container.innerHTML = "<calcite-loader label='Analitzant robots...' scale='m'></calcite-loader>";

        const layer = new FeatureLayer({ url: capaActual.url });
        try {
            const res = await layer.queryFeatures({
                where: "robot IS NOT NULL",
                outFields: ["robot", "rb_hores_finals", "robot_operatiu", "data"],
                orderByFields: ["data DESC"],
                num: 1000
            });

            const ultimsEstats = new Map();
            res.features.forEach(f => {
                const nom = f.attributes.robot;
                if (!ultimsEstats.has(nom)) ultimsEstats.set(nom, f.attributes);
            });

            container.innerHTML = `<div class="robot-grid" id="robot-grid" style="display:grid; gap:15px; padding:10px;"></div>`;
            const grid = document.getElementById("robot-grid");

            ultimsEstats.forEach((attr, nom) => {
                const op = attr.robot_operatiu === "Si";
                const card = document.createElement("div");
                card.className = "robot-card"; // Estils definits al CSS
                card.innerHTML = `
                    <div class="robot-nom">${nom}</div>
                    <div class="robot-hores">${attr.rb_hores_finals || 0}</div>
                    <div class="robot-unitat-hores">HORES TOTALS</div>
                    <div class="robot-status ${op ? 'status-si' : 'status-no'}">${op ? 'OPERATIU' : 'NO OPERATIU'}</div>
                    <div style="font-size:0.7rem; color:#999; margin-top:10px;">Darrera entrada: ${new Date(attr.data).toLocaleDateString("ca-ES")}</div>
                `;
                grid.appendChild(card);
            });
            document.getElementById("results-count").innerText = `Estat actual de ${ultimsEstats.size} robots`;
        } catch (e) { container.innerHTML = "<div class='error-msg'>Error al carregar Robots</div>"; }
    }

    // 6. SELECTORS DINÀMICS
    async function carregarSelectors() {
        const selector = document.getElementById("select-filter");
        selector.innerHTML = '<calcite-option value="TOTS">Tots els registres</calcite-option>';
        try {
            if (capaActual.id === "vehicles") {
                const mestre = new FeatureLayer({ url: CONFIG.masterVehiclesUrl });
                const res = await mestre.queryFeatures({ where: "1=1", outFields: ["Codi_vehicle"], orderByFields: ["Codi_vehicle ASC"] });
                res.features.forEach(f => {
                    const v = f.attributes.Codi_vehicle;
                    const opt = document.createElement("calcite-option");
                    opt.value = v; opt.label = v; selector.appendChild(opt);
                });
            } else {
                const layer = new FeatureLayer({ url: capaActual.url });
                await layer.load();
                campsCapa = layer.fields;
                const field = layer.fields.find(f => f.name === capaActual.filterField);
                if (field?.domain?.codedValues) {
                    field.domain.codedValues.forEach(cv => {
                        const opt = document.createElement("calcite-option");
                        opt.value = cv.code; opt.label = cv.name; selector.appendChild(opt);
                    });
                }
            }
            if (capaActual.id === "expedients") {
                const sAny = document.getElementById("select-any");
                if (sAny.childElementCount <= 1) {
                    [2024, 2025, 2026].forEach(a => {
                        const opt = document.createElement("calcite-option");
                        opt.value = a.toString(); opt.label = a.toString(); sAny.appendChild(opt);
                    });
                }
            }
        } catch (e) { console.error("Error selectors", e); }
    }

    // 7. CONSULTA I FILTRATGE LOCAL
    async function descarregarDadesServidor() {
        const container = document.getElementById("results-container");
        container.innerHTML = "<calcite-loader label='Baixant dades...' scale='m'></calcite-loader>";
        const layer = new FeatureLayer({ url: capaActual.url });
        try {
            await layer.load();
            campsCapa = layer.fields;
            const res = await layer.queryFeatures({ 
                where: "1=1", 
                outFields: ["*"], 
                orderByFields: ["data DESC", "CreationDate DESC"],
                num: 150 
            });
            dadesLocals = res.features;
            executarConsultaLocal();
        } catch (e) { container.innerHTML = "<div class='error-msg'>Error de connexió amb la capa</div>"; }
    }

    function executarConsultaLocal() {
        const container = document.getElementById("results-container");
        const filterVal = document.getElementById("select-filter").value;
        const dataVal = document.getElementById("filter-date").value;
        const anyVal = document.getElementById("select-any").value;
        const dataLimit = dataVal ? new Date(dataVal).getTime() : 0;

        const filtrades = dadesLocals.filter(f => {
            const a = f.attributes;
            const cUnitat = (filterVal === "TOTS" || a[capaActual.filterField] === filterVal);
            let cTemps = true;
            if (capaActual.id === "expedients" && anyVal !== "TOTS") {
                const dRef = a.data || a.CreationDate;
                cTemps = (new Date(dRef).getFullYear().toString() === anyVal);
            } else if (dataVal && capaActual.id !== "expedients") {
                const dRef = a.data || a.CreationDate;
                cTemps = (dRef >= dataLimit);
            }
            return cUnitat && cTemps;
        });

        document.getElementById("results-count").innerText = `${filtrades.length} registres trobats`;
        container.innerHTML = "";

        filtrades.forEach(f => {
            const a = f.attributes;
            const card = document.createElement("div");
            card.className = "result-card";
            card.onclick = () => obrirDetalls(f);

            const d = new Date(a.data || a.CreationDate);
            const dataFmt = isNaN(d) ? "---" : d.toLocaleDateString("ca-ES", {day:'2-digit', month:'2-digit'});

            if (capaActual.id === "expedients") {
                const estat = (a.estat_dels_treballs || "").toLowerCase().replace(/[\s\.]+/g, '-');
                card.classList.add(`estat-${estat}`);
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div style="flex:1;"><span class="card-titol-gran">${a._id || ''} ${a.paratge || ''}</span><div class="card-subtitol-estat">${a.estat_dels_treballs || ''}</div></div>
                        <div class="card-tag-unitat">${a.unitat_gepif || ''}</div>
                    </div>`;
            } else {
                card.style.borderLeftColor = capaActual.color;
                let titol = (capaActual.id === "treballs") ? a.unitat_gepif : a.vehicle_gepif;
                let info = (capaActual.id === "treballs") ? `Exp: ${a.id_expedient_de_feines || '---'} | Jornals: ${a.jornals || 0}` : `Km: ${a.quilometres_finals || 0} km`;
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                        <b>${dataFmt}</b><span class="card-tag-unitat" style="color:${capaActual.color}">${titol || ''}</span>
                    </div>
                    <div style="font-size:0.95rem; color:#444;">${info}</div>`;
            }
            container.appendChild(card);
        });
    }

    // 8. FITXA DE DETALL (MODAL)
    function obrirDetalls(feature) {
        const a = feature.attributes;
        const modal = document.getElementById("modal-detalls");
        const contingut = document.getElementById("modal-contingut");
        
        // Ordre prioritari de camps
        const prioritat = ["_id", "paratge", "estat_dels_treballs", "unitat_gepif", "data", "id_expedient_de_feines", "jornals", "observacions", "component_que_entra_la_informac", "vehicle_gepif", "quilometres_finals"];
        
        let html = '<div class="detall-llista">', processats = new Set();
        
        const generaCamp = (name) => {
            const c = campsCapa.find(item => item.name === name);
            if (!c) return '';
            let val = a[c.name];
            if (c.type === "date" && val) val = new Date(val).toLocaleString("ca-ES");
            if (val === null || val === undefined || val === "") val = "---";
            processats.add(c.name);
            return `<div class="detall-item"><label>${c.alias || c.name}</label><div>${val}</div></div>`;
        };

        prioritat.forEach(n => html += generaCamp(n));
        campsCapa.forEach(c => {
            if (!["objectid", "globalid", "Shape__Area", "Shape__Length", "CreationDate", "Creator", "EditDate", "Editor"].includes(c.name) && !processats.has(c.name)) {
                html += generaCamp(c.name);
            }
        });

        contingut.innerHTML = html + '</div>';
        modal.open = true;
    }
});
