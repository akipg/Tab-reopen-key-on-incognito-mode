var TABS = {}
var WINS = {}
var REMLIST = []
var lastActiveTabId;
var lastActiveWinId;
var WINMAP = {};

async function main() {
    await getAllTabs();
    await getAllWins();

    // onCreated event
    chrome.tabs.onCreated.addListener(tab => {
        rewriteTABSbytab(tab);
        getAllWins();
    });

    // onUpdated event
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        for (key of ["url", "index"]) {
            if (changeInfo[key]) {
                TABS[tabId][key] = changeInfo[key];
            }
        }
    });

    chrome.tabs.onMoved.addListener(() => {
        getAllTabs();
        getAllWins();
    });
    chrome.tabs.onAttached.addListener(() => {
        getAllTabs();
        getAllWins();
    });
    chrome.tabs.onActivated.addListener((activeInfo) => {
        lastActiveTabId = activeInfo.tabId;
        lastActiveWinId = activeInfo.windowId;
    });
    chrome.windows.onCreated.addListener(window => {
        getAllTabs();
        getAllWins();
    })
    chrome.windows.onBoundsChanged.addListener(window => {
        getAllWins();
    })

    // onRemoved event
    chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
        let rem = {};
        REMLIST.unshift(rem);
        Object.assign(rem, TABS[tabId]);
        const winId = TABS[tabId].windowId;
        WINS[winId].nTabs -= 1;
        // when closing a window
        if (removeInfo.isWindowClosing || WINS[winId].nTabs == 0) {
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
    });

    // add to chrome commands
    chrome.commands.onCommand.addListener((command, tab) => {
        if (command == "reopen_tab") {
            command_restore();
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
                WINS[win.id] = win;
                chrome.tabs.query({ windowId: win.id }, tabs => {
                    WINS[win.id].nTabs = tabs.length;
                    if(wins[wins.length-1].id == win.id) resolve();
                });
            }
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
                    WINMAP[_winId] = _newWinId;
                    console.log("WINMAP", WINMAP);
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
        if(WINMAP[rem_last.windowId] == undefined) {
            windowId = rem_last.windowId;
        }else{
            windowId = WINMAP[rem_last.windowId];
        }
        // check if the window is exist
        const isWinExist = await new Promise((resolve) =>{
            chrome.windows.get(windowId, win => {
                if(!win || chrome.runtime.lastError){
                    console.log("window is not exist");
                    resolve(false);
                }
                else{
                    resolve(true);
                }
            });
        });

        if(!isWinExist){
            // Create a missing window
            const createOption = {
                url: rem_last.url,
                incognito: true,
                focused: true,
            }
            // Try to update a createOption
            try{
                for(const tryWinId of [windowId, rem_last.windowId]){
                    if(tryWinId in WINS){
                        Object.assign(createOption, {
                            height: WINS[tryWinId].height,
                            width: WINS[tryWinId].width,
                            left: WINS[tryWinId].left,
                            top: WINS[tryWinId].top,
                            type: WINS[tryWinId].type,
                        });
                        break;
                    }
                }
            } catch(e){
                console.error("Failed to update createOption", e);

            }
            // Create a missing window
            const newWin = await new Promise((resolove)=>{
                chrome.windows.create(createOption, win => resolove(win));
            });
            // Update WINMAP
            WINMAP[rem_last.windowId] = newWin.id;
            WINMAP[windowId] = newWin.id;
        }else{
            // activate win
            chrome.windows.update(windowId, {focused: true}, win => {
                // Restore tab in the exsiting window
                chrome.tabs.create({
                    active: true, //(rem_last.id == lastActiveTabId),
                    index: rem_last.index,
                    url: rem_last.url,
                    windowId // : rem_last.windowId
                });
            });
        }
    }
}


main();