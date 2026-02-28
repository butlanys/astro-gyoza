---
title: 解决nvidia与Wayland的冲突的神必小代码
date: 2026-02-28 17:34:45+08:00
lastMod: 2026-02-28 17:34:45+08:00
summary: 解决nvidia与Wayland的冲突的神必小代码
category: linux
tags:
- linux
- nvidia
sticky: 0
---

报错：
```log
Gdk-Message: 17:33:04.497: Error 71 (协议错误) dispatching to Wayland display.
```

在运行软件的命名前加上
```
__NV_DISABLE_EXPLICIT_SYNC=1WEBKIT_DISABLE_COMPOSITING_MODE=1WEBKIT_DISABLE_DMABUF_RENDERER=1__NV_DISABLE_EXPLICIT_SYNC=1  ./{二进制文件}
```
解决

目前这个bug要么等上游更新，要么自己加禁止硬件加速解决

<img width="640" height="360" alt="image" src="https://github.com/user-attachments/assets/c4b08ee6-612c-4c4c-98e5-2fad90f99471" />
