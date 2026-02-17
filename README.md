# 世然 Shiran

世然（Shiran）是一个面向中文用户的交互式科普项目，用可操作、可观察的方式解释复杂机制和思想实验。

一句话：**世间万物皆有理，好奇一试便释然。**

## 项目目标

- 用交互代替纯文字讲解，让抽象原理“看得见、摸得着”。
- 围绕日常决策、群体行为、物理与数学等主题，构建可持续扩展的探索单元库。
- 从首页的“生命游戏导航系统”进入，再按兴趣深入到具体模块。

## 当前实现（V1 原型）

- 生命游戏画布首页（主入口）
- 全览抽屉四种模式：`核心模块库 / 每日新知流 / 混合 / 收藏池`
- 全览默认模式：`每日新知流`
- 中英双语切换按钮（`中文 <-> English`）
- RSS 源管理（添加、筛选、批量操作、OPML 导入、推荐源）
- 收藏池（保存、手动添加、批量删除）
- 全站访问计数（PV + UV）
  - 接口：`GET /api/visits`、`POST /api/visits`
  - 存储：Vercel KV（Upstash）
- 移动端与 iPad 适配（含安全区、抽屉和弹窗布局优化）

## 目录结构

```text
.
├── api/                    # Vercel Serverless Functions（当前包含 visits 计数接口）
├── main_program/           # 首页主程序（生命游戏导航）
├── model_library/          # 探索单元运行时模块库
├── v1_foundation/          # V1 地基资产、规范、脚本与索引
├── ExportBlock/            # 主题内容导出块与素材
├── deploy/                 # 部署相关文件
└── vercel.json             # Vercel 路由配置（根路径重定向到 /main_program/）
```

## 本地运行

当前是静态页面 + Serverless API 的结构，前端可先本地静态启动：

```powershell
cd SHIRAN
python -m http.server 8787
```

打开：

- `http://localhost:8787/main_program/`

## 部署到 Vercel（含访问计数）

1. 在 Vercel 导入本仓库。
2. 创建并绑定 Vercel KV（Upstash）。
3. 在项目环境变量中确认：
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
4. 部署后验证：
   - `GET /api/visits` 可读取统计
   - 访问首页后 `POST /api/visits` 应持续累加

> 说明：当 KV 未配置或临时不可用时，前端会使用本地回退计数，不影响页面可用性。

## 相关文档

- `世然 Shiran — 好奇心的交互实验场.md`
- `技术架构：主程序 + 模块插件系统.md`
- `首页设计方案：生命游戏导航系统.md`
- `v1_foundation/README.md`
- `main_program/README.md`
- `model_library/README.md`

## 现阶段状态

项目处于持续迭代中，正在从“可用原型”向“可扩展内容平台”推进。当前重点是：

- 完善探索单元内容质量与覆盖
- 稳定 RSS 新知流和收藏工作流
- 优化跨端体验与加载性能
