import assert from "node:assert/strict";
import test from "node:test";
import {
  mailCredentials,
  readRecentMail,
  SjtuMail,
} from "../electron/sjtu-mail.mjs";

test("交大邮箱固定 TLS 域名、只读打开收件箱且只读取邮件头", async () => {
  let closed = false,
    unlocked = false;
  const auth = mailCredentials({
    username: "demo@sjtu.edu.cn",
    password: "synthetic",
  });
  assert.deepEqual(auth, { user: "demo", pass: "synthetic" });
  assert.throws(() =>
    mailCredentials({ username: "demo@example.com", password: "synthetic" }),
  );
  class FakeClient {
    constructor(options) {
      assert.equal(options.host, "mail.sjtu.edu.cn");
      assert.equal(options.port, 993);
      assert.equal(options.secure, true);
      assert.equal(options.logger, false);
      this.mailbox = { exists: 42 };
    }
    on() {}
    async connect() {}
    close() {
      closed = true;
    }
    async getMailboxLock(box, options) {
      assert.equal(box, "INBOX");
      assert.equal(options.readOnly, true);
      return {
        release() {
          unlocked = true;
        },
      };
    }
    async *fetch(range, fields) {
      assert.equal(range, "37:42");
      assert.deepEqual(fields, {
        uid: true,
        envelope: true,
        flags: true,
        internalDate: true,
      });
      yield {
        uid: 42,
        envelope: { subject: "测试邮件", from: [{ name: "示例教务" }] },
        flags: new Set(),
        internalDate: new Date(1000),
        body: "不可返回",
      };
    }
  }
  const items = await readRecentMail(
    auth,
    new AbortController().signal,
    FakeClient,
  );
  assert.deepEqual(items, [
    {
      uid: 42,
      subject: "测试邮件",
      sender: "示例教务",
      unread: true,
      time: 1000,
    },
  ]);
  assert.equal(closed && unlocked, true);
});

test("邮箱账号仅在验证成功后保存，错误与状态不包含凭据", async () => {
  let saved = {},
    calls = 0;
  const secrets = {
    load: () => saved,
    save: (input) => {
      saved = input;
    },
    clear: () => {
      saved = {};
    },
  };
  const mail = new SjtuMail(secrets, async ({ pass }) => {
    calls++;
    if (pass !== "correct")
      throw Object.assign(Error(pass), { authenticationFailed: true });
    return [{ uid: 1, subject: "校园通知" }];
  });
  await assert.rejects(
    mail.configure({ username: "demo", password: "private-wrong-value" }),
    /^Error: 邮箱登录失败/,
  );
  assert.deepEqual(saved, {});
  const state = await mail.configure({ username: "demo", password: "correct" });
  assert.equal(state.configured, true);
  assert.equal(JSON.stringify(state).includes("correct"), false);
  assert.deepEqual(await mail.refresh(), state);
  assert.equal(calls, 2);
  mail.disconnect();
  assert.deepEqual(saved, {});
  assert.deepEqual(mail.status().items, []);
});
