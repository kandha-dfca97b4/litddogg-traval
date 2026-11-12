# Supabase 配置指南

共享实时同步需要一个 Supabase 项目。未完成配置时，网页仍可在单台设备上使用并自动保存到浏览器，但不会假装跨设备同步已经可用。

## 1. 创建项目

1. 打开 https://supabase.com/dashboard 并创建一个项目。
2. 等待数据库初始化完成。
3. 在项目的 Project Settings → API 页面找到：
   - Project URL
   - anon / publishable public key

只使用 anon public key。不要使用或公开 service_role key。

## 2. 创建数据库结构

1. 打开 Supabase 项目的 SQL Editor。
2. 新建 SQL 查询。
3. 把本仓库 supabase/schema.sql 的全部内容粘贴进去并执行。
4. 确认执行成功，没有报错。

以后网站增加同步相关功能时，如果我更新了 `schema.sql`，请重新执行新版脚本。当前脚本使用 `create or replace function` 更新同步逻辑，不会删除已有共享清单或邀请链接。

该脚本会创建共享清单表、启用 RLS、禁止浏览器直接读写表，并创建需要邀请码验证的 RPC 函数。

## 3. 填写前端配置

打开仓库根目录的 config.js，填入 Project URL 和 anon public key：

~~~js
window.TRAVEL_CONFIG = {
  supabaseUrl: "https://你的项目编号.supabase.co",
  supabaseAnonKey: "你的 anon public key"
};
~~~

anon public key 本来就是给浏览器使用的公开客户端密钥；安全边界由数据库权限、RLS 和 RPC 内的邀请码校验提供。不要把数据库密码或 service_role key 写进这里。

## 4. 创建共享空间

部署网页后，点击「邀请同行」。配置正确时，网页会创建一个随机邀请码，并生成专属邀请链接。把链接发给同行的人即可进入同一份清单。

邀请链接相当于访问凭据，只分享给可信任的人。若链接被转发，拿到链接的人也能访问该共享空间。

## 5. GitHub Pages

合并到 main 后，GitHub Actions 会自动部署静态网页。首次使用时，在仓库 Settings → Pages 中把 Build and deployment 的 Source 设为 GitHub Actions。

## 同步实现说明

- 清单数据通过 create_trip_room、get_trip_room、save_trip_room RPC 读写。
- 邀请码只以 SHA-256 哈希形式保存在数据库中。
- 数据表不向 anon/authenticated 角色开放直接访问。
- 实时频道只广播刷新通知，不广播清单正文；收到通知后，客户端会使用邀请码重新读取数据。
- 数据合并按物品 ID 合并，单件物品使用 updatedAt 处理并发修改；同一件物品同时被两端修改时，以最后保存的版本为准。
