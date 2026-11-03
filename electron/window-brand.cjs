const path = require("node:path");
const fs = require("node:fs");
const { app } = require("electron");

const icon = path.join(__dirname, "../assets/icon.png");
const appId = "local.ai.veritas";

function applyWindowBrand(window) {
  if (process.platform !== "win32" || !app?.isPackaged) return;
  const shellIcon = path.join(path.dirname(process.execPath), "Medstack.ico");
  window.setAppDetails({
    appId,
    appIconPath: fs.existsSync(shellIcon) ? shellIcon : process.execPath,
    appIconIndex: 0,
    relaunchCommand: `"${process.execPath}"`,
    relaunchDisplayName: "医栈通 Medstack",
  });
}

module.exports = { icon, appId, applyWindowBrand };
