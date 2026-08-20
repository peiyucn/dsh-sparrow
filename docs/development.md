# 开发说明

## 命令

```sh
npm run typecheck   # tsc --noEmit(类型检查)
npm test            # node --test(结构测试)
npm run verify      # 两者都跑(提交前必跑)
```

## 本地验证(host 半)

需要 dsh 源码 checkout(开发期用 --patch 直接加载 TS 源文件,无需构建):

```sh
cd C:\Users\DJ028191\deepseek-harness
pnpm dsh web --patch C:\Users\DJ028191\OneDrive\pyai\dsh-sparrow\dev.patch.yml
```

启动后终端打印 [dsh-sparrow] host loaded — 麻雀虽小,五脏俱全 即验证通过。

> 注意:验证前先停掉正在运行的 dsh(端口冲突)。dev.patch.yml 里的路径是本机绝对路径,换机器要改。

## client 半

client 半(M2 起)需要构建浏览器 bundle;构建方案待 M2 开工时确定(候选:esbuild 单文件 bundle)。