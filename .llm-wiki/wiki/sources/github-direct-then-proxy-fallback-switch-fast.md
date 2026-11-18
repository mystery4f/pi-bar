---
type: source
title: GitHub 直连会中途失效，失败一次即切代理
status: insight
category: devops
created: 2026-11-18
updated: 2026-11-18
slug: github-direct-then-proxy-fallback-switch-fast
---

# GitHub 直连会中途失效，失败一次即切代理

这台机器上 github.com 的连通性会**在会话中途翻转**，不能只按一次测量定策略。

本轮实测：第一次 `gh repo create --push` 直连成功；十分钟后 `git push` 直连连续失败两次（`Recv failure: Connection was reset`，随后 `Failed to connect to github.com port 443 after 21081 ms`），改用 `HTTPS_PROXY=http://mcr:4444` 一次成功。

结论：直连首发是对的（快），但**直连失败一次就立刻切代理**，不要重复直连重试。可用形式：

```bash
git -c http.proxy= -c https.proxy= push -q   # 直连
HTTPS_PROXY=http://mcr:4444 HTTP_PROXY=http://mcr:4444 git push -q  # 兜底
```

`gh` 同理，用 `env -u HTTPS_PROXY -u HTTP_PROXY gh …` 走直连。

相关：[[sources/replace-remote-repo-by-delete-and-create]]


*Category: devops*

---
*Captured: 2026-11-18*

## Related

_Add links to related pages._
