export default async function execute(action, p, context) {
  const {
    store,
    domain,
    campus,
    auth,
    bridge,
    dialog,
    shell,
    app,
    fs,
    path,
    broadcast,
  } = context;
  const win = context.getWindow();
  if (action === "school.canvas.open") {
    await shell.openExternal("https://oc.sjtu.edu.cn/login/canvas");
    return { ok: true };
  } else if (action === "school.open") {
    await auth.open();
    return { ok: true };
  } else if (action === "school.login.configure") {
    auth.configure(p);
    broadcast();
    return { ok: true };
  } else if (action === "school.login.renew") {
    await auth.renew();
    broadcast();
    return { ok: true };
  } else if (action === "school.logout") {
    await auth.logout();
    broadcast();
    return { ok: true };
  }
}
