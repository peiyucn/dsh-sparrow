# 更新日志

所有用户可感知的改动都记录在此。
See [English](./CHANGELOG.md).

## 0.1.2-rc.1

- 首发：公司 CodeBuddy 额度接成 DSH 的 LLM provider——仅官方 API Key、仅流式
- 在设置 → 模型的 **CodeBuddy Credits** 行配置：保存时先用 Key 验证模型目录再落库，清空 Key 即停用 provider，官方行头凭据圆点原生生效
- 模型选择器为官方同款 CodeBuddy 版变体：模型行右侧显示积分系数（`x0.79`、`free`），推理等级按服务端逐模型声明
- 模型目录完全由已存 Key 驱动（保存时拉取、后台节流刷新），不写设置文件；未配置 Key 时零网络请求
- 侧栏 CodeBuddy 额度入口：面板显示账号/企业、当期额度（已用 / 额度 / 剩余、进度条、重置日期）与当前选中模型的描述、可用功能、消耗速度
- 输入框下方统计行累计本会话积分，每轮末尾有积分胶囊并可查看按调用拆分的明细（两者均为进程内累计，重启 DSH 清零）
- 凭据引用对齐官方派生名 `CODEBUDDY_CREDITS_API_KEY`；旧拼写 `CODEBUDDY_API_KEY` 仍可识别并自动迁移
- 支持图片输入的模型经官方附件 seam 以 OpenAI 方言 data URL 发图（官方 2000px 压缩档）
