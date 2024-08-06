chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.command === "print-states") {
        const { TABS, WINS, REMLIST, lastActiveTabId, lastActiveWinId, event, date } = message;
        console.log("TABS", TABS);
        console.log("WINS", WINS);
        console.log("REMLIST", REMLIST);
        console.log("event", event);
        console.log("date", date);

        // const current = document.querySelector("#current");
        // current.innerHTML = "";
        // const div = packedDom(TABS, WINS, REMLIST, lastActiveTabId, lastActiveWinId);
        // current.insertBefore(div, current.firstChild);


        // document.querySelector("#current").textContent = JSON.stringify(TABS, null, 2);
        const history = document.querySelector("#history");

        const div2 = packedDom(TABS, WINS, REMLIST, lastActiveTabId, lastActiveWinId, event, date);
        history.insertBefore(div2, history.firstChild);

    }
});

function packedDom(TABS, WINS, REMLIST, lastActiveTabId, lastActiveWinId, event, date) {
    const div = document.createElement("div");
    div.classList.add("event-item");

    const infohead = document.createElement("div");
    infohead.classList.add("infohead");
    infohead.innerHTML = `
    <div class="event-info">
        <span>Date: <span class="value">${date}</span></span>
        <span>Event: <span class="value">${event}</span></span>
    </div>
    <span>lastActiveTabId: <span class="value">${lastActiveTabId}</span></span>
    <span>lastActiveWinId: <span class="value">${lastActiveWinId}</span></span>
    `
    div.appendChild(infohead);

    const flexDiv = document.createElement("div");
    const tabwin = document.createElement("div");
    tabwin.classList.add("tabwin");
    flexDiv.classList.add("flexdiv");


    // remlist
    const remListDiv = document.createElement("div");
    const remList = jsonToTable(REMLIST, "No.", "REMLIST");
    remList.classList.add("remlist");
    remListDiv.appendChild(remList);
    remListDiv.classList.add("remlist-div");

    flexDiv.appendChild(remListDiv);


    // tabs
    const tabs = jsonToTable(TABS, "tabId", "TABS", String(lastActiveTabId));
    tabs.classList.add("tabs");
    tabwin.appendChild(tabs);

    // wins
    const wins = jsonToTable(WINS, "windowId", "WINS", String(lastActiveWinId));
    wins.classList.add("wins");
    tabwin.appendChild(wins);

    flexDiv.appendChild(tabwin);

    div.appendChild(flexDiv);

    return div;
}

function jsonToTable(json, recordTitle, tableTitle, enhanceRecordKey) {
    let table = document.createElement("table");

    const caption = document.createElement("caption");
    caption.innerHTML = tableTitle || "";
    table.appendChild(caption);

    //get first object of json
    let keys = [];
    for (let itemKey of Object.keys(json)) {
        const item = json[itemKey];
        for (key of Object.keys(item)) {
            if (!keys.includes(key)) {
                keys.push(key);
            }
        }
    }

    // create tr for each key
    let trHead = document.createElement("tr");
    let thRecordTitle = document.createElement("th");
    thRecordTitle.textContent = recordTitle || "Record";
    thRecordTitle.classList.add("record-title");
    trHead.appendChild(thRecordTitle);
    keys.forEach(key => {
        let th = document.createElement("th");
        th.textContent = key;
        trHead.appendChild(th);
    });
    table.appendChild(trHead);

    for (let itemKey of Object.keys(json)) {
        const item = json[itemKey];
        let tr = document.createElement("tr");
        table.appendChild(tr);

        // console.log("enhance", itemKey, enhanceRecordKey, itemKey === enhanceRecordKey);
        if (itemKey === enhanceRecordKey) {
            tr.classList.add("enhance-record");
        }

        // add key
        const thKey = document.createElement("th");
        thKey.textContent = itemKey;
        thKey.classList.add("record-title");
        tr.appendChild(thKey);

        for (let key of keys) {
            let td = document.createElement("td");
            const content = item[key]
            tr.appendChild(td);


            if (key === "url") {
                let a = document.createElement("a");
                a.href = content;
                let url = content;
                //shorten url
                if (url.length > 50) {
                    url = url.slice(0, 50) + "...";
                }
                a.textContent = url;
                td.appendChild(a);
                td.classList.add("url");
            } else {
                td.textContent = content;
            }
        }
    }
    return table;
}