var TABS = {}
var WINS = {}
var REMLIST = []
var lastActiveTabId;
var lastActiveWinId;

// chrome.tabs.create({ url: chrome.runtime.getURL("debug.html") });

self.debug_command_restore = function(){
    command_restore();
    return true;
}

self.getAllTabs = function(){
    return new Promise((resolve) => {
        chrome.tabs.query({}, tabs => 
            resolve(tabs)
        );
    });
};

function printStates(event) {
    console.log({ TABS, WINS, REMLIST, lastActiveTabId, lastActiveWinId });

    chrome.tabs.query({ url: "chrome-extension://alkfhfgkepamooonkjdolamnbilhkmjg/debug.html" }, tabs => {
        if (tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, {
                command: "print-states",
                TABS, WINS, REMLIST, lastActiveTabId, lastActiveWinId, event, date: new Date().toLocaleString()
            });
        }
    });
}

self.printStates = printStates;

async function main() {
    await getAllTabs();
    await getAllWins();

    // onCreated event
    chrome.tabs.onCreated.addListener(tab => {
        rewriteTABSbytab(tab);
        printStates("[EVENT] tabs.onCreated");
    });

    // onUpdated event
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        for (key of ["url", "index"]) {
            if (changeInfo[key]) {
                TABS[tabId][key] = changeInfo[key];
            }
        }
        printStates("[EVENT] tabs.onUpdated");
    });

    chrome.tabs.onMoved.addListener(() => {
        getAllTabs();
        getAllWins();
        printStates("[EVENT] tabs.onMoved");
    });
    chrome.tabs.onAttached.addListener(() => {
        getAllTabs();
        getAllWins();
        printStates("[EVENT] tabs.onAttached");
    });
    chrome.tabs.onActivated.addListener((activeInfo) => {
        lastActiveTabId = activeInfo.tabId;
        lastActiveWinId = activeInfo.windowId;
        getAllTabs();
        getAllWins();
        printStates("[EVENT] tabs.onActivated");
    });
    chrome.windows.onCreated.addListener(window => {
        getAllTabs();
        getAllWins();
        printStates("[EVENT] windows.onCreated");
    })
    chrome.windows.onBoundsChanged.addListener(window => {
        getAllWins();
        printStates("[EVENT] windows.onBoundsChanged");
    })

    // onRemoved event
    chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
        let rem = {};
        REMLIST.unshift(rem);
        Object.assign(rem, TABS[tabId]);
        // when closing a window
        console.log("isWindowClosing", removeInfo.isWindowClosing, removeInfo)
        if (removeInfo.isWindowClosing || WINS[removeInfo.windowId].nTabs == 1) {
            rem.isWindowClosed = true;
            rem.tabId = tabId;
            rem.active = TABS[tabId].active;
            rem.windowId = removeInfo.windowId;
            rem.width = WINS[removeInfo.windowId].width;
            rem.height = WINS[removeInfo.windowId].height;
            rem.top = WINS[removeInfo.windowId].top;
            rem.left = WINS[removeInfo.windowId].left;
            rem.type = WINS[removeInfo.windowId].type;
            rem.state = WINS[removeInfo.windowId].state;
        }
        // when closing a tab
        else {

        }

        // up to XX
        if (REMLIST.length > 30) {
            REMLIST.pop();
        }

        // remove from TABS
        delete TABS[tabId];
        WINS[removeInfo.windowId].nTabs--;
        printStates("[EVENT] tabs.onRemoved");
    });

    // add to chrome commands
    chrome.commands.onCommand.addListener((command, tab) => {
        if (command == "reopen_tab") {
            command_restore();
        } else if (command == "open-debug-tab") {
            chrome.tabs.create({ url: chrome.runtime.getURL("debug.html") });
        } else if (command == "print-states") {
            chrome.windows.create({ url: chrome.runtime.getURL("debug.html") });
        }
    });

    return true;
}


function getAllTabs() {
    return new Promise((resolve) => {
        chrome.tabs.query({}, tabs => {
            for (tab of tabs) {
                rewriteTABSbytab(tab);
            }
            resolve();
        });
    });
}

function getAllWins() {
    return new Promise((resolve) => {
        chrome.windows.getAll({}, wins => {
            for (win of wins) {
                chrome.tabs.query({ windowId: win.id }, tabs => {
                    WINS[win.id] = win;
                    WINS[win.id].nTabs = tabs.length;
                });
            }
            resolve();
        });
    });
}

function rewriteTABSbytab(tab) {
    TABS[tab.id] = {
        url: tab.url,
        incognito: tab.incognito,
        index: tab.index,
        windowId: tab.windowId,
        active: tab.active
    };
}


async function command_restore(tab_command) {
    printStates("[COMMAND] BEFORE command_restore");
    let rem_last = REMLIST.shift();
    // init or not incognito
    if (!rem_last || !rem_last.incognito) {
        chrome.sessions.restore();
        console.log("called chrome.sessions.restore();");
    }
    // in incognito and window closed
    else if (rem_last.isWindowClosed) {
        // create tab list to reopen: rems
        let _rems = [rem_last]
        let _winId = rem_last.windowId;
        let _urls = [rem_last.url];
        let _tabIndexToActivate;
        while (true) {
            if (REMLIST.length == 0 || !(REMLIST[0].windowId == _winId && REMLIST[0].isWindowClosed)) {
                break;
            }
            else {
                _rem = REMLIST.shift()
                _urls.push(_rem.url);
                if (_rem.tabId == lastActiveTabId) _tabIndexToActivate = _rem.index;
                _rems.push(_rem);
            }
        }
        // create a window
        let _newWinId;
        await (async () => {
            return new Promise(resolve => {
                // create option
                let createOption;
                // create option when maximized
                if (rem_last.state == "maximized") {
                    createOption = {
                        url: _urls,
                        incognito: true,
                        focused: true,
                        type: rem_last.type,
                        state: rem_last.state
                    }
                }
                // create option when not maximized
                else {
                    createOption = {
                        url: _urls,
                        incognito: true,
                        focused: true,
                        height: rem_last.height,
                        width: rem_last.width,
                        left: rem_last.left,
                        top: rem_last.top,
                        type: rem_last.type,
                    }
                }
                // create a window
                chrome.windows.create(createOption, win => {
                    _newWinId = win.id;
                    resolve();
                });
            });
        })();
        //update tab active
        chrome.tabs.query({ index: _tabIndexToActivate, windowId: _newWinId }, tabs => {
            chrome.tabs.update(tabs[0].id, { active: true });
        })
    }
    // in incognito and tab closed
    else {
        chrome.tabs.create({
            active: true, //(rem_last.id == lastActiveTabId),
            index: rem_last.index,
            url: rem_last.url,
            windowId: rem_last.windowId
        })
    }
    printStates("[COMMAND] AFTER command_restore");
}


main();