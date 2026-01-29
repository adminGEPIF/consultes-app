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
            }
        }
    };

    let capaActual = null;
    let dadesLocals = []; // Aquí guardarem els 100 registres
    let campsCapa = [];

    const info = new OAuthInfo({ appId: CONFIG.appId, portalUrl: CONFIG.portalUrl, popup: false });
    esriId.registerOAuthInfos([info]);

    const views = {
        loading: document.getElementById("view-loading"),
        landing: document.getElementById("view-landing"),
        query: document.getElementById("view-query")
    };

    function showView(viewName) {
        Object.keys(views).forEach(key => { if (views[key]) views[key].classList.add("hidden"); });
        if (views[viewName]) views[viewName].classList.remove("hidden");
    }

    // Login inicial
    esriId.checkSignInStatus(CONFIG.portalUrl + "/sharing").then(() => showView('landing')).catch(() => esriId.getCredential(CONFIG.portalUrl + "/sharing"));

    // Navegació
    document.getElementById("btn-nav-treballs").onclick = () => carregarCapa('treballs');
    document.getElementById("btn-nav-vehicles").onclick = () => carregarCapa('vehicles');
    document.getElementById("btn-back").onclick = () => showView('landing');
    document.getElementById("btn-logout").onclick = () => { esriId.destroyCredentials(); window.location.reload(); };
    document.getElementById("btn-tanca-modal").onclick = () => document.getElementById("modal-detalls").open = false;
    
    // El botó actualitzar ara només filtra el que ja tenim a memòria
    document.getElementById("btn-refresh").onclick = () => renderitzarLlista();

    async function carregarCapa(id) {
        capaActual = CONFIG.capes[id];
        showView('query');
        document.getElementById("query-title").innerText = capaActual.title;
        document.getElementById("query-title").style.color = capaActual.color;
        
        // Buidem contenidors
        document.getElementById("results-container").innerHTML = "";
        document.getElementById("results-count").innerText = "Carregant dades del servidor...";

        await carregarSelectors();
        await descarregarDadesServidor();
    }

    async function carregarSelectors() {
        const selector = document.getElementById("select-filter");
        selector.innerHTML = '<calcite-option value="TOTS">Tots els registres</calcite-option>';
        try {
            if (capaActual.id === "vehicles") {
                const mestreLayer = new FeatureLayer({ url: CONFIG.masterVehiclesUrl });
                const res = await mestreLayer.queryFeatures({ where: "1=1", outFields: ["Codi_vehicle"], orderByFields: ["Codi_vehicle ASC"] });
                res.features.forEach(f => {
                    const val = f.attributes.Codi_vehicle;
                    const opt = document.createElement("calcite-option");
                    opt.value = val; opt.label = val;
                    selector.appendChild(opt);
                });
            } else {
                const layer = new FeatureLayer({ url: capaActual.url });
                await layer.load();
                campsCapa = layer.fields;
                const field = layer.fields.find(f => f.name === capaActual.filterField);
                if (field && field.domain && field.domain.codedValues) {
                    field.domain.codedValues.forEach(cv => {
                        const opt = document.createElement("calcite-option");
                        opt.value = cv.code; opt.label = cv.name;
                        selector.appendChild(opt);
                    });
                }
            }
        } catch (e) { console.error("Error selectors", e); }
    }

    // PAS CLAU: Descarregar 100 registres sense filtres complexos
    async function descarregarDadesServidor() {
        const layer = new FeatureLayer({ url: capaActual.url });
        try {
            await layer.load();
            campsCapa = layer.fields;

            const res = await layer.queryFeatures({
                where: "1=1", // Sense filtres de data ni de vehicle al servidor
                outFields: ["*"],
                num: 100 // Agafem els 100 últims
            });

            // Ordenem per data al Front-end (més nou a més antic)
            dadesLocals = res.features.sort((a, b) => b.attributes.data - a.attributes.data);
            
            renderitzarLlista();
        } catch (e) {
            console.error("Error descarregant:", e);
            document.getElementById("results-container").innerHTML = "<p class='error-msg'>No s'ha pogut connectar amb el servidor.</p>";
        }
    }

    // FILTRATGE LOCAL (Frontend)
    function renderitzarLlista() {
        const container = document.getElementById("results-container");
        const countLabel = document.getElementById("results-count");
        
        const filterVal = document.getElementById("select-filter").value;
        const dataVal = document.getElementById("filter-date").value; // YYYY-MM-DD
        const dataLimit = dataVal ? new Date(dataVal).getTime() : 0;

        // Filtrem l'array que tenim a memòria
        const dadesFiltrades = dadesLocals.filter(f => {
            const a = f.attributes;
            const compleixVehicle = (filterVal === "TOTS" || a[capaActual.filterField] === filterVal);
            const compleixData = (a.data >= dataLimit);
            return compleixVehicle && compleixData;
        });

        countLabel.innerText = `Mostrant ${dadesFiltrades.length} registres (de 100 recents)`;
        container.innerHTML = "";

        dadesFiltrades.forEach((f, index) => {
            const a = f.attributes;
            const d = new Date(a.data);
            const dataFmt = isNaN(d) ? "---" : d.toLocaleDateString("ca-ES", {day:'2-digit', month:'2-digit'});

            const card = document.createElement("div");
            card.className = "result-card";
            card.style.borderLeftColor = capaActual.color;
            
            // Per obrir detalls, hem de passar el feature correcte
            card.onclick = () => obrirDetalls(f);

            let titolStr = (capaActual.id === "treballs") ? (a.unitat_gepif || '---') : (a.vehicle_gepif || '---');
            let infoExtra = (capaActual.id === "treballs") ? `Exp: ${a.id_expedient_de_feines || '---'}` : `Km: ${a.quilometres_finals || 0} km`;

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:1.1rem;"><b>${dataFmt}</b></span>
                    <span style="background:${capaActual.color}15; color:${capaActual.color}; padding:2px 8px; border-radius:4px; font-weight:bold; font-size:0.85rem;">${titolStr}</span>
                </div>
                <div style="margin-top:8px; color:#444;">${infoExtra}</div>
            `;
            container.appendChild(card);
        });
    }

    function obrirDetalls(feature) {
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
            if (val === null || val === undefined || val === "") val = "---";
            processats.add(c.name);
            return `<div class="detall-item"><label style="font-weight:800; font-size:1.1rem; color:#222;">${c.alias || c.name}</label><div>${val}</div></div>`;
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
