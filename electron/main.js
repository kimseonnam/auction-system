const { app, BrowserWindow, shell, globalShortcut } = require("electron");
const path = require("path");

const APP_URL = "https://kimseonnam.online";
const DEV_URL = "http://localhost:3000";
const isDev = !app.isPackaged;

const MAIN_WINDOW_TITLE = "MIR CUP Season1";
const OVERLAY_WINDOW_TITLE = "KSN OVERLAY";

let splashWindow = null;
let mainWindow = null;
let mainZoom = 1;

function getAppUrl() {
  return isDev ? DEV_URL : APP_URL;
}

function forceWindowTitle(window, title) {
  window.on("page-title-updated", (event) => {
    event.preventDefault();
    window.setTitle(title);
  });

  window.webContents.on("did-finish-load", () => {
    window.setTitle(title);
  });
}

function setupMainZoomControls() {
  mainWindow.webContents.setZoomFactor(1);
  mainZoom = 1;

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (!input.control) return;

    if (input.key === "=" || input.key === "+") {
      mainZoom = Math.min(1.5, mainZoom + 0.1);
      mainWindow.webContents.setZoomFactor(mainZoom);
      event.preventDefault();
    }

    if (input.key === "-") {
      mainZoom = Math.max(0.7, mainZoom - 0.1);
      mainWindow.webContents.setZoomFactor(mainZoom);
      event.preventDefault();
    }

    if (input.key === "0") {
      mainZoom = 1;
      mainWindow.webContents.setZoomFactor(1);
      mainWindow.setSize(1400, 820);
      mainWindow.center();
      event.preventDefault();
    }
  });
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 760,
    height: 460,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: "#020617",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  splashWindow.loadFile(path.join(__dirname, "splash.html"));
  splashWindow.center();
}

function createMainWindow() {
  const currentUrl = getAppUrl();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 820,
    minWidth: 1000,
    minHeight: 650,
    title: MAIN_WINDOW_TITLE,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#020617",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  forceWindowTitle(mainWindow, MAIN_WINDOW_TITLE);
  setupMainZoomControls();

  mainWindow.loadURL(currentUrl);

  mainWindow.once("ready-to-show", () => {
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
      }

      mainWindow.webContents.setZoomFactor(1);
      mainZoom = 1;

      mainWindow.setSize(1400, 820);
      mainWindow.center();
      mainWindow.show();
      mainWindow.setTitle(MAIN_WINDOW_TITLE);
    }, 4000);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes("/overlay")) {
      createOverlayWindow(url);
      return { action: "deny" };
    }

    if (url.startsWith(APP_URL) || url.startsWith(DEV_URL)) {
      mainWindow.loadURL(url);
      return { action: "deny" };
    }

    shell.openExternal(url);
    return { action: "deny" };
  });
}

function createOverlayWindow(url) {
  const overlay = new BrowserWindow({
    width: 1920,
    height: 1080,
    title: OVERLAY_WINDOW_TITLE,
    frame: false,
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    backgroundColor: "#000000",
    fullscreen: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  forceWindowTitle(overlay, OVERLAY_WINDOW_TITLE);

  overlay.loadURL(url);

  overlay.once("ready-to-show", () => {
    overlay.setTitle(OVERLAY_WINDOW_TITLE);
  });
}

app.whenReady().then(() => {
  createSplashWindow();
  createMainWindow();

  globalShortcut.register("Escape", () => {
    const win = BrowserWindow.getFocusedWindow();

    if (win && win.getTitle() === OVERLAY_WINDOW_TITLE) {
      win.close();
    }
  });

  globalShortcut.register("F11", () => {
    const win = BrowserWindow.getFocusedWindow();

    if (win) {
      win.setFullScreen(!win.isFullScreen());
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createSplashWindow();
    createMainWindow();
  }
});