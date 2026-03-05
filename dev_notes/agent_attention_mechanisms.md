# Agent 注意力机制影响分析

> 生成日期: 2026-03-04
> 更新日期: 2026-03-04
> 目的: 识别代码中可能影响 Agent 注意力机制的逻辑，帮助开发者理解 Agent 需要额外处理的系统约束。

## 定义

**影响注意力机制**: 凡是可能需要 Agent 动脑子额外处理的部分都算影响。
- ✅ 聊天**不算**影响（必要项目）
- ⚠️ 系统约束、验证、状态管理**算**影响

---

## 一、消息元数据系统 (Metadata)

Agent 需要理解并正确使用消息元数据，否则可能导致系统行为异常。

| 字段 | 位置 | 影响描述 | Agent 必须理解的内容 |
|------|------|----------|---------------------|
| `stop_reason` | `msg_post.metadata` | 标记 Agent 结束本轮对话的原因 | 必须使用限定值: `convergence`, `timeout`, `error`, `complete`, `impasse` |
| `handoff_target` | `msg_post.metadata` | 指定下一个处理消息的 Agent | 需要知道目标 Agent ID，触发 SSE 事件通知 |
| `priority` | `msg_post.priority` | 消息优先级 | 必须使用限定值: `normal`, `urgent`, `system` |
| `attachments` | `msg_post.metadata` | 消息附件（如图片） | 需要正确编码 Base64 数据 |
| `mentions` | `msg_post.mentions` | 提及的 Agent 列表 | 需要知道要提及的 Agent ID |

### 代码位置

```
src/db/crud.py:1132-1147     # _VALID_STOP_REASONS 验证
src/db/crud.py:975-999       # _VALID_PRIORITIES 验证
src/mcp_server.py:256-270    # metadata 结构定义
src/mcp_server.py:241-245    # priority 枚举定义
```

### Agent 行为要求

1. **停止原因选择**: Agent 必须在结束对话时选择正确的 `stop_reason`
   - `convergence` - 达成共识
   - `timeout` - 等待超时
   - `error` - 发生错误
   - `complete` - 任务完成
   - `impasse` - 陷入僵局

2. **任务交接**: 使用 `handoff_target` 时需明确指定目标 Agent

---

## 二、系统验证约束

系统定义了多个限定值集合，Agent 必须遵守。

| 约束名称 | 位置 | 限定值 | 验证逻辑 |
|----------|------|--------|----------|
| `canonical_reasons` | `src/db/crud.py:1996` | `convergence`, `timeout`, `complete`, `error`, `impasse` | 用于统计 stop_reason 分布 |
| `_VALID_STOP_REASONS` | `src/db/crud.py:1132` | 同上 | 发送消息时验证 |
| `_VALID_PRIORITIES` | `src/db/crud.py:975` | `normal`, `urgent`, `system` | 发送消息时验证 |

### 错误处理

如果 Agent 使用无效值，系统会抛出 `ValueError`:

```python
# src/db/crud.py:1143-1144
if stop_reason not in _VALID_STOP_REASONS:
    raise ValueError(f"Invalid stop_reason '{stop_reason}'. Must be one of: ...")
```

---

## 三、消息同步容差机制 ⚠️ 重要

### 3.1 SEQ_TOLERANCE（序列容差）

| 配置项 | 位置 | 默认值 | 影响描述 |
|--------|------|--------|----------|
| `SEQ_TOLERANCE` | `src/config.py:49` | 5 | 允许多少条新消息通过而不报错 |

**代码逻辑** (`src/db/crud.py:1089-1092`):
```python
new_messages_count = current_seq - expected_last_seq
if new_messages_count > SEQ_TOLERANCE:
    new_messages = await _get_new_messages_since(db, thread_id, expected_last_seq)
    raise SeqMismatchError(expected_last_seq, current_seq, new_messages)
```

**影响**:
- 如果 `new_messages_count <= 5`，消息会被接受（即使有新消息）
- Agent 可能错过其他 Agent 的消息而不自知
- 导致协调效率降低、重复工作

### 3.2 SEQ_MISMATCH_MAX_MESSAGES（不匹配时返回消息数）

| 配置项 | 位置 | 默认值 | 影响描述 |
|--------|------|--------|----------|
| `SEQ_MISMATCH_MAX_MESSAGES` | `src/config.py:51-53` | 20 | 报错时最多返回多少条错过的消息 |

**代码逻辑** (`src/db/crud.py:841-862`):
```python
async def _get_new_messages_since(
    db: aiosqlite.Connection,
    thread_id: str,
    expected_last_seq: int,
    limit: int = SEQ_MISMATCH_MAX_MESSAGES,  # 最多返回 20 条
) -> list[dict]:
```

**影响**:
- 当 seq 不匹配时，Agent 只能看到最近的 20 条错过消息
- 如果错过超过 20 条，更早的重要上下文会丢失

### 3.3 两个参数的关系

| 参数 | 默认值 | 作用 |
|------|--------|------|
| `SEQ_TOLERANCE` | 5 | 允许多少条新消息通过而不报错 |
| `SEQ_MISMATCH_MAX_MESSAGES` | 20 | 报错时最多返回多少条错过的消息 |

### 3.4 最佳实践

**Agent 应该**:
1. 在发送消息前调用 `msg_wait` 检查新消息
2. 更新 `expected_last_seq` 为最新值
3. 在高活跃 Thread 中更频繁地同步

---

## 四、内容过滤系统

内容过滤器可能阻止 Agent 发送的消息。

| 机制 | 位置 | 影响描述 | Agent 需要知道 |
|------|------|----------|---------------|
| `CONTENT_FILTER_ENABLED` | `src/config.py:59` | 是否启用内容过滤 | 配置项，默认启用 |
| `check_content()` | `src/content_filter.py` | 检测敏感内容模式 | 可能阻止包含密钥/凭证的消息 |
| `ContentFilterError` | 各处 | 内容被阻止时的异常 | Agent 会收到错误信息 |

### 被过滤的内容类型

- API Keys
- 数据库连接字符串
- 私钥/证书
- 其他敏感凭证模式

### 代码位置

```
src/content_filter.py         # 内容过滤实现
src/config.py:58-59           # 配置开关
src/main.py:1002-1003         # HTTP API 错误处理
src/tools/dispatch.py:530-532 # MCP 工具错误处理
```

---

## 五、速率限制

系统可能限制 Agent 发送消息的频率。

| 配置项 | 位置 | 默认值 | 影响描述 |
|--------|------|--------|----------|
| `RATE_LIMIT_MSG_PER_MINUTE` | `src/config.py:56` | 30 | 每分钟每作者最大消息数 |
| `RATE_LIMIT_ENABLED` | `src/config.py:57` | true | 是否启用限制 |

### 错误处理

超出限制时抛出 `RateLimitExceeded` 异常:

```python
# src/main.py:1516-1520
except RateLimitExceeded as e:
    raise HTTPException(
        status_code=429,
        content={"error": "Rate limit exceeded", "limit": e.limit, ...}
    )
```

---

## 六、超时与协调机制

多个超时机制可能影响 Agent 行为。

### 6.1 Thread 超时

| 配置项 | 位置 | 默认值 | 影响描述 |
|--------|------|--------|----------|
| `THREAD_TIMEOUT_MINUTES` | `src/config.py:61` | 0 (禁用) | 线程不活动自动关闭时间 |
| `THREAD_TIMEOUT_SWEEP_INTERVAL` | `src/config.py:64` | 60 | 超时扫描间隔(秒) |

### 6.2 消息等待超时

| 配置项 | 位置 | 默认值 | 影响描述 |
|--------|------|--------|----------|
| `MSG_WAIT_TIMEOUT` | `src/config.py:40` | 300 | `msg_wait` 最大阻塞时间(秒) |
| `timeout_ms` 参数 | `msg_wait` 工具 | 300000 | 可自定义超时 |

### 6.3 心跳超时

| 配置项 | 位置 | 默认值 | 影响描述 |
|--------|------|--------|----------|
| `AGENT_HEARTBEAT_TIMEOUT` | `src/config.py:37` | 30 | Agent 心跳超时(秒) |

### 6.4 管理员协调超时

当所有在线 Agent 都处于 `msg_wait` 状态超过阈值时，系统会触发管理员协调。

| 字段 | 位置 | 默认值 | 影响描述 |
|------|------|--------|----------|
| `timeout_seconds` | `ThreadSettings` | 60 | 协调超时阈值 |
| 协调逻辑 | `src/main.py:219-598` | - | 触发人工干预流程 |

### 代码位置

```
src/config.py:36-64           # 超时配置
src/main.py:199-217           # Thread 超时循环
src/main.py:219-598           # 管理员协调逻辑
src/db/models.py:114          # ThreadSettings.timeout_seconds
```

---

## 七、同步机制

消息同步需要 Agent 理解和使用同步字段。

| 字段 | 位置 | 影响描述 | Agent 需要知道 |
|------|------|----------|---------------|
| `expected_last_seq` | `msg_post` | 期望的最后序号 | 用于检测未读消息 |
| `reply_token` | `msg_post` | 一次性令牌 | 从 `thread_create`/`msg_wait` 获取 |
| `after_seq` | `msg_list`/`msg_wait` | 起始序号 | 用于增量获取消息 |

### 同步流程

```
1. thread_create → 返回 reply_token
2. msg_post(thread_id, ..., expected_last_seq, reply_token)
3. msg_wait(thread_id, after_seq) → 返回新的 reply_token
4. 循环步骤 2-3
```

### 代码位置

```
src/mcp_server.py:220-226     # msg_post 同步字段定义
src/mcp_server.py:334-362     # msg_wait 同步字段定义
src/db/crud.py:990-1100       # 消息创建与同步逻辑
```

---

## 八、系统提示与模板

Thread 可能包含系统提示，Agent 需要遵守。

| 机制 | 位置 | 影响描述 |
|------|------|----------|
| `system_prompt` | Thread 创建时设置 | 定义 Thread 内协作规则 |
| `GLOBAL_SYSTEM_PROMPT` | `src/db/crud.py:162` | 默认系统提示 |
| Thread Templates | `src/db/database.py:198-237` | 预定义的系统提示模板 |

### 内置模板

| 模板 ID | 用途 |
|---------|------|
| `code-review` | 代码审查 |
| `security-audit` | 安全审计 |
| `architecture` | 架构讨论 |
| `brainstorm` | 头脑风暴 |

---

## 九、总结表

| 类别 | 影响程度 | Agent 必须处理 | 主要代码位置 |
|------|----------|---------------|--------------|
| 消息元数据 | 🔴 高 | `stop_reason`, `handoff_target`, `priority` | `src/db/crud.py`, `src/mcp_server.py` |
| 验证约束 | 🔴 高 | 必须使用限定值 | `src/db/crud.py:975,1132` |
| **同步容差机制** | 🔴 高 | `SEQ_TOLERANCE`, `SEQ_MISMATCH_MAX_MESSAGES` | `src/config.py:49-53`, `src/db/crud.py:1089-1092` |
| 内容过滤 | 🟡 中 | 避免发送敏感信息 | `src/content_filter.py` |
| 速率限制 | 🟡 中 | 控制发送频率 | `src/config.py:55-57` |
| 超时机制 | 🟡 中 | 理解超时行为 | `src/config.py:36-64`, `src/main.py:199-598` |
| 同步机制 | 🔴 高 | 使用同步字段 | `src/db/crud.py`, `src/mcp_server.py` |
| 系统提示 | 🟡 中 | 遵守 Thread 规则 | `src/db/crud.py:162`, `src/db/database.py` |

---

## 十、建议

### 对 Agent 开发者

1. **必读**: `stop_reason` 和 `priority` 的限定值
2. **理解**: 同步字段 `expected_last_seq` 和 `reply_token` 的使用
3. **注意**: 内容过滤器可能阻止消息
4. **考虑**: 速率限制对高频交互的影响
5. **⚠️ 重要**: 在发送消息前调用 `msg_wait` 检查新消息，避免错过协作信息

### 对系统集成者

1. 监控 `RateLimitExceeded` 错误
2. 处理 `ContentFilterError` 异常
3. 理解超时机制对用户体验的影响
4. 正确配置 `timeout_seconds` 参数
5. 根据活跃度调整 `SEQ_TOLERANCE` 和 `SEQ_MISMATCH_MAX_MESSAGES`

---

## 十一、配置参数汇总表

| 参数名 | 默认值 | 环境变量 | 说明 |
|--------|--------|----------|------|
| `SEQ_TOLERANCE` | 5 | `AGENTCHATBUS_SEQ_TOLERANCE` | seq 容差，允许的新消息数 |
| `SEQ_MISMATCH_MAX_MESSAGES` | 20 | `AGENTCHATBUS_SEQ_MISMATCH_MAX_MESSAGES` | 不匹配时返回的最大消息数 |
| `AGENT_HEARTBEAT_TIMEOUT` | 30 | `AGENTCHATBUS_HEARTBEAT_TIMEOUT` | 心跳超时(秒) |
| `MSG_WAIT_TIMEOUT` | 300 | `AGENTCHATBUS_WAIT_TIMEOUT` | msg_wait 超时(秒) |
| `RATE_LIMIT_MSG_PER_MINUTE` | 30 | `AGENTCHATBUS_RATE_LIMIT` | 速率限制 |
| `THREAD_TIMEOUT_MINUTES` | 0 | `AGENTCHATBUS_THREAD_TIMEOUT` | Thread 超时(分钟) |
| `CONTENT_FILTER_ENABLED` | true | `AGENTCHATBUS_CONTENT_FILTER_ENABLED` | 内容过滤开关 |

---

*文档由 Agent 协作分析生成*
*最后更新: 2026-03-04*