# 出行带什么 🧳

两个人的小行李，一张清单就够啦 ♡

一个 mobile-first 的双人旅行打包清单。设计方向是柔和奶油底色、粉蓝渐变和轻松可爱的双人准备旅行氛围。

## 已实现

- 目的地和出行日期编辑。
- 两位同行者（默认小猫、小熊）独立勾选与个人备注。
- 证件财物、衣物穿搭、洗漱护理、电子设备、药品日用等初始分类。
- 搜索物品与备注；新增、编辑、删除物品；自定义分类；折叠分类。
- 两人和整体完成进度；重置勾选但保留物品与备注。
- 浏览器 localStorage 自动保存；清单图片导出。
- Supabase 共享房间、邀请码、RPC 校验、实时刷新通知和并发合并代码已接入，等待项目凭据配置后联调。

## 本地体验

直接通过静态服务器打开根目录的 index.html。没有 Supabase 配置时，页面会明确显示“本机保存”，只在当前浏览器保存数据，不会伪装成实时共享。

## 启用双人实时同步

按 supabase/README.md 的步骤创建 Supabase 项目、执行 supabase/schema.sql，并将 Project URL 与 anon public key 填入根目录 config.js。绝不要将 service_role key 写入前端。

## 部署

GitHub Actions 已配置 Pages 工作流。合并到 main 后可在仓库 Settings → Pages 中选择 GitHub Actions 作为发布来源；当前开发分支不会自动发布正式网页。
