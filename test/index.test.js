/* eslint-disable jest/expect-expect */
// Copyright 2023 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// eslint-disable-next-line no-undef
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const exp = require('constants');
const { debug } = require('console');

const EXTENSION_PATH = path.join(process.cwd(), '../');
const EXTENSION_ID = 'alkfhfgkepamooonkjdolamnbilhkmjg';

const DEFAULT_WIN_OFFSET = 1;
const DEFAULT_DELAY = 200;
const TEST_SERVER = `http://localhost:3000`;

let browser;
let backgroundPage;
let debugPage;
let debugWin;
let worker;

beforeEach(async () => {
  browser = await puppeteer.launch({
    headless: false,
    // slowMo: 50,
    devtools: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      `--window-size=1920,1080`
    ],
    defaultViewport: {
      width: 1920,
      height: 1080
    }
  });

  // Set the extension to allow in incognito mode and enable developer mode
  const extensionPage = await browser.newPage();
  await extensionPage.goto(`chrome://extensions/?id=${EXTENSION_ID}`);
  await extensionPage.evaluate(() => {
    // Click the "Allow in incognito" checkbox
    // https://stackoverflow.com/a/56410914
    document.querySelector('extensions-manager')
      .shadowRoot.querySelector('#viewManager > extensions-detail-view.active')
      .shadowRoot.querySelector('div#container.page-container > div.page-content > div#options-section extensions-toggle-row#allow-incognito')
      .shadowRoot.querySelector('label#label input').click();

    // Click the "Developer mode" checkbox
    // https://github.com/puppeteer/puppeteer/issues/5095#issuecomment-590292518
    document.querySelector("body > extensions-manager")
      .shadowRoot.querySelector("extensions-toolbar")
      .shadowRoot.querySelector("#devMode").click();

  });
  extensionPage.close();


  // Get a handle to the background page of an extension
  // https://pptr.dev/guides/chrome-extensions
  const backgroundPageTarget = await browser.waitForTarget(
    target => target.type() === 'background_page'
  );
  // backgroundPage = await backgroundPageTarget.page();
  worker = await backgroundPageTarget.page();
  console.log(worker);

  // Get a handle to the service_worker of an extension
  // https://pptr.dev/guides/chrome-extensions
  // const workerTarget = await browser.waitForTarget(
  //   // Assumes that there is only one service worker created by the extension and its URL ends with service_worker.js.
  //   target =>
  //     target.type() === 'service_worker' && target.url().endsWith('service_worker.js')
  // );  
  // worker = await workerTarget.worker();


  debugWin = await worker.evaluate(
    async () =>
      new Promise((resolve) => {
        self.chrome.windows.getAll(wins => resolve(wins[0]));
      })
  );


  debugPage = await browser.newPage();
  await debugPage.goto(`chrome-extension://${EXTENSION_ID}/debug.html`);
  console.log("debugPage", debugPage);

});

afterEach(async () => {
  const pageSourceHTML = await debugPage.content();
  const pathStem = `debug-result-${expect.getState().currentTestName}`.replace(/[^a-zA-Z0-9\/\\_\-\.:\s]/g, '');
  fs.writeFileSync(`${pathStem}.html`, pageSourceHTML);
  await debugPage.screenshot({ path: `${pathStem}.png` });
  // await browser.close();

  browser = undefined;
});

/**
 * Stops the service worker associated with a given extension ID. This is done
 * by creating a new Chrome DevTools Protocol session, finding the target ID
 * associated with the worker and running the Target.closeTarget command.
 *
 * @param {Page} browser Browser instance
 * @param {string} extensionId Extension ID of worker to terminate
 */
async function stopServiceWorker(browser, extensionId) {
  const host = `chrome-extension://${extensionId}`;

  const target = await browser.waitForTarget((t) => {
    return t.type() === 'service_worker' && t.url().startsWith(host);
  });

  const worker = await target.worker();
  await worker.close();
}

// test('can message service worker when terminated', async () => {
//   const page = await browser.newPage();
//   await page.goto(`chrome-extension://${EXTENSION_ID}/debug.html`);

//   // Message without terminating service worker
//   await page.click('button');
//   await page.waitForSelector('#response-0');

//   // Terminate service worker
//   await stopServiceWorker(browser, EXTENSION_ID);

//   // Try to send another message
//   await page.click('button');
//   await page.waitForSelector('#response-1');
// });


const sleep = msec => new Promise(resolve => setTimeout(resolve, msec));


async function doCommand(command, stete, delay) {
  const { TABS, WINS, REMLIST } = stete;
  const win_offset = DEFAULT_WIN_OFFSET;

  console.log(command);
  if(delay > 0){
    await sleep(delay);
  }

  if (command.win !== undefined) {
    const wins = await worker.evaluate(async () => await self.getAllWins());
    console.log("wins", wins.length, command.win, win_offset, wins)
    command.win = wins[command.win + win_offset];
    console.log("win", command.win)
    expect(command.win).not.toBe(undefined);

    if (command.tab !== undefined) {
      const tabs = await worker.evaluate(
        async (windowId, index) =>
          new Promise((resolve) => {
            const _tabs = self.chrome.tabs.query({ windowId, index }, _tabs => resolve(_tabs));
          })
        , command.win.id, command.tab);
      command.tab = tabs[0];
      expect(command.tab).not.toBe(undefined);
    }
  }

  if (command.command === 'restore') {
    const tabToRestore = REMLIST.pop();
    TABS[tabToRestore.id] = tabToRestore;
    if (tabToRestore.isWindowClosedByClosingTab || tabToRestore.isWindowClosedByClosingWindow) {
      // WINS[tabToRestore.windowId] = tabToRestore;
    }

    // const debug_command_restore_ret = await worker.evaluate(async () =>
    //   new Promise((resolve) => {
    //     const _ret = self.debug_command_restore().then(
    //       () => resolve(true)
    //     );
    //   })
    // );
    const debug_command_restore_ret = await worker.evaluate(async () =>
      await self.debug_command_restore()
  );
  expect(debug_command_restore_ret).toBe(true);
  }
  else if (command.command === 'createWindow') {
    var tf = true;
    const win = await worker.evaluate(
      async (command) =>
        await self.createWindow(command.createData)
      , command);
    WINS[win.id] = win;
  }
  else if (command.command === 'createTab') {
    command.createProperties.windowId = command.win.id;
    const tab = await worker.evaluate(async (command) =>
      new Promise((resolve) => {
        self.chrome.tabs.create(command.createProperties, tab =>
          resolve(tab)
        );
      })
      , command);

    const tab2 = await worker.evaluate(async (tabId) =>
      new Promise((resolve) => {
        self.chrome.tabs.get(tabId, tab =>
          resolve(tab)
        );
      })
      , tab.id);

    TABS[tab.id] = tab2;
  }
  else if (command.command === 'updateTab') {
    const tab = await worker.evaluate(async (command) =>
      new Promise((resolve) => {
        self.chrome.tabs.update(command.tab.id, command.updateProperties, tab =>
          resolve(tab)
        );
      })
      , command);

    const tab2 = await worker.evaluate(async (tabId) =>
      new Promise((resolve) => {
        self.chrome.tabs.get(tabId, tab =>
          resolve(tab)
        );
      })
      , command.tab.id);

    console.log("updateTab", "tab", tab, "tab2", tab2);

    TABS[tab.id] = tab2;
  }
  else if (command.command === 'removeTab') {
    const nTabs = await worker.evaluate(async (command) =>
      new Promise((resolve) =>
        self.chrome.tabs.query({ windowId: command.win.id }, _tabs => resolve(_tabs.length))
      )
      , command);
    await worker.evaluate(async (command) =>
      new Promise((resolve) => {
        self.chrome.tabs.remove(command.tab.id, () =>
          resolve()
        );
      })
      , command);

    // Check if the tab is removed
    const tabs = await worker.evaluate(async () => await self.getAllTabs());
    let tab_remove_success = true;
    for (const tab of tabs) {
      if (tab.id === command.tab.id) {
        tab_remove_success = false;
        break;
      }
    }
    expect(tab_remove_success).toBe(true);

    REMLIST.push(TABS[command.tab.id]);
    delete TABS[command.tab.id];
    if (nTabs == 1) {
      REMLIST[REMLIST.length - 1].isWindowClosedByClosingTab = true;
      REMLIST[REMLIST.length - 1].isWindowClosedByClosingWindow = false;
      delete WINS[command.win.id];
    }
  }

  return { TABS, WINS, REMLIST };

}



async function doCheck(state){
  const { TABS, WINS, REMLIST } = state
   // Evaluate
   const tabsExist = await worker.evaluate(async () => {
    return await self.getAllTabs();
  });
  const winsExist = await worker.evaluate(async () => {
    return await self.getAllWins();
  });

  console.log("tabExist", tabsExist.map(tab => String([tab.windowId, tab.index, tab.id, tab.url])));
  console.log("TABS", Object.keys(TABS).map(tabId => {
    const tab = TABS[tabId];
    return String([tab.windowId, tab.index, tab.id, tab.url])
  }));

  for (const tabExist of tabsExist) {
    if (tabExist.windowId === debugWin.id) {
      continue;
    }
    const urls = Object.keys(TABS).map(tabId => (TABS[tabId].pendingUrl || TABS[tabId].url));
    console.log("Check", "urls", urls, "includes", "tabExist.url", tabExist.url, "to be", true, "=>", urls.includes(tabExist.url));
    expect(urls.includes(tabExist.url)).toBe(true);
  }

  // for (const tabExist of tabsExist) {
  for (const tabId of Object.keys(TABS)) {
    const tabToBe = TABS[tabId];

    const urlsExist = tabsExist.map(tab => (tab.pendingUrl || tab.url));
    console.log("Check", "urlsExist", urlsExist, "includes", "tabToBe.pendingUrl || tabToBe.url", tabToBe.pendingUrl || tabToBe.url, "to be", true, "=>", urlsExist.includes(tabToBe.pendingUrl || tabToBe.url));
    expect(urlsExist.includes(tabToBe.pendingUrl || tabToBe.url)).toBe(true);
  }
}

async function doTest(commands, delay=DEFAULT_DELAY){  
  let state = { TABS: {}, WINS: {}, REMLIST: [] };
  for (const command of commands) {
    state = await doCommand(command, state, delay);
  }

  if(delay > 0){
    await sleep(delay);
  }

  await doCheck(state);

  if(delay > 0){
    await sleep(delay);
  }
}

test.only('[MV2] Random2', async () => {
  await doTest([
    { command: 'createWindow', createData: { incognito: true } },
    { command: 'updateTab', win: 0, tab: 0, updateProperties: { url: `${TEST_SERVER}/0` } },
    { command: 'createTab', win: 0, createProperties: { url: `${TEST_SERVER}/1` } },
    { command: 'createTab', win: 0, createProperties: { url: `${TEST_SERVER}/2` } },
    { command: 'createTab', win: 0, createProperties: { url: `${TEST_SERVER}/3` } },
    { command: 'createTab', win: 0, createProperties: { url: `${TEST_SERVER}/4` } },
    { command: 'createTab', win: 0, createProperties: { url: `${TEST_SERVER}/5` } },
    { command: 'removeTab', win: 0, tab: 5 },
    { command: 'restore' },
    { command: 'createTab', win: 0, createProperties: { url: `${TEST_SERVER}/6` } },
  ]);
}, 30000);




test('[MV2] Random', async () => {

  const commands = [
    { command: 'createWindow', createData: { incognito: true } },
    { command: 'updateTab', win: 0, tab: 0, updateProperties: { url: `${TEST_SERVER}/0` } },
    { command: 'createTab', win: 0, createProperties: { url: `${TEST_SERVER}/1` } },
    { command: 'createTab', win: 0, createProperties: { url: `${TEST_SERVER}/2` } },
    { command: 'createTab', win: 0, createProperties: { url: `${TEST_SERVER}/3` } },
    { command: 'createTab', win: 0, createProperties: { url: `${TEST_SERVER}/4` } },
    { command: 'createTab', win: 0, createProperties: { url: `${TEST_SERVER}/5` } },
    { command: 'removeTab', win: 0, tab: 5 },
    { command: 'restore' },
  ]

  const win_offset = DEFAULT_WIN_OFFSET;

  let WINS = {};
  let TABS = {};
  let REMLIST = [];
  for (const command of commands) {
    console.log(command);

    if (command.win !== undefined) {
      const wins = await worker.evaluate(async () => await self.getAllWins());
      console.log("wins", wins.length, command.win, win_offset, wins)
      command.win = wins[command.win + win_offset];
      console.log("win", command.win)
      expect(command.win).not.toBe(undefined);

      if (command.tab !== undefined) {
        const tabs = await worker.evaluate(
          async (windowId, index) =>
            new Promise((resolve) => {
              const _tabs = self.chrome.tabs.query({ windowId, index }, _tabs => resolve(_tabs));
            })
          , command.win.id, command.tab);
        command.tab = tabs[0];
        expect(command.tab).not.toBe(undefined);
      }
    }

    if (command.command === 'restore') {
      const tabToRestore = REMLIST.pop();
      TABS[tabToRestore.id] = tabToRestore;
      if (tabToRestore.isWindowClosedByClosingTab || tabToRestore.isWindowClosedByClosingWindow) {
        // WINS[tabToRestore.windowId] = tabToRestore;
      }

      const ret = await worker.evaluate(async () =>
        new Promise((resolve) => {
          const _ret = self.debug_command_restore();
          resolve(_ret);
        })
      );
    }
    else if (command.command === 'createWindow') {
      var tf = true;
      const win = await worker.evaluate(
        async (command) =>
          await self.createWindow(command.createData)
        , command);
      WINS[win.id] = win;
    }
    else if (command.command === 'createTab') {
      command.createProperties.windowId = command.win.id;
      const tab = await worker.evaluate(async (command) =>
        new Promise((resolve) => {
          self.chrome.tabs.create(command.createProperties, tab =>
            resolve(tab)
          );
        })
        , command);

      const tab2 = await worker.evaluate(async (tabId) =>
        new Promise((resolve) => {
          self.chrome.tabs.get(tabId, tab =>
            resolve(tab)
          );
        })
        , tab.id);

      TABS[tab.id] = tab2;
    }
    else if (command.command === 'updateTab') {
      const tab = await worker.evaluate(async (command) =>
        new Promise((resolve) => {
          self.chrome.tabs.update(command.tab.id, command.updateProperties, tab =>
            resolve(tab)
          );
        })
        , command);

      const tab2 = await worker.evaluate(async (tabId) =>
        new Promise((resolve) => {
          self.chrome.tabs.get(tabId, tab =>
            resolve(tab)
          );
        })
        , command.tab.id);

      console.log("updateTab", "tab", tab, "tab2", tab2);

      TABS[tab.id] = tab2;
    }
    else if (command.command === 'removeTab') {
      const nTabs = await worker.evaluate(async (command) =>
        new Promise((resolve) =>
          self.chrome.tabs.query({ windowId: command.win.id }, _tabs => resolve(_tabs.length))
        )
        , command);
      await worker.evaluate(async (command) =>
        new Promise((resolve) => {
          self.chrome.tabs.remove(command.tab.id, () =>
            resolve()
          );
        })
        , command);
      REMLIST.push(TABS[command.tab.id]);
      delete TABS[command.tab.id];
      if (nTabs == 1) {
        REMLIST[REMLIST.length - 1].isWindowClosedByClosingTab = true;
        REMLIST[REMLIST.length - 1].isWindowClosedByClosingWindow = false;
        delete WINS[command.win.id];
      }
    }
  }



  // Evaluate
  const tabsExist = await worker.evaluate(async () => {
    return await self.getAllTabs();
  });
  const winsExist = await worker.evaluate(async () => {
    return await self.getAllWins();
  });

  console.log("tabExist", tabsExist.map(tab => String([tab.windowId, tab.index, tab.id, tab.url])));
  console.log("TABS", Object.keys(TABS).map(tabId => {
    const tab = TABS[tabId];
    return String([tab.windowId, tab.index, tab.id, tab.url])
  }));

  for (const tabExist of tabsExist) {
    if (tabExist.windowId === debugWin.id) {
      continue;
    }
    const urls = Object.keys(TABS).map(tabId => (TABS[tabId].pendingUrl || TABS[tabId].url));
    console.log("Check", "urls", urls, "includes", "tabExist.url", tabExist.url, "to be", true, "=>", urls.includes(tabExist.url));
    expect(urls.includes(tabExist.url)).toBe(true);
  }

  // for (const tabExist of tabsExist) {
  for (const tabId of Object.keys(TABS)) {
    const tabToBe = TABS[tabId];

    const urlsExist = tabsExist.map(tab => (tab.pendingUrl || tab.url));
    console.log("Check", "urlsExist", urlsExist, "includes", "tabToBe.url", tabToBe.url, "to be", true, "=>", urlsExist.includes(tabToBe.url));
    expect(urlsExist.includes(tabToBe.pendingUrl || tabToBe.url)).toBe(true);
  }

  const pageSourceHTML = await debugPage.content();
  const pathStem = `debug-result-${expect.getState().currentTestName}`.replace(/[^a-zA-Z0-9\/\\_\-\.:\s]/g, '');
  fs.writeFileSync(`${pathStem}.html`, pageSourceHTML);
  await debugPage.screenshot({ path: `${pathStem}.png` });

});


test('[MV2] Single incognito tab open -> close -> reopen', async () => {

  // Get worker
  // const host = `chrome-extension://${EXTENSION_ID}`;
  // const target = await browser.waitForTarget((t) => {
  //   return t.type() === 'service_worker' && t.url().startsWith(host);
  // });
  // worker = await target.worker();
  // console.log(worker);

  // const backgroundPageTarget = await browser.waitForTarget(
  //   target => target.type() === 'background_page'
  // );
  // worker = await backgroundPageTarget.page();
  // console.log(worker);

  // Open and close a google tab in incognito mode
  // const incognitoBrowser = await puppeteer.launch({
  //   headless: false,
  //   // slowMo: 50,
  //   devtools: false,
  //   args: [
  //     `--disable-extensions-except=${EXTENSION_PATH}`,
  //     `--load-extension=${EXTENSION_PATH}`,
  //     `--window-size=1920,1080`,
  //     `--incognito`
  //   ],
  //   defaultViewport: {
  //     width: 1920,
  //     height: 1080
  //   }
  // });
  // const incognito = await browser.createIncognitoBrowserContext();
  // const incognito = await incognitoBrowser.defaultBrowserContext();
  // const page = await incognito.newPage();

  await worker.evaluate(async () => {
    return await self.createWindow({ incognito: true });
  });

  const page = await browser.newPage();
  await page.goto('https://www.google.com');
  await page.close();
  const noGoogleTab = await (async () => {
    const tabs = await worker.evaluate(async () => await self.getAllTabs());
    let tf = true;
    for (const tab of tabs) {
      if (tab.url === 'https://www.google.com/') {
        tf = false;
        break;
      }
    }
    return tf;
  })();
  expect(noGoogleTab).toBe(true);

  // Restore the tab
  let restoreCommandRet = await worker.evaluate(async () => {
    return await self.debug_command_restore();
  });
  expect(restoreCommandRet).toBe(true);


  // Check if the tab is restored
  const tabs = await worker.evaluate(async () => {
    return await self.getAllTabs();
  });
  const wins = await worker.evaluate(async () => {
    return await self.getAllWins();
  });
  //  const tabs = await worker.evaluate(async () => {
  //   return await self.chrome.tabs.query({})
  // });
  console.log(tabs.length);
  console.log(wins.length);

  // expect(tabs).not.toBe(undefined);
  // expect(tabs.length >= 2).toBe(true);
  // expect(tabs[tabs.length-1].url).toBe('https://www.google.com/');
  // expect(tabs[tabs.length-1].active).toBe(true);

  const pageSourceHTML = await debugPage.content();
  const pathStem = `debug-result-${expect.getState().currentTestName}`.replace(/[^a-zA-Z0-9\/\\_\-\.:\s]/g, '');
  fs.writeFileSync(`${pathStem}.html`, pageSourceHTML);
  await debugPage.screenshot({ path: `${pathStem}.png` });

});



test('[MV2] Single normal tab open -> close -> reopen', async () => {

  // Get worker
  // const host = `chrome-extension://${EXTENSION_ID}`;
  // const target = await browser.waitForTarget((t) => {
  //   return t.type() === 'service_worker' && t.url().startsWith(host);
  // });
  // worker = await target.worker();
  // console.log(worker);

  // const backgroundPageTarget = await browser.waitForTarget(
  //   target => target.type() === 'background_page'
  // );
  // worker = await backgroundPageTarget.page();
  // console.log(worker);

  // Open and close a google tab
  const page = await browser.newPage();
  await page.goto('https://www.google.com');
  await page.close();
  const noGoogleTab = await (async () => {
    const tabs = await worker.evaluate(async () => await self.getAllTabs());
    let tf = true;
    for (const tab of tabs) {
      if (tab.url === 'https://www.google.com/') {
        tf = false;
        break;
      }
    }
    return tf;
  })();
  expect(noGoogleTab).toBe(true);

  // Restore the tab
  let restoreCommandRet = await worker.evaluate(async () => {
    return await self.debug_command_restore();
  });
  expect(restoreCommandRet).toBe(true);


  // Check if the tab is restored
  const tabs = await worker.evaluate(async () => {
    return await self.getAllTabs();
  });
  //  const tabs = await worker.evaluate(async () => {
  //   return await self.chrome.tabs.query({})
  // });
  console.log(tabs);

  expect(tabs).not.toBe(undefined);
  expect(tabs.length >= 2).toBe(true);
  expect(tabs[tabs.length - 1].url).toBe('https://www.google.com/');
  expect(tabs[tabs.length - 1].active).toBe(true);

  const pageSourceHTML = await debugPage.content();
  const pathStem = `debug-result-${expect.getState().currentTestName}`.replace(/[^a-zA-Z0-9\/\\_\-\.:\s]/g, '');
  fs.writeFileSync(`${pathStem}.html`, pageSourceHTML);
  await debugPage.screenshot({ path: `${pathStem}.png` });

});




/*

test('[MV3] Single normal tab open -> close -> reopen', async () => {
  
  // Get worker
  const host = `chrome-extension://${EXTENSION_ID}`;
  const target = await browser.waitForTarget((t) => {
    return t.type() === 'service_worker' && t.url().startsWith(host);
  });
  worker = await target.worker();
  console.log(worker);
  

  // await backgroundPage.evaluate("command_restore();");

  // Open and close a google tab
  const page = await browser.newPage();
  await page.goto('https://www.google.com');  
  await page.close(); 
  const noGoogleTab = await worker.evaluate(async () => {
    const tabs = await self.chrome.tabs.query({});
    let tf = true;
    for (const tab of tabs) {
      if (tab.url === 'https://www.google.com/') {
        tf = false;
        break;
      }
    }
    return tf;
 });
 expect(noGoogleTab).toBe(true);

  // Restore the tab
  let restoreCommandRet = await worker.evaluate(async () => {
    return await self.debug_command_restore();
  });
  expect(restoreCommandRet).toBe(true);


  // Check if the tab is restored
  const tabs = await worker.evaluate(async () => {
     return await self.chrome.tabs.query({})
  });
  console.log(tabs);

  expect(tabs).not.toBe(undefined);
  expect(tabs.length >= 2).toBe(true);
  expect(tabs[tabs.length-1].url).toBe('https://www.google.com/');
  expect(tabs[tabs.length-1].active).toBe(true);
  expect(tabs[tabs.length-2].index).toBe(tabs.length-2);

  debugPage.screenshot({ path: 'debug.png' });
  const pageSourceHTML = await debugPage.content();
  fs.writeFileSync('debug-result.html', pageSourceHTML);

});



*/