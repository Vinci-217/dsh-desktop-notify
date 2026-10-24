# DSH Desktop Notify（桌面通知插件）

[DeepSeek Harness](https://harness.deepseek.com)（DSH）桌面端插件：当**任务完成**或**有问题等你回复 / 做选择**时，弹出一条 Windows 原生桌面通知；**点击通知即可聚焦窗口并跳转到对应会话**。从此不用反复切回 DSH 轮询对话状态。

Works with the DeepSeek Harness desktop app. The notification path uses the standard Web Notification API inside the Electron renderer, so it is not Windows-only in principle, but it is only tested on Windows 11.

## 为什么需要它

DSH 在后台跑长任务时，你可能正在别的窗口工作。两种场景最容易被漏掉：

1. 任务跑完了，你不知道；
2. 模型调用 `ask_user_question` 停下来等你选一个选项，你不知道——于是整条会话卡在那里。

本插件把这两种事件转成操作系统级的桌面通知，并支持点击直达。

## 功能

| 事件 | 通知标题 | 点击行为 |
| --- | --- | --- |
| 会话从「运行中」变为结束 | `任务已完成` + 会话名 | 聚焦 DSH 窗口并打开该会话 |
| 出现待回复的问题 / 选择 | 问题标题（多个问题会注明数量）+ 会话名 | 同上 |

细节设计：

- **覆盖所有会话**，包括没有在界面上打开的后台会话；
- 页面加载时就处于「待回复」状态的问题**依然会提醒**（它仍然需要你）；历史完成事件不会重放；
- 1.5 秒同源去重，防止一次事件在多次状态重建中叠弹；
- 状态源取自 DSH 自家的 `uiSession.sessionStatus`，因此同时兼容阻塞式与超时式 `ask_user_question`；
- 纯客户端插件（渲染进程内用 HTML5 `Notification` 出系统通知），**不修改 DSH 本体**，升级 Harness 不受影响。

## 安装

前置条件：DeepSeek Harness 桌面端（Electron 应用）。

1. 克隆本仓库：

   ```bash
   git clone https://github.com/<your-name>/dsh-desktop-notify.git
   ```

2. 在 Harness 的 **插件管理器（Plugin Manager）** 页面选择「从本地目录安装 bundle」，指向包含 `package.json` 的那层目录。

   也可以直接在 Harness 会话里让 agent 装：

   > 用 plugin_manager 把 `C:\path\to\dsh-desktop-notify` 作为 bundle 安装到当前 profile

3. **完全退出并重启 Harness**。客户端模块只在冷启动时加载——本地目录安装的插件代码改动不会热更新到已打开的页面。

卸载：在插件管理器中禁用或移除该 bundle，然后重启。

> Windows 提示：若系统开启了「专注助手 / 免打扰」，通知可能被静默收纳进通知中心。DSH 的 Electron 壳自带匹配的 Start Menu 快捷方式（AppUserModelID），通常无需额外配置。

## 工作原理

DSH 桌面端的 Web UI 运行在 Electron 渲染进程（`dsh-app://app`）中。该环境默认授予 `notifications` 权限，点击 Windows toast 会把应用带到前台。插件 Client 半区做三件事：

1. 订阅 `ctx.uiSession.sessionStatus`（会话状态快照：`running`、`pendingInteraction`）；
2. 为每个会话保存上一帧，检测到 `running: true → false`，或出现新的 `pendingInteraction`，调用 `new Notification(...)`；
3. 在 `notification.onclick` 里 `window.focus()` + `ctx.uiWorkspace.openSession(sessionId)` 完成跳转。

目录结构：

```
dsh-desktop-notify/
├── package.json        # dsh.bundle.patch + dsh.client 声明
├── cordis.patch.yml    # 向 profile 插入插件行
├── index.js            # Host 半区（空 apply，只为让该行出现在 Loader）
├── client.js           # Client 半区（全部逻辑）
├── icon.svg
└── locale/en.json, locale/zh.json
```

## FAQ

**Q：改了代码但没效果？**
客户端 bundle 的文件指纹会参与启动图组合，本地目录安装的插件需要冷启动才会加载新代码。重启 Harness 即可。

**Q：能不能只在窗口不在前台时提醒？**
在 `client.js` 的 `notify()` 开头加一句判断即可：

```js
if (typeof document !== 'undefined' && document.hasFocus()) return;
```

当前默认「任何会话都提醒」。

**Q：我正在看的这个会话完成任务也会弹吗？**
会。状态源对所有可见会话生效；嫌吵可按上一条加焦点判断。

## License

MIT
