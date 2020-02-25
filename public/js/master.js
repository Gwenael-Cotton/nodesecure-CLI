"use strict";

// CONSTANTS (for nodes colors)
const C_MAIN = "#01579B";
const C_INDIRECT = "rgba(100, 200, 200, 0.30)";
const C_WARN = "rgba(210, 115, 115, 0.30)";
const C_NORMAL = "rgba(150, 200, 200, 0.15)";
const C_SELECTED = "rgba(170, 100, 200, 0.50)";
const C_TRS = "rgba(150, 150, 150, 0.02)";

const LEFT_MENU_DESC = "click on a package to show a complete description here";

const networkGraphOptions = {
    nodes: {
        mass: 6,
        shape: "box",
        size: 5,
        font: {
            face: "Roboto",
            vadjust: 1,
            size: 38,
            color: "#ECEFF1",
            bold: {
                face: "Roboto",
                color: "#F9FBE7"
            }
        },
        margin: 14,
        shadow: {
            enabled: true,
            color: "rgba(20, 20, 20, 0.2)"
        }
    },
    edges: {
        arrows: "from",
        hoverWidth: 3,
        selectionWidth: 3,
        width: 2
    },
    physics: {
        forceAtlas2Based: {
            gravitationalConstant: -35,
            centralGravity: 0.005,
            springLength: 230,
            springConstant: 0.18
        },
        maxVelocity: 150,
        solver: "forceAtlas2Based",
        timestep: 0.35,
        stabilization: {
            enabled: true,
            iterations: 1000
        }
    }
};


function getColor(id, flags) {
    if (id === 0) {
        return C_MAIN;
    }
    else if (flags.hasSuspectImport || flags.hasMinifiedCode) {
        return C_WARN;
    }
    else if (flags.hasIndirectDependencies) {
        return C_INDIRECT;
    }

    return C_NORMAL;
}

function getFlags(flags, metadata, vulnerabilities = []) {
    const flagList = [];
    if (flags.isGit) {
        flagList.push("☁️");
    }
    if (flags.hasIndirectDependencies) {
        flagList.push("🌲");
    }
    if (flags.hasSuspectImport) {
        flagList.push("⚠️");
    }
    if (flags.hasCustomResolver) {
        flagList.push("💎");
    }
    if (flags.hasLicense === false) {
        flagList.push("📜");
    }
    if (flags.hasMultipleLicenses) {
        flagList.push("📚");
    }
    if (flags.hasMinifiedCode) {
        flagList.push("🔬");
    }
    if (flags.isDeprecated) {
        flagList.push("⛔️");
    }
    if (flags.hasExternalCapacity) {
        flagList.push("🌍");
    }
    if (flags.hasScript) {
        flagList.push("📦");
    }
    if (flags.hasMissingOrUnusedDependency) {
        flagList.push("👀");
    }
    if (!metadata.hasReceivedUpdateInOneYear && flags.hasOutdatedDependency) {
        flagList.push("💀");
    }
    if (metadata.hasManyPublishers) {
        flagList.push("💕");
    }
    if (metadata.hasChangedAuthor) {
        flagList.push("👥");
    }
    if (vulnerabilities.length > 0) {
        flagList.push("🚨");
    }

    return flagList.reduce((acc, cur) => `${acc} ${cur}`, "");
}

document.addEventListener("DOMContentLoaded", async() => {
    const networkLoaderElement = document.getElementById("network-loader");
    const networkElement = document.getElementById("network-graph");
    const dataListElement = document.getElementById("package-list");
    const modal = document.querySelector(".modal");

    document.getElementById("legend_popup_btn").addEventListener("click", () => {
        toggleModal("popup-legends");
        const legendsFlagsFragment = document.createDocumentFragment();
        for (const [flagName, { title }] of Object.entries(FLAGS)) {
            legendsFlagsFragment.appendChild(createLegend(flagName, title));
        }
        document.getElementById("flag-legends").appendChild(legendsFlagsFragment);
    });
    document.querySelector(".close-button").addEventListener("click", toggleModal);
    modal.addEventListener("click", () => {
        if (event.target === modal) {
            toggleModal();
        }
    });

    // Hydrate nodes & edges with the data
    const nodesDataArr = [];
    const edgesDataArr = [];
    const linker = new Map();

    const [data, FLAGS] = await Promise.all([
        request("/data"), request("/flags")
    ]);
    const dataEntries = Object.entries(data);

    let indirectDependenciesCount = 0;
    let totalSize = 0;
    let highlightActive = false;
    const licensesCount = { Unknown: 0 };
    const extensionsCount = {};
    const authorsList = new Map();

    // Generate network!
    for (const [packageName, descriptor] of dataEntries) {
        const { metadata, vulnerabilities, versions } = descriptor;

        for (const currVersion of versions) {
            const opt = descriptor[currVersion];
            const { id, usedBy, flags, size, license, author, composition } = opt;
            opt.name = packageName;
            opt.version = currVersion;
            opt.hidden = false;

            for (const extName of composition.extensions) {
                if (extName === "") {
                    continue;
                }
                extensionsCount[extName] = Reflect.has(extensionsCount, extName) ? ++extensionsCount[extName] : 1;
            }

            if (typeof license === "string") {
                licensesCount.Unknown++;
            }
            else {
                for (const licenseName of license.uniqueLicenseIds) {
                    licensesCount[licenseName] = Reflect.has(licensesCount, licenseName) ? ++licensesCount[licenseName] : 1;
                }
            }
            handleAuthor(author);

            if (flags.hasIndirectDependencies) {
                indirectDependenciesCount++;
            }
            totalSize += size;
            const flagStr = getFlags(flags, metadata, vulnerabilities);
            {
                const content = `<p>${flagStr.replace(/\s/g, "")} ${packageName}</p><b>${currVersion}</b>`;
                dataListElement.insertAdjacentHTML("beforeend", `<div class="package hide" data-value="${id}">${content}</div>`);
            }
            const label = `${packageName}@${currVersion}${flagStr}\n<b>[${formatBytes(size)}]</b>`;
            const color = getColor(id, flags);

            linker.set(Number(id), opt);
            nodesDataArr.push({ id, label, color, font: { multi: "html" } });

            for (const [name, version] of Object.entries(usedBy)) {
                edgesDataArr.push({ from: id, to: data[name][version].id });
            }
        }
    }
    {
        const { name, version } = linker.get(0);
        document.getElementById("main-project-name").textContent = name;
        document.getElementById("main-project-version").textContent = `version ${version}`;
        document.querySelector(".current-project").addEventListener("click", () => {
            network.emit("click", { nodes: [0] });
        });
    }
    networkElement.click();

    // Setup global stats
    document.getElementById("total-packages").innerHTML = dataEntries.length;
    document.getElementById("indirect-dependencies").innerHTML = indirectDependenciesCount;
    document.getElementById("total-size").innerHTML = formatBytes(totalSize);
    {
        const licenseFragment = document.createDocumentFragment();
        const licensesEntries = [...Object.entries(licensesCount)].sort(([, left], [, right]) => right - left);

        for (const [licenseName, licenseCount] of licensesEntries) {
            if (licenseCount === 0) {
                continue;
            }
            const divEl = document.createElement("div");
            divEl.classList.add("license");
            divEl.classList.add("stat-case");
            divEl.textContent = `${licenseName} (${licenseCount})`;
            licenseFragment.appendChild(divEl);
        }
        document.getElementById("license-counts").appendChild(licenseFragment);
    }

    {
        const extFragment = document.createDocumentFragment();
        const extEntries = [...Object.entries(extensionsCount)].sort(([, left], [, right]) => right - left);

        for (const [extName, extCount] of extEntries) {
            const divEl = document.createElement("div");
            divEl.classList.add("ext");
            divEl.classList.add("stat-case");
            divEl.textContent = `${extName} (${extCount})`;
            extFragment.appendChild(divEl);
        }
        document.getElementById("extensions-counts").appendChild(extFragment);
    }

    {
        document.getElementById("stat-maintainers-title").textContent = `${authorsList.size} Maintainers`;
        const authorsFragment = document.createDocumentFragment();
        for (const [name, desc] of authorsList.entries()) {
            authorsFragment.appendChild(createAvatar(name, desc));
        }
        document.getElementById("maintainers-list").appendChild(authorsFragment);
    }

    // Create required DataSet for the Network Graph
    const nodes = new vis.DataSet(nodesDataArr);
    const edges = new vis.DataSet(edgesDataArr);

    // Initialize vis Network
    const network = new vis.Network(networkElement, { nodes, edges }, networkGraphOptions);
    network.on("stabilizationIterationsDone", () => {
        networkLoaderElement.style.display = "none";
        network.stopSimulation();
        network.focus(0, { animation: true, scale: 0.35 });
    });
    network.on("click", neighbourHighlight);
    network.on("click", updateShowInfoMenu);
    network.stabilize(500);
    const bar = new SearchBar(network, linker);
    bar.allSearchPackages.forEach((element) => element.addEventListener("click", searchResultClick));

    function* searchForNeighbourIds(selectedNode) {
        const { name, version } = linker.get(selectedNode);
        for (const descriptor of Object.values(data)) {
            for (const currVersion of descriptor.versions) {
                const { id, usedBy } = descriptor[currVersion];
                if (Reflect.has(usedBy, name) && usedBy[name] === version) {
                    yield* searchForNeighbourIds(id);
                    yield id;
                }
            }
        }
    }

    async function updateShowInfoMenu(params) {
        network.stopSimulation();
        const showInfoElem = document.getElementById("show-info");
        const packageInfoTemplate = document.getElementById("package-info");

        if (params.nodes.length > 0) {
            showInfoElem.innerHTML = "";

            const clone = document.importNode(packageInfoTemplate.content, true);
            const currentNode = params.nodes[0];
            const selectedNode = linker.get(Number(currentNode));
            const { name, version, author, flags, composition } = selectedNode;
            const { metadata, vulnerabilities } = data[name];

            const btnShow = clone.getElementById("btn_showOrHide");
            const btnVuln = clone.getElementById("btn_vuln");
            btnShow.innerHTML = selectedNode.hidden ?
                "<i class=\"icon-eye\"></i><p>Show childs</p>" :
                "<i class=\"icon-eye-off\"></i><p>Hide childs</p>";

            if (metadata.dependencyCount === 0) {
                btnShow.classList.add("disabled");
            }
            else {
                btnShow.addEventListener("click", function showOrHide() {
                    const currBtn = document.getElementById("btn_showOrHide");
                    currBtn.classList.toggle("active");
                    const hidden = !selectedNode.hidden;
                    if (hidden) {
                        currBtn.innerHTML = "<i class=\"icon-eye\"></i><p>Show childs</p>";
                    }
                    else {
                        currBtn.innerHTML = "<i class=\"icon-eye-off\"></i><p>Hide childs</p>";
                    }

                    network.startSimulation();
                    nodes.update([...searchForNeighbourIds(currentNode)].map((id) => ({ id, hidden })));
                    selectedNode.hidden = !selectedNode.hidden;
                });
            }

            if (vulnerabilities.length === 0) {
                btnVuln.classList.add("disabled");
            }

            {
                const nameElement = clone.querySelector(".name");
                if (name.length > 16) {
                    nameElement.style["font-size"] = "18px";
                }
                nameElement.textContent = name;
            }
            clone.querySelector(".version").textContent = version;
            {
                const descElement = clone.querySelector(".desc");
                const desc = selectedNode.description.trim();
                if (desc === "") {
                    descElement.style.display = "none";
                }
                else {
                    descElement.textContent = desc;
                    if (desc.length <= 60) {
                        descElement.style["text-align"] = "center";
                    }
                }
            }

            let fAuthor = typeof author === "string" ? author : (author.name || "Unknown");
            fAuthor = fAuthor.length > 26 ? `${fAuthor.slice(0, 26)}...` : fAuthor;

            const lastUpdate = Intl.DateTimeFormat("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "numeric",
                minute: "numeric",
                second: "numeric"
            }).format(new Date(metadata.lastUpdateAt));

            {
                const licenses = selectedNode.license === "unkown license" ?
                    "unkown license" : selectedNode.license.uniqueLicenseIds.join(", ");
                const fields = clone.querySelector(".fields");
                const fieldsFragment = document.createDocumentFragment();
                fieldsFragment.appendChild(createLiField("Author", fAuthor));
                fieldsFragment.appendChild(createLiField("License", licenses));
                fieldsFragment.appendChild(createLiField("Size on (local) system", formatBytes(selectedNode.size)));
                fieldsFragment.appendChild(createLiField("Homepage", metadata.homepage || "N/A", true));
                fieldsFragment.appendChild(createLiField("Last release (version)", metadata.lastVersion));
                fieldsFragment.appendChild(createLiField("Last release (date)", lastUpdate));
                fieldsFragment.appendChild(createLiField("Number of published releases", metadata.publishedCount));
                fields.appendChild(fieldsFragment);
            }

            {
                const flagsElement = clone.querySelector(".flags");
                const textContent = getFlags(flags, metadata);
                if (textContent === "") {
                    flagsElement.style.display = "none";
                }
                else {
                    const flagsFragment = document.createDocumentFragment();
                    for (const icon of textContent) {
                        if (Reflect.has(FLAGS, icon)) {
                            flagsFragment.appendChild(createTooltip(icon, FLAGS[icon].tooltipDescription));
                        }
                    }
                    flagsElement.appendChild(flagsFragment);
                }
            }

            {
                const builtInDeps = new Set(composition.required_builtin);
                const requiredDeps = [...composition.required.filter((name) => !builtInDeps.has(name))];
                const thirdParty = requiredDeps.filter((name) => !name.startsWith("."));
                const internal = requiredDeps.filter((name) => name.startsWith("."));

                renderItemsList(clone.getElementById("nodedep"), composition.required_builtin);
                renderItemsList(clone.getElementById("extensions"), composition.extensions);
                renderItemsList(clone.getElementById("minifiedfiles"), composition.minified);
                renderItemsList(clone.getElementById("unuseddep"), composition.unused);
                renderItemsList(clone.getElementById("missingdep"), composition.missing);
                renderItemsList(clone.getElementById("requireddep"), thirdParty);
                renderItemsList(clone.getElementById("internaldep"), internal);
            }

            showInfoElem.appendChild(clone);

            // Request sizes on the bundlephobia API
            try {
                const {
                    gzip, size, dependencySizes
                } = await request(`https://bundlephobia.com/api/size?package=${name}@${version}`);
                const fullSize = dependencySizes.reduce((prev, curr) => prev + curr.approximateSize, 0);

                document.querySelector(".size-gzip").textContent = formatBytes(gzip);
                document.querySelector(".size-min").textContent = formatBytes(size);
                document.querySelector(".size-full").textContent = formatBytes(fullSize);
            }
            catch (err) {
                // ignore
            }
        }
        else {
            showInfoElem.innerHTML = `<div class="select-project"><p>${LEFT_MENU_DESC}</p></div>`;
        }
    }

    function neighbourHighlight(params) {
        network.stopSimulation();
        const allNodes = nodes.get({ returnType: "Object" });

        // if something is selected:
        if (params.nodes.length > 0) {
            highlightActive = true;
            const selectedNode = params.nodes[0];

            // mark all nodes as hard to read.
            for (const node of Object.values(allNodes)) {
                node.color = C_TRS;
            }

            // get the second degree nodes
            const connectedNodes = network.getConnectedNodes(selectedNode);
            const allConnectedNodes = [];
            for (let id = 0; id < connectedNodes.length; id++) {
                allConnectedNodes.push(...network.getConnectedNodes(connectedNodes[id]));
            }

            // all second degree nodes get a different color and their label back
            for (let id = 0; id < allConnectedNodes.length; id++) {
                allNodes[allConnectedNodes[id]].color = C_NORMAL;
            }

            // all first degree nodes get their own color and their label back
            for (let id = 0; id < connectedNodes.length; id++) {
                allNodes[connectedNodes[id]].color = C_SELECTED;
            }

            // the main node gets its own color and its label back.
            allNodes[selectedNode].color = C_MAIN;
            network.focus(selectedNode, { animation: true, scale: 0.35 });
        }
        else if (highlightActive) {
            highlightActive = false;
            for (const node of Object.values(allNodes)) {
                const { id, flags } = linker.get(Number(node.id));
                node.color = getColor(id, flags);
            }
        }

        // transform the object into an array
        nodes.update(Object.values(allNodes));
    }

    function toggleModal(templateName) {
        const infoBox = document.querySelector(".modal-content > .infobox");
        if (typeof templateName === "string") {
            const templateElement = document.getElementById(templateName);
            infoBox.appendChild(templateElement.content.cloneNode(true));
        }
        else {
            infoBox.innerHTML = "";
        }
        modal.classList.toggle("show");
    }

    function searchResultClick () {
        bar.resultRowClick(this.getAttribute("data-value"));
    }

    function handleAuthor(author) {
        if (author === "N/A") {
            return;
        }
        let name = null;
        let email = null;
        let url = null;

        if (typeof author === "string") {
            const match = /^(.*)<(.*)>/g.exec(author);
            name = match === null ? author : match[1].trim();
            email = match === null ? null : match[2].trim();
        }
        else {
            if (typeof author.name !== "string") {
                return;
            }
            name = author.name;
            email = author.email || null;
            url = author.url || null;
        }

        if (authorsList.has(name)) {
            authorsList.get(name).count++;
        }
        else {
            authorsList.set(name, { email, url, count: 1 });
        }
    }
});
