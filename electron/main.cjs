const {
  app,
  BrowserWindow,
  ipcMain,
  session,
  dialog,
  Notification,
  Tray,
  Menu,
  nativeImage,
  powerMonitor,
  shell,
  clipboard,
  protocol,
  net,
  safeStorage,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const APP_VERSION = app.getVersion();
// macOS safeStorage uses the application name for its Keychain service.
// Keep it stable across upgrades so existing encrypted account vaults remain readable.
app.setName(
  process.platform === "darwin"
    ? "Medstack"
    : `医栈通 Medstack V${APP_VERSION}`,
);
if (process.platform === "win32") app.setAppUserModelId("local.ai.veritas");
const testMode = process.env.VERITAS_TEST === "1";
if (testMode && process.env.VERITAS_TEST_DATA)
  app.setPath("userData", process.env.VERITAS_TEST_DATA);
else app.setPath("userData", path.join(app.getPath("appData"), "AI-VERITAS"));
protocol.registerSchemesAsPrivileged([
  {
    scheme: "veritas",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
let win,
  schoolWindow,
  tray,
  store,
  domain,
  campus,
  schoolSession,
  auth,
  bridge,
  assistant,
  learning,
  news,
  workflows,
  accounts,
  updates,
  accountSync,
  requireAccount,
  lockedSnapshot,
  personalReady = false,
  connectorInitialization,
  commandRouter,
  authFlushed = false,
  quitting = false,
  sequence = 0;
const snapshot = () =>
  !accounts?.authenticated || !personalReady
    ? {
        ...lockedSnapshot(accounts?.status(), ++sequence),
        updates: updates?.status(),
      }
    : {
        ...store.state,
        updates: updates?.status(),
        learning: learning?.status(),
        news: news?.status(),
        workflows: workflows?.data,
        campusAuth: auth?.status(),
        account: accounts?.status(),
        briefingStatus: { ...bridge?.status, sync: bridge?.sync?.status() },
        revision: ++sequence,
      };
const broadcast = () => {
  if (win && !win.isDestroyed())
    win.webContents.send("veritas:state", snapshot());
};
function show() {
  if (store && (!win || win.isDestroyed())) createWindow();
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
  }
}
function notify(title, body) {
  if (
    store.state.settings.notifications &&
    Notification.isSupported() &&
    !testMode
  )
    new Notification({
      title,
      body,
      silent: !store.state.settings.sound,
    }).show();
}
function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 1050,
    minHeight: 730,
    backgroundColor: "#f7f7f4",
    icon: path.join(__dirname, "../assets/icon.png"),
    title: `医栈通 V${APP_VERSION}`,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e, url) => {
    if (url !== "veritas://app/index.html") e.preventDefault();
  });
  win.on("close", (e) => {
    if (
      !quitting &&
      (process.platform === "darwin" ||
        (store.state.settings.closeToTray && tray))
    ) {
      e.preventDefault();
      win.hide();
    } else if (!quitting) {
      quitting = true;
      app.quit();
    }
  });
  win.loadURL("veritas://app/index.html");
}
async function handle(action, p = {}) {
  requireAccount(accounts, action);
  if (action === "contact.copy") {
    clipboard.writeText("Veritas_Enterprise");
    return { ok: true };
  }
  if (action === "help.open") {
    const { openHelp } = await import("./help.mjs");
    return openHelp(app, shell, p?.kind);
  }
  if (action === "help.read") {
    const { readHelp } = await import("./help.mjs");
    return readHelp(app, p?.kind);
  }
  if (action === "state") return snapshot();
  if (action === "updates.state") return updates.status();
  if (action === "updates.check") return updates.check();
  if (action === "updates.dismiss") return updates.dismiss();
  if (action === "updates.download") return updates.download(p.platform);
  if (action === "updates.install") return updates.install();
  if (action === "updates.email") {
    const uid = accounts.status().user?.id;
    const result = await updates.email(
      p.emailUpdates === undefined ? undefined : p,
    );
    requireAccount(accounts, action);
    if (uid !== accounts.status().user?.id) throw Error("账号已切换");
    return result;
  }
  if (action.startsWith("account.")) return accounts.execute(action, p);
  if (!personalReady) throw Error("正在打开账号空间，请稍候");
  const result = await commandRouter.execute(action, p);
  requireAccount(accounts, action);
  if (result !== undefined) return result;
  try {
    bridge?.export(store.state);
  } catch {
    if (bridge)
      bridge.status = {
        ...bridge.status,
        local: "error",
        message: "快报文件写入失败，请检查连接目录。",
      };
  }
  broadcast();
  return snapshot();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", show);
  app
    .whenReady()
    .then(async () => {
      if (!testMode)
        require("./profile-path.cjs").assertDesktopProfile(
          app.getPath("userData"),
        );
      // Chromium's request headers must remain ASCII even with a Unicode product name.
      app.userAgentFallback = app.userAgentFallback.replace(
        /[^\x20-\x7E]/g,
        "",
      );
      domain = await import("../src/domain.mjs");
      campus = await import("./campus.mjs");
      const { Store } = await import("./store.mjs");
      const { SecretStore } = await import("./secret-store.mjs");
      const { AccountProfiles } = await import("./accounts/profiles.mjs");
      const { SelfHostedProvider } = await import("./accounts/self-hosted.mjs");
      const { AccountSync } = await import("./accounts/sync.mjs");
      const { Accounts } = await import("./accounts/service.mjs");
      ({ requireAccount, lockedSnapshot } =
        await import("./accounts/access.mjs"));
      const accountVault = new SecretStore(
        app.getPath("userData"),
        "account-vault.bin",
        safeStorage,
      );
      const profiles = new AccountProfiles(
        app.getPath("userData"),
        accountVault,
      );
      const dataDirectory = profiles.directory();
      store = new Store(dataDirectory);
      const accountConfig = JSON.parse(
        fs.readFileSync(path.join(__dirname, "accounts/config.json"), "utf8"),
      );
      const accountProvider = new SelfHostedProvider(
        accountConfig,
        accountVault,
        { fetcher: (...args) => net.fetch(...args) },
      );
      const { Updates } = await import("./updates.mjs");
      const { UpdateInstaller } = await import("./update-installer.mjs");
      updates = new Updates({
        installer: new UpdateInstaller({
          directory: app.getPath("userData"),
          version: APP_VERSION,
          executable: process.execPath,
          packaged: app.isPackaged,
          changed: broadcast,
          fetcher: (...args) => fetch(...args),
          exit: async (launch) => {
            store.change((s) => domain.timerAction(s, "pause"));
            if (connectorInitialization) {
              await auth?.persist();
              await learning?.persist();
            }
            await launch();
            accountSync?.stop();
            assistant?.cancel();
            authFlushed = true;
            quitting = true;
            app.quit();
          },
        }),
        directory: app.getPath("userData"),
        version: APP_VERSION,
        provider: accountProvider,
        fetcher: (...args) => net.fetch(...args),
        changed: broadcast,
        open: (url) => shell.openExternal(url),
      });
      accountSync = profiles.active
        ? new AccountSync({
            directory: dataDirectory,
            store,
            provider: accountProvider,
            user: profiles.active,
            changed: broadcast,
          })
        : null;
      accounts = new Accounts({
        profiles,
        provider: accountProvider,
        sync: accountSync,
        store,
        changed: () => {
          refreshAccess().catch(() => broadcast());
        },
        restart: () => {
          if (!testMode) {
            app.relaunch();
            quitting = true;
            setImmediate(() => app.quit());
          }
        },
      });
      accountProvider.onInvalidSession = () => {
        accounts.authenticated = false;
        personalReady = false;
        accountSync?.stop();
        bridge?.sync?.stop();
        bridge?.onboarding?.stop();
        assistant?.cancel();
        news?.stop();
        if (learning) {
          learning.disconnected = true;
          learning.generation++;
          clearTimeout(learning.pending);
          clearTimeout(learning.loginSync);
          learning.window?.destroy();
        }
        if (auth) {
          auth.generation++;
          auth.window?.destroy();
        }
        store.change((s) => domain.timerAction(s, "pause"));
        broadcast();
      };
      async function refreshAccess() {
        if (accounts.authenticated) {
          connectorInitialization ||= Promise.all([
            auth.initialize(),
            learning.initialize(),
          ]);
          await connectorInitialization;
          learning.disconnected = false;
          personalReady = accounts.authenticated;
          if (!testMode && personalReady) news?.start();
        }
        broadcast();
      }
      store.onCommit = () => {
        if (accounts.authenticated) accountSync?.changedLocal();
      };
      const { ThemeAssets } = await import("./theme-assets.mjs");
      const themeAssets = new ThemeAssets(dataDirectory, nativeImage);
      protocol.handle("veritas", async (request) => {
        const u = new URL(request.url);
        const relative =
          decodeURIComponent(u.pathname).replace(/^\/+/, "") || "index.html";
        if (u.host === "app" && relative.startsWith("user-backgrounds/")) {
          if (!accounts.authenticated || !personalReady)
            return new Response("Unauthorized", { status: 401 });
          try {
            return new Response(
              themeAssets.read(relative.slice("user-backgrounds/".length)),
              {
                headers: {
                  "Content-Type": "image/png",
                  "Cache-Control": "no-store",
                },
              },
            );
          } catch {
            return new Response("Not found", { status: 404 });
          }
        }
        const root = path.join(__dirname, "../dist");
        const target = path.resolve(root, relative);
        if (u.host !== "app" || !target.startsWith(root + path.sep))
          return new Response("Forbidden", { status: 403 });
        const mime = {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".svg": "image/svg+xml",
          ".png": "image/png",
        };
        try {
          return new Response(await fs.promises.readFile(target), {
            headers: {
              "Content-Type":
                mime[path.extname(target)] || "application/octet-stream",
            },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      });
      session.defaultSession.setPermissionRequestHandler(
        (_wc, _permission, callback) => callback(false),
      );
      schoolSession = session.fromPartition("veritas-school");
      schoolSession.setPermissionRequestHandler((_wc, _p, callback) =>
        callback(false),
      );
      schoolSession.webRequest.onBeforeRequest((details, callback) =>
        callback({
          cancel:
            !campus.isSchoolURL(details.url) &&
            !details.url.startsWith("data:"),
        }),
      );
      ipcMain.handle("veritas:call", async (event, action, payload) => {
        if (
          event.sender !== win?.webContents ||
          event.senderFrame !== win.webContents.mainFrame ||
          !event.senderFrame.url.startsWith("veritas://app/")
        )
          throw new Error("请求来源不受信任");
        if (
          typeof action !== "string" ||
          JSON.stringify(payload ?? {}).length > 1_000_000
        )
          throw new Error("请求无效");
        try {
          return await handle(action, payload);
        } catch (error) {
          throw new Error(error.message);
        }
      });
      const { Vault } = await import("./vault.mjs");
      const { CampusAuth } = await import("./campus-auth.mjs");
      const { BriefingBridge } = await import("./briefing-bridge.mjs");
      auth = new CampusAuth({
        session: schoolSession,
        BrowserWindow,
        vault: new Vault(dataDirectory, safeStorage),
        changed: broadcast,
      });
      bridge = new BriefingBridge(dataDirectory);
      const { AssistantService } = await import("./assistant-service.mjs");
      assistant = new AssistantService({
        directory: dataDirectory,
        secrets: new SecretStore(
          dataDirectory,
          "assistant-vault.bin",
          safeStorage,
        ),
        fetcher: (...args) => net.fetch(...args),
      });
      const { CloudSync } = await import("./cloud-sync.mjs");
      const { Workflows } = await import("./workflows.mjs");
      const { learningSelection } = await import("../src/learning-policy.mjs");
      const { LearningService } = await import("./learning-service.mjs");
      workflows = new Workflows(dataDirectory);
      learning = new LearningService({
        getOptions: () => workflows.data,
        directory: dataDirectory,
        session: session.fromPartition("medstack-learning"),
        parserSession: session.fromPartition("medstack-parser"),
        BrowserWindow,
        secrets: new SecretStore(
          dataDirectory,
          "learning-vault.bin",
          safeStorage,
        ),
        changed: broadcast,
        onSynced: () => {
          if (!accounts.authenticated || !personalReady) return;
          workflows.importLearning(
            learningSelection(
              { ...store.state, workflows: workflows.data },
              learning.status(),
            ).current,
            store,
          );
          bridge.export(store.state);
          broadcast();
        },
      });
      bridge.sync = new CloudSync({
        secrets: new SecretStore(dataDirectory, "cloud-vault.bin", safeStorage),
        fetcher: (...args) => net.fetch(...args),
        changed: broadcast,
      });
      const { CloudOnboarding } = await import("./cloud/onboarding.mjs");
      const { buildFeed } = await import("../src/briefing.mjs");
      bridge.onboarding = new CloudOnboarding({
        secrets: new SecretStore(
          dataDirectory,
          "cloud-setup-vault.bin",
          safeStorage,
        ),
        sync: bridge.sync,
        getFeed: () => buildFeed(store.state, Date.now(), news?.status()),
        openExternal: (url) => shell.openExternal(url),
        fetcher: (...args) => net.fetch(...args),
        changed: broadcast,
      });
      try {
        if (accounts.authenticated && personalReady)
          bridge.export(store.state, true);
      } catch {
        bridge.status.message = "快报文件未能写入，请检查连接目录。";
        bridge.status.local = "error";
      }
      const { createCommandRouter } = await import("./commands/index.mjs");
      const { retiredNews } = await import("./retired-news.mjs");
      news = retiredNews();
      bridge.getNews = () => null;
      commandRouter = createCommandRouter({
        themeAssets,
        store,
        domain,
        campus,
        auth,
        bridge,
        assistant,
        learning,
        news,
        workflows,
        dialog,
        shell,
        app,
        fs,
        path,
        broadcast,
        getWindow: () => win,
      });
      createWindow();
      if (process.platform === "darwin") {
        const { macMenuTemplate } = await import("./platform.mjs");
        const { openHelp } = await import("./help.mjs");
        Menu.setApplicationMenu(
          Menu.buildFromTemplate(
            macMenuTemplate("Medstack", show, (kind) => {
              openHelp(app, shell, kind).catch((error) =>
                dialog.showErrorBox("帮助文档", error.message),
              );
            }),
          ),
        );
        app.setAboutPanelOptions({
          applicationName: "Medstack",
          applicationVersion: APP_VERSION,
          copyright: "Medtrix",
        });
      }
      if (!testMode) {
        updates.check().catch(() => {});
        setInterval(
          () => updates.check().catch(() => {}),
          6 * 60 * 60000,
        ).unref();
      }
      accounts
        .initialize()
        .then(refreshAccess)
        .catch(() => broadcast());
      setInterval(() => {
        if (!accounts.authenticated || accounts.busy) return;
        accountProvider
          .current()
          .then((user) => {
            if (user.id !== profiles.active?.id) accountProvider.invalidate();
          })
          .catch(() => {});
      }, 5 * 60000).unref();
      if (!testMode) {
        const syncLearning = () => {
          if (
            accounts.authenticated &&
            personalReady &&
            learning.status().connected
          )
            learning.sync().catch(() => {});
        };
        setTimeout(syncLearning, 15000).unref();
        setInterval(syncLearning, 30 * 60000).unref();
      }
      tray = new Tray(
        nativeImage
          .createFromPath(path.join(__dirname, "../assets/icon.png"))
          .resize({ width: 32, height: 32 }),
      );
      tray.setToolTip(`医栈通 V${APP_VERSION}`);
      tray.on("click", show);
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: `打开 医栈通 V${APP_VERSION}`, click: show },
          {
            label: "暂停计时",
            click: () => {
              if (!accounts.authenticated || !personalReady) return show();
              store.change((s) => domain.timerAction(s, "pause"));
              broadcast();
            },
          },
          { type: "separator" },
          {
            label: "退出（保存并暂停计时）",
            click: () => {
              quitting = true;
              app.quit();
            },
          },
        ]),
      );
      let ticks = 0;
      setInterval(() => {
        if (!accounts.authenticated || !personalReady) return;
        try {
          if (ticks % 60 === 0) {
            try {
              bridge.export(store.state);
            } catch {
              bridge.status.local = "error";
              bridge.status.message = "快报文件未能更新，请检查连接目录。";
            }
          }
          const next = structuredClone(store.state),
            finished = domain.tickTimer(next),
            now = Date.now();
          const reminders = next.tasks.filter(
            (t) =>
              !t.completedAt &&
              !t.deletedAt &&
              t.reminder &&
              Date.parse(t.reminder) <= now &&
              t.remindedFor !== t.reminder,
          );
          for (const t of reminders) t.remindedFor = t.reminder;
          if (
            finished ||
            reminders.length ||
            (++ticks % 5 === 0 && next.timer.status === "running")
          )
            store.commit(next);
          else store.state = next;
          if (finished)
            notify(
              finished.mode === "focus" ? "专注完成" : "休息完成",
              finished.mode === "focus"
                ? "这一段工作已记入统计，休息一下吧。"
                : "准备好后，开始下一段专注。",
            );
          for (const t of reminders) notify("任务提醒", t.title);
          if (finished || reminders.length || next.timer.status === "running")
            broadcast();
        } catch {
          store.state.timer.status = "paused";
          store.state.lastNotice =
            "本地保存失败，计时已暂停。请检查磁盘空间并导出备份。";
          broadcast();
        }
      }, 1000).unref();
      powerMonitor.on("suspend", () => {
        if (!accounts.authenticated || !personalReady) return;
        store.change((s) => {
          domain.timerAction(s, "pause");
          s.lastNotice = "电脑进入休眠，专注计时已自动暂停。";
        });
        broadcast();
      });
    })
    .catch((error) => {
      dialog.showErrorBox("医栈通 启动失败", error.message);
      quitting = true;
      app.quit();
    });
  app.on("before-quit", (event) => {
    news?.stop();
    accountSync?.stop();
    bridge?.onboarding?.stop();
    quitting = true;
    bridge?.sync?.stop();
    assistant?.cancel();
    if (auth && connectorInitialization && !authFlushed) {
      event.preventDefault();
      authFlushed = true;
      auth
        .persist()
        .then(() => learning?.persist())
        .catch(() => {})
        .finally(() => app.quit());
      return;
    }
    if (store && domain)
      try {
        store.change((s) => domain.timerAction(s, "pause"));
      } catch {
        dialog.showErrorBox("保存未完成", "请检查本地数据目录与磁盘空间。");
      }
  });
  app.on("window-all-closed", () => {
    if (!tray && process.platform !== "darwin") app.quit();
  });
  app.on("activate", show);
}
