# 安全策略 / Security Policy

## 支持版本 / Supported Versions

| 插件 / Plugin | 支持 / Supported |
| :--- | :--- |
| `plugins/*` 活跃插件（dsh-theme-tone、dsh-archive-manage、dsh-file-manage、dsh-chat-fim、dsh-codebuddy-credits） | 仅最新发布版 / Latest release only |

> 已退役插件不再提供支持（代码原地保留作历史，见根 README《Retired》）：
>
> * `dsh-nav-pin` —— 2026-09-29 并入 `dsh-theme-tone`。
> * `dsh-vision-bridge` —— 2026-09-10 退役（DeepSeek 主模型已原生多模态）。
>
> Retired plugins are no longer supported (their code is kept in-tree for history; see the
> root README's "Retired" section): `dsh-nav-pin` (merged into `dsh-theme-tone`, 2026-09-29)
> and `dsh-vision-bridge` (retired 2026-09-10 — DeepSeek main models are natively multimodal).

## 报告漏洞 / Reporting a Vulnerability

请通过 GitHub **Private vulnerability reporting** 私下报告漏洞，不要在公开 issue 中披露未修复的漏洞：

<https://github.com/peiyucn/dsh-sparrow/security/advisories/new>

Please report vulnerabilities privately via GitHub Private vulnerability reporting — do not disclose unpatched vulnerabilities in public issues:

<https://github.com/peiyucn/dsh-sparrow/security/advisories/new>

- 请附上：复现步骤、影响范围、建议修复；中文或英文均可
- 我们会在 90 天内响应；修复发布后，如你愿意可获公开致谢（也可要求匿名）

依赖漏洞由 Dependabot alerts + security updates 自动跟踪并提修复 PR。
