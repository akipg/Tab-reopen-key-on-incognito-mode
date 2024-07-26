import * as Types from "./types";


// onCreated event
chrome.tabs.onCreated.addListener(async (tab) => {
    const mainWorker = await MainWorker.getInstance();
    mainWorker.rewriteTabsByTab(tab);
});

// onUpdated event
chrome.tabs.onUpdated.addListener(async (tabId: number, changeInfo: any) => {
    const mainWorker = await MainWorker.getInstance();
    console.log("onUpdated", tabId, changeInfo, mainWorker);
    const data = mainWorker.data;
    if ("url" in changeInfo) {
        data.tabs[tabId].url = changeInfo.url;
    }
    if ("index" in changeInfo) {
        data.tabs[tabId].index = changeInfo.index;
    }
});

chrome.tabs.onMoved.addListener(async () => {
    const mainWorker = await MainWorker.getInstance();
    mainWorker.getAllTabs();
    mainWorker.getAllWindows();
});
chrome.tabs.onAttached.addListener(async () => {
    const mainWorker = await MainWorker.getInstance();
    mainWorker.getAllTabs();
    mainWorker.getAllWindows();
});
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const mainWorker = await MainWorker.getInstance();
    const data = mainWorker.data;
    data.lastActiveTabId = activeInfo.tabId;
    data.lastActiveWindowId = activeInfo.windowId;
});
chrome.windows.onCreated.addListener(async (window) => {
    const mainWorker = await MainWorker.getInstance();
    mainWorker.getAllTabs();
    mainWorker.getAllWindows();
})
chrome.windows.onBoundsChanged.addListener(async (window) => {
    const mainWorker = await MainWorker.getInstance();
    mainWorker.getAllWindows();
})

// onRemoved event
chrome.windows.onRemoved.addListener(async (windowId) => {

});


chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    const mainWorker = await MainWorker.getInstance();
    console.log(mainWorker.data)
    await mainWorker.data.save();
    console.log("onRemoved", "tabId", tabId, "removeInfo", removeInfo, mainWorker);
    if (!mainWorker.data.tabs[tabId].incognito) {
        const record: Types.RestoreRecord<Types.RestoreSessionInfo> = {
            recordId: mainWorker.createNewRecordId(),
            info_type: "session",
            info: {
                info_type: "session",
                sessionId: undefined
            }
        }
        mainWorker.data.restoreRecords.unshift(record);
        console.log("Current restoreRecords:", mainWorker.data.restoreRecords);
        return;
    }
    const tabInfos = mainWorker.data.tabs;
    const windowInfos = mainWorker.data.windows;
    const restoreRecords = mainWorker.data.restoreRecords;
    // when closing a window
    if (removeInfo.isWindowClosing) {
        const record: Types.RestoreRecord<Types.RestoreWindowInfo> = {
            recordId: mainWorker.createNewRecordId(),
            info_type: "window",
            isWindowClosing: removeInfo.isWindowClosing,
            info: {
                info_type: "window",
                tabs: windowInfos[removeInfo.windowId].tabs,
                lastActiveTabId: tabInfos[tabId].active ? tabId : -1,
                incognito: windowInfos[removeInfo.windowId].incognito,
                active: tabInfos[tabId].active,
                windowId: removeInfo.windowId,
                width: windowInfos[removeInfo.windowId].width,
                height: windowInfos[removeInfo.windowId].height,
                top: windowInfos[removeInfo.windowId].top,
                left: windowInfos[removeInfo.windowId].left,
                type: windowInfos[removeInfo.windowId].type,
                state: windowInfos[removeInfo.windowId].state,
            }
        }
        restoreRecords.unshift(record);
        console.log("Current restoreRecords:", mainWorker.data.restoreRecords);
    }
    else {
        const record: Types.RestoreRecord<Types.RestoreTabInfo> = {
            recordId: mainWorker.createNewRecordId(),
            info_type: "tab",
            isWindowClosing: removeInfo.isWindowClosing,
            info: tabInfos[tabId]
        }
        restoreRecords.unshift(record);
        console.log("Current restoreRecords:", mainWorker.data.restoreRecords);
    }

    // up to XX
    if (restoreRecords.length > 30) {
        restoreRecords.pop();
    }

    // remove tabinfo
    delete tabInfos[tabId];
});

// add to chrome commands
chrome.commands.onCommand.addListener(async (command, tab) => {
    if (command == "reopen-tab") {
        const mainWorker = await MainWorker.getInstance();
        console.log("command reopen-tab", mainWorker);
        mainWorker.commandRestore();
    }
});
chrome.runtime.onSuspendCanceled.addListener(async () => {
    console.log("SUSPENDED");
    const mainWorker = await MainWorker.getInstance();
    mainWorker.data.save();
});


class MainWorkerData {
    public restoreRecords: Types.RestoreRecord<Types.RestoreInfo>[] = [];
    public tabs: { [key: number]: Types.RestoreTabInfo } = {};
    public windows: { [key: number]: Types.RestoreWindowInfo } = {};
    public recordIdCounts: number = 0
    public lastActiveTabId: number = -1
    public lastActiveWindowId: number = -1
    private static readonly STORAGE_KEY = "mainWorkerData";

    static get initialData(): MainWorkerData {
        return new MainWorkerData();
    }

    static async load(): Promise<MainWorkerData> {
        // Load() is called at initializing or reloading extension
        console.log("Loading data...");

        const ret: { [key: string]: any } = await chrome.storage.local.get(
            { "mainWorkerData": MainWorkerData.initialData }
        );
        console.log("return from storage", ret);

        let storageData;
        if (ret) {
            storageData = ret["mainWorkerData"] as MainWorkerData;
        }
        else {
            console.log("Error loading data", this);
            storageData = MainWorkerData.initialData
        }
        const data = new MainWorkerData();
        Object.assign(data, storageData);
        console.log("data is loaded!", data);
        return data;
    }


    async save() {
        // save() is called at suspending extension
        console.log("Saving data...");
        // const dataJsonStr = JSON.stringify(this);
        await chrome.storage.local.set({ "mainWorkerData": this });
        console.log("data is saved!", this);
    }
}

class MainWorker {
    private static _instance: MainWorker | undefined = undefined;
    private static _data: MainWorkerData | undefined = undefined;
    private _tabIdToRecordId: { [key: number]: Types.RestoreRecordId } = {};
    private _windowIdToRecordId: { [key: number]: Types.RestoreRecordId } = {};
    private _sessionIdToRecordId: { [key: number]: Types.RestoreRecordId } = {};

    static async getInstance(): Promise<MainWorker> {
        if (MainWorker._instance === undefined) {
            MainWorker._instance = new MainWorker();
        }
        if (MainWorker._data === undefined) {
            // MainWorker._data = await MainWorkerData.load();
            MainWorker._data = await MainWorkerData.load();
        }
        return MainWorker._instance;
    }

    get data(): MainWorkerData {
        return MainWorker._data!;
    }

    async getAllTabs() {
        console.log("Getting all tabs...")
        const _tabs: chrome.tabs.Tab[] = await chrome.tabs.query({});
        for (const tab of _tabs) {
            this.rewriteTabsByTab(tab);
        }
        console.log("All tabs", this.data.tabs);
    }

    rewriteTabsByTab(tab: chrome.tabs.Tab) {
        if (tab.id) {
            this.data.tabs[tab.id] = {
                info_type: "tab",
                tabId: tab.id,
                url: tab.url!,
                incognito: tab.incognito,
                index: tab.index,
                windowId: tab.windowId,
                active: tab.active
            };
        }
    }


    async getAllWindows() {
        console.log("Getting all windows...")
        const windows = await chrome.windows.getAll({});
        for (const window of windows) {
            if (window.id) {
                // Create tab info
                let tabs: Types.RestoreTabInfo[] = [];
                let lastActiveTabId = -1;
                if (window.tabs) {
                    for (const tab of window.tabs) {
                        tabs.push(this.createTabInfo(tab));
                        lastActiveTabId = tab.active ? tab.id! : lastActiveTabId;
                    }
                }

                const activeWindow = await chrome.windows.getCurrent();

                // Create window info
                this.data.windows[window.id] = {
                    info_type: "window",
                    lastActiveTabId: lastActiveTabId,
                    active: window.id === activeWindow.id,
                    incognito: window.incognito,
                    tabs: tabs,
                    windowId: window.id!,
                    width: window.width,
                    height: window.height,
                    top: window.top,
                    left: window.left,
                    type: window.type,
                    state: window.state!,
                } as Types.RestoreWindowInfo;
            }
        }
        console.log("all windows", this.data.windows);
    }

    public createNewRecordId() {
        this.data.recordIdCounts++;
        if (this.data.recordIdCounts > 100000) {
            this.data.recordIdCounts = 0;
        }
        const randomStr = Math.random().toString(36).slice(-8);
        return this.data.recordIdCounts.toString() + "_" + randomStr;
    }

    createTabInfo(tab: chrome.tabs.Tab): Types.RestoreTabInfo {
        const info: Types.RestoreTabInfo = {
            info_type: "tab",
            tabId: tab.id!,
            url: tab.url!,
            incognito: tab.incognito,
            index: tab.index,
            windowId: tab.windowId,
            active: tab.active
        };
        return info;
    }

    commandRestore() {
        const restoreRecords = this.data.restoreRecords;
        const targetRecord = this.data.restoreRecords.shift();
        console.log("commandRestore", "restoreRecords", this.data.restoreRecords, "targetRecord", targetRecord);
        if (!targetRecord || targetRecord.info_type === "session") {
            // init or not incognito
            chrome.sessions.restore();
            console.log("Called chrome.sessions.restore();");
            return;
        }
        if (targetRecord.info_type === "window" || targetRecord.isWindowClosing) {
            // in incognito and window closed
            // create tab list to reopen: tabRecordsToReopen
            console.log("Window closed", targetRecord);
            const targetRecordWin = targetRecord as Types.RestoreRecord<Types.RestoreWindowInfo>;
            let tabRecordsToReopen: Types.RestoreRecord<Types.RestoreTabInfo>[] = []
            let windowRecordsTobeRemoved: Types.RestoreRecord<Types.RestoreWindowInfo>[] = [targetRecordWin]
            // let _urls = [lastRecordWin.info.url];
            let _tabIndexToActivate: number;
            let _urls: string[] = [];
            let _skip = 0;
            while (restoreRecords.length >= 1) {
                const checkRecord = restoreRecords[0];
                if (checkRecord.info_type == "tab") {
                    let checkRecordTab = checkRecord as Types.RestoreRecord<Types.RestoreTabInfo>;
                    if (checkRecordTab.info.windowId == targetRecordWin.info.windowId) {
                        tabRecordsToReopen.push(checkRecordTab);
                        if (checkRecordTab.info.active) _tabIndexToActivate = checkRecordTab.info.index;
                        restoreRecords.shift()
                    } else {
                        break;
                    }
                } else {
                    break
                }
            }
            // create a window
            let _newWinId;

            // create option
            let createOption;
            // const new_type: chrome.windows.CreateType = ["normal", "popup", "panel"].includes(targetRecordWin.info.type) ? targetRecordWin.info.type as string : "normal";
            const new_type: chrome.windows.CreateType = targetRecordWin.info.type as chrome.windows.CreateType;
            if (targetRecordWin.info.state === "maximized") {
                // create option when maximized
                createOption = {
                    url: _urls,
                    incognito: true,
                    focused: true,
                    type: targetRecordWin.info.type as chrome.windows.CreateType,
                    state: "maximized" as chrome.windows.WindowState,
                }
            }
            else {
                // create option when not maximized
                createOption = {
                    url: _urls,
                    incognito: true,
                    focused: true,
                    height: targetRecordWin.info.height,
                    width: targetRecordWin.info.width,
                    left: targetRecordWin.info.left,
                    top: targetRecordWin.info.top,
                    type: targetRecordWin.info.type as chrome.windows.CreateType,
                }
            }
            // create a window
            console.log("Creating a window", createOption);
            chrome.windows.create(createOption, (newWindow: chrome.windows.Window | undefined) => {
                if (newWindow) {
                    //update tab active
                    chrome.tabs.query({ index: _tabIndexToActivate, windowId: newWindow.id }, (tabs: any) => {
                        chrome.tabs.update(tabs[0].id, { active: true });
                    })
                }
            });

        }
        else {
            // in incognito and tab closed
            console.log("Tab closed", targetRecord);
            const targetRecordTab = targetRecord as Types.RestoreRecord<Types.RestoreTabInfo>;
            console.log("Creating a tab", targetRecordTab);
            chrome.tabs.create({
                active: true, //(lastRecord.id == lastActiveTabId),
                index: targetRecordTab.info.index,
                url: targetRecordTab.info.url,
                windowId: targetRecordTab.info.windowId
            })
        }
    }
}

