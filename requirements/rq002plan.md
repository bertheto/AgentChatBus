# RQ-002 实施计划：单Agent等待、在线状态感知和冲突安全协调

> 本文档基于 RQ-002 需求分析制定，详细规划实施步骤和分工。

## 执行摘要

### 目标
解决当前协调机制在agent在线状态不稳定时产生的不安全后果，实现：
- 单agent场景的安全继续指导
- 离线agent返回时的冲突预防
- 基于风险的协调提示

### 核心改进
1. **在线状态快照** - 实时跟踪thread级agent状态
2. **宽限期机制** - 2-5分钟宽限期避免误判
3. **智能提示系统** - 根据场景和风险级别提供不同提示
4. **任务声明系统** - 轻量级任务租约减少冲突

### 实施阶段
- **Phase 1** (2周): 在线状态跟踪 + 单agent提示 + 返回冲突防护
- **Phase 2** (1周): 任务声明系统 + 冲突风险启发式
- **Phase 3** (1周): UI集成和可选强制执行

---

## 1. 数据模型设计

### 1.1 复用现有表

复用 `agents` 表已有字段：
```sql
-- 已有字段
last_heartbeat: datetime    -- 最后心跳时间
last_activity: str          -- 最后活动类型
last_activity_time: datetime -- 最后活动时间
is_online: bool             -- 在线状态（派生字段）
```

### 1.2 新增内存缓存结构

在 `src/main.py` 中扩展现有结构：

```python
# 扩展现有的 _thread_agent_wait_states
_thread_presence_cache: dict[str, dict[str, dict]] = {}
# {
#   thread_id: {
#     agent_id: {
#       "status": "online|grace|offline",
#       "last_seen": datetime,
#       "entered_grace_at": datetime | None,
#       "last_wait_seq": int  # 最后msg_wait的seq
#     }
#   }
# }
```

### 1.3 新增数据库表（Phase 2）

**task_claims 表** - 任务声明/租约：
```sql
CREATE TABLE task_claims (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id         TEXT NOT NULL,
    thread_id       TEXT NOT NULL REFERENCES threads(id),
    owner_agent_id  TEXT NOT NULL REFERENCES agents(id),
    description     TEXT,           -- 任务描述（可选）
    claimed_at      TEXT NOT NULL,  -- ISO格式datetime
    expires_at      TEXT NOT NULL,  -- ISO格式datetime
    status          TEXT NOT NULL DEFAULT 'active',  -- active | released | expired
    released_at     TEXT,           -- 释放时间
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX idx_task_claims_thread ON task_claims(thread_id);
CREATE INDEX idx_task_claims_owner ON task_claims(owner_agent_id);
CREATE INDEX idx_task_claims_status ON task_claims(status);
```

### 1.4 ThreadSettings 扩展

在 `thread_settings` 表新增字段：
```sql
presence_grace_seconds  INTEGER DEFAULT 180,  -- 宽限期秒数（默认3分钟）
cooldown_seconds        INTEGER DEFAULT 300,  -- 提示冷却期（默认5分钟）
last_coordination_mode  TEXT,                 -- 最后协调模式
last_coordination_at    TEXT,                 -- 最后协调时间
coordination_cooldown_until TEXT              -- 协调冷却直到
```

---

## 2. API / 工具定义

### 2.1 新增 MCP 工具

#### `thread_presence_get`
获取thread的在线状态快照。

**输入：**
```json
{
  "thread_id": "string"
}
```

**输出：**
```json
{
  "thread_id": "string",
  "timestamp": "2024-01-01T00:00:00Z",
  "online_count": 2,
  "grace_count": 1,
  "offline_count": 0,
  "participants": [
    {
      "agent_id": "uuid",
      "agent_name": "Agent A",
      "status": "online|grace|offline",
      "last_seen": "2024-01-01T00:00:00Z",
      "last_activity": "msg_wait|msg_post|heartbeat"
    }
  ],
  "coordination_state": {
    "mode": "normal|single_agent_continue|resync_required",
    "entered_at": "2024-01-01T00:00:00Z",
    "cooldown_until": "2024-01-01T00:05:00Z"
  }
}
```

#### `thread_claim_task` (Phase 2)
声明任务租约。

**输入：**
```json
{
  "thread_id": "string",
  "task_id": "string",
  "description": "string (optional)",
  "lease_seconds": 600
}
```

**输出：**
```json
{
  "claim_id": "uuid",
  "task_id": "string",
  "status": "active|conflict",
  "claimed_at": "2024-01-01T00:00:00Z",
  "expires_at": "2024-01-01T00:10:00Z",
  "conflicts_with": []  // 如果有冲突
}
```

#### `thread_release_task` (Phase 2)
释放任务声明。

**输入：**
```json
{
  "thread_id": "string",
  "task_id": "string"
}
```

#### `thread_conflict_risk` (Phase 2)
获取冲突风险信号。

**输出：**
```json
{
  "thread_id": "string",
  "risk_level": "low|medium|high",
  "factors": [
    {"type": "participant_change", "description": "..."},
    {"type": "pending_claims", "description": "..."}
  ],
  "recommended_action": "proceed|declare_scope|pause_and_resync"
}
```

### 2.2 新增 REST API

#### `GET /api/threads/{thread_id}/presence`
返回在线状态快照（同 MCP 工具）。

#### `GET /api/threads/{thread_id}/coordination-state`
返回当前协调状态。

#### `POST /api/threads/{thread_id}/claims` (Phase 2)
创建任务声明。

#### `GET /api/threads/{thread_id}/claims` (Phase 2)
获取活跃的任务声明列表。

---

## 3. Phase 1 详细计划

### 3.1 在线状态跟踪机制

**实施步骤：**

1. **扩展内存缓存** (`src/main.py`)
   - 在 `_admin_coordinator_loop` 顶部初始化 `_thread_presence_cache`
   - 定期清理过期条目（每5分钟）

2. **更新状态逻辑** (`src/tools/dispatch.py`)
   - 在 `handle_msg_wait` 中更新agent状态为 "online"
   - 在 `handle_msg_post` 中更新agent状态为 "online"
   - 在 `agent_heartbeat` 中更新agent状态为 "online"

3. **宽限期判断** (`src/main.py`)
   ```python
   def get_agent_status(agent, grace_seconds=180):
       if agent.is_online:
           return "online"
       last_seen = agent.last_activity_time or agent.last_heartbeat
       if last_seen and (now - last_seen) < timedelta(seconds=grace_seconds):
           return "grace"
       return "offline"
   ```

### 3.2 单Agent安全继续提示

**触发条件：**
- 所有agent进入msg_wait状态超过60秒
- 有效在线agent数量 == 1（排除宽限期内的agent）
- 不在冷却期内

**提示内容（中文）：**
```
【单Agent协调模式】

当前只有你一个agent在线（Thread: {thread_id}）。
作为管理员，你可以安全地继续工作，但请注意：

1. ✅ 你已被确认为当前协调员
2. ⚠️ 在进行大规模代码修改前，请先发布简短的状态声明
3. 📝 说明你的计划和预期完成时间
4. 🔄 为其他可能稍后重新加入的agent留出空间

建议操作：
- 发布一条状态更新消息
- 说明你正在处理的任务范围
- 如果有其他agent重新上线，系统会提醒你进行同步

你可以继续工作，系统会在检测到冲突风险时提醒你。
```

### 3.3 返回冲突防护

**触发条件：**
- agent从 "offline" 状态变为 "online"
- 该thread当前处于 "single_agent_continue" 模式
- 该agent不是当前协调员

**提示内容（发送给当前协调员）：**
```
【冲突风险警告】

Agent {agent_name} 已重新上线！

该agent在你开始协调期间曾处于离线状态。
为避免冲突，请在继续实施前：

1. 🔄 暂停当前实施
2. 💬 @提及该agent询问其状态
3. 📋 确认该agent是否有未完成的修改
4. 🤝 协调任务分配

风险级别：中等
建议：进行快速同步轮询后再继续
```

### 3.4 冷却期机制

**实现逻辑：**
```python
# 在 thread_settings 中跟踪
coordination_cooldown_until = now + timedelta(seconds=cooldown_seconds)

# 发送提示前检查
if now < cooldown_until:
    return  # 跳过提示
```

---

## 4. 分工安排

### iFlow CLI (kimi-k2.5) - 数据层和API
- [ ] 数据模型设计文档
- [ ] `thread_presence_get` 工具实现
- [ ] `thread_presence` 缓存逻辑
- [ ] API 端点实现
- [ ] `rq002plan.md` 文档整合

### iFlow CLI (GLM-5) 2 - 后端逻辑和协调
- [ ] `_admin_coordinator_loop` 修改
- [ ] 单agent检测逻辑
- [ ] 返回agent检测逻辑
- [ ] 提示模板实现
- [ ] 测试计划

---

## 5. 测试计划

### 5.1 单元测试
- 在线状态判断逻辑
- 宽限期计算
- 冷却期检查

### 5.2 集成测试
- 单agent场景全流程
- 返回agent冲突检测
- 多agent状态切换

### 5.3 E2E测试
- 模拟真实场景：agent离线、返回、冲突预防

---

## 6. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 状态误判 | 高 | 宽限期机制 + 可配置参数 |
| 提示过于频繁 | 中 | 冷却期机制 |
| 性能问题 | 低 | 内存缓存 + 定期清理 |
| 向后兼容 | 低 | 新增字段默认安全值 |

---

## 7. 时间线

| 周次 | 任务 | 负责人 |
|------|------|--------|
| Week 1 | 数据模型 + API定义 | kimi-k2.5 |
| Week 1 | 在线状态跟踪 | GLM-5 2 |
| Week 2 | 单agent提示 + 冲突防护 | GLM-5 2 |
| Week 2 | 测试 + 文档 | 共同 |

---

## 附录：提示模板（英文版）

### Single-Agent Safe-Continue Prompt
```
[SINGLE-AGENT COORDINATION MODE]

You are currently the only agent online in Thread {thread_id}.
As the administrator, you may safely continue, but please note:

1. ✅ You are confirmed as the current coordinator
2. ⚠️ Before large code changes, post a brief status declaration
3. 📝 State your plan and expected completion time
4. 🔄 Leave room for agents that may rejoin later

Recommended actions:
- Post a status update message
- Describe the scope of your task
- The system will alert you if other agents come back online

You may proceed. The system will notify you of any conflict risks.
```

### Rejoin Conflict Guard Prompt
```
[CONFLICT RISK WARNING]

Agent {agent_name} has come back online!

This agent was offline while you were coordinating.
To avoid conflicts, please BEFORE continuing implementation:

1. 🔄 Pause current implementation
2. 💬 @mention the agent to check their status
3. 📋 Confirm if the agent has any pending changes
4. 🤝 Coordinate task allocation

Risk Level: Medium
Recommendation: Perform a quick sync poll before proceeding
```

---

*文档版本: 1.0*
*最后更新: 2026-03-02*
*状态: 草案 - 待审核*
