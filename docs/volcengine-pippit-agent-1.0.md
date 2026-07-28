# 小云雀智能生视频 Agent 1.0 接口摘要

官方文档：https://docs.volcengine.com/docs/85621/2283633?lang=zh

更新时间：2026-04-23。以下内容用于 CutFlow 接入，字段以官方文档为准。

## 提交任务

- 地址：`https://visual.volcengineapi.com`
- 方法：`POST`
- Content-Type：`application/json`
- Query：`Action=CVSync2AsyncSubmitTask&Version=2022-08-31`
- 鉴权：Region `cn-north-1`，Service `cv`

Body：

| 字段 | 类型 | 必选 | 说明 |
| --- | --- | --- | --- |
| `req_key` | string | 是 | 固定为 `pippit_iv2v_cvtob` |
| `prompt` | string | 是 | 中英文均可，最多 2000 字 |
| `img_url_list` | string[] | 否 | 公网可访问的参考图片 URL |
| `video_url_list` | string[] | 否 | 公网可访问的参考视频 URL |
| `ratio` | string | 否 | `16:9`、`9:16`、`4:3`、`3:4` |
| `duration` | string | 否 | `～15s`、`～30s`、`40～60s` |
| `language` | string | 否 | 默认 `Chinese` |
| `accent` | string | 否 | 默认 `PuTongHua` |
| `enable_watermark` | boolean | 否 | 默认 `true` |

参考素材限制：

- 图片与视频总数不超过 50。
- 单张图片不超过 20MB，分辨率不超过 4096×4096。
- 单个视频最长 3 分钟、大小不超过 200MB。
- 所有素材 URL 必须能被小云雀服务公网访问。

## 查询任务

- Query：`Action=CVSync2AsyncGetResult&Version=2022-08-31`
- Body：`req_key`、`task_id`
- `video_url` 有效期 1 小时，收到后应立即下载到项目。
- 状态：`processing`、`in_queue`、`generating`、`done`、`not_found`、`expired`。
- 任务可能在 12 小时后过期。

## CutFlow 接入说明

项目内本地图片不能直接作为 `img_url_list`。CutFlow 会先上传到用户配置的七牛云
Bucket，再通过 CDN 域名生成公网 URL。AK、SK、Bucket 和 CDN 域名只保存在本机设置文件中。
