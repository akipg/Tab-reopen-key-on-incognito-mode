
export interface RestoreInfo {
}

export interface RestoreSessionInfo extends RestoreInfo {
    info_type: "session";
    sessionId: number | undefined;
}

export interface RestoreTabInfo extends RestoreInfo {
    info_type: "tab";
    tabId: number,
    url: string,
    incognito: boolean,
    index: number,
    windowId: number,
    active: boolean,
}

export interface RestoreWindowInfo extends RestoreInfo {
    info_type: "window";
    lastActiveTabId: number;
    incognito: boolean;
    active: boolean;
    tabs: RestoreTabInfo[];
    windowId: number;
    width: number;
    height: number;
    top: number;
    left: number;
    type: chrome.windows.WindowType;
    state: chrome.windows.WindowState;
}

export type RestoreRecordId = string;

export interface RestoreRecord<T_RestoreInfo> {
    recordId: RestoreRecordId,
    info_type: "session" | "tab" | "window",
    info: T_RestoreInfo,
    isWindowClosing?: boolean,
}

