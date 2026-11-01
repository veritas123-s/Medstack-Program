# Medstack Android V6.2.0

安卓端是 Medstack 的原生 Compose 伴侣应用。它使用与电脑端相同的 Medstack 账号和同步文档，提供今日概览、任务编辑、课程与日程查看、专注记录及同步冲突处理。手机和电脑之间没有局域网监听或文件共享。

## 构建

需要 JDK 17、Android SDK 36 和已接受的 Android SDK 许可：

```powershell
cd android
.\gradlew.bat :app:assembleDebug :app:lintDebug
```

仓库 Android 工作流先构建共享 Pi 运行库，再编译并执行 Release Lint，输出未签名的发行 APK。下载后在本机签名，私钥不上传 GitHub。正式分发包需要长期保管独立签名密钥；以后更新须沿用同一证书。私钥和 `keystore.properties` 均被 Git 忽略。

## 数据与安全

- 固定连接打包的 HTTPS 账号地址，不接受用户输入的任意服务地址或跳转。
- 会话令牌和离线文档使用 Android KeyStore AES-GCM 加密。
- 禁用明文网络、云备份和设备迁移备份。
- 云端写入携带版本号，冲突时必须明确选择云端或手机版本。
- 学校登录会话、模型 API 密钥和云厂商凭据不进入安卓同步文档。

默认云文档位于 `app/src/main/assets/default-cloud-document.json`。桌面同步字段发生兼容性修改时，须从根项目的 `cloudDocument(initialState())` 重新生成并同时运行根项目、服务端与安卓构建检查。

V6.2：恢复持续发行，任务筛选/回收站、自定义专注和同步编辑保护；校园快讯已取消。日程的考试筛选使用电脑端教务同步后进入账号日程的考试，不上传学校登录凭据。
