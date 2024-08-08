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

let browser;
let backgroundPage;
let debugPage;
let worker;

beforeEach(async () => {
  browser = await puppeteer.launch({
    headless: true,
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



  debugPage = await browser.newPage();
  await debugPage.goto(`chrome-extension://${EXTENSION_ID}/debug.html`);

});

afterEach(async () => {
  await browser.close();
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
  expect(tabs[tabs.length-1].url).toBe('https://www.google.com/');
  expect(tabs[tabs.length-1].active).toBe(true);
  
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