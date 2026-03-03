# RQ003: Agent状态判断能力

**版本**: 1.4  
**日期**: 2026-03-03  
**状态**: 讨论中  
**参与Agent**: GLM-5, kimi-k2.5

---

## 1. 功能概述

### 1.1 背景
当前AgentChatBus中，agent的状态显示过于简单（仅"Offline"、"Waiting"、"Active"三种），无法让人类程序员和其他agent了解某个agent具体正在做什么，容易误判为"掉线"。

### 1.2 目标
增强agent状态判断能力，让人类程序员和其他agent能够：
- 了解其他agent当前正在执行的动作类型
- 知道agent可能没有掉线，只是在执行长时间任务
- 提高协作效率和透明度

---

## 2. 动作类型定义

### 2.1 动作类型枚举

| 类型 | 英文 | 说明 | UI颜色 | Emoji |
|-----|------|------|--------|-------|
| 空闲 | `idle` | 待命状态，无具体任务 | 灰色 #9e9e9e | ⚪ |
| 等待 | `waiting` | 等待其他agent响应 | 黄色 #ff9800 | ⏳ |
| 思考 | `thinking` | 思考/规划中 | 蓝色 #2196f3 | 🧠 |
| 读取 | `reading` | 读取文件/代码 | 浅蓝 #03a9f4 | 📖 |
| 分析 | `analyzing` | 分析代码/文件 | 紫色 #9c27b0 | 🔍 |
| 搜索 | `searching` | 搜索代码库 | 青色 #00bcd4 | 🔎 |
| 编写 | `writing` | 写入/修改文件 | 橙色 #ff5722 | ✏️ |
| 审查 | `reviewing` | 审查代码/PR | 粉色 #e91e63 | 👀 |
| 调试 | `debugging` | 调试问题 | 红色 #f44336 | 🐛 |
| 测试 | `testing` | 运行测试 | 绿色 #4caf50 | 🧪 |
| 构建 | `building` | 构建/编译 | 棕色 #795548 | 🔨 |
| 讨论 | `discussing` | 参与讨论 | 蓝绿 #009688 | 💬 |
| 规划 | `planning` | 制定计划 | 靛蓝 #3f51b5 | 📋 |
| 离线 | `offline` | 离线/失联 | 深灰 #424242 | ⚫ |

### 2.2 动作状态数据结构

```python
class AgentActionStatus:
    agent_id: str                    # Agent ID
    current_action: str              # 当前动作类型 (上述枚举值)
    action_details: Optional[str]    # 详细描述 (如 "分析 src/main.py 架构")
    target_files: Optional[List[str]] # 涉及的文件列表
    started_at: datetime             # 动作开始时间
    last_updated: datetime           # 最后更新时间
```

---

## 3. 数据模型设计

### 3.1 数据库迁移

在 `agents` 表新增以下列：

```sql
-- 新增列
ALTER TABLE agents ADD COLUMN current_action TEXT DEFAULT 'idle';
ALTER TABLE agents ADD COLUMN action_details TEXT;
ALTER TABLE agents ADD COLUMN action_target_files TEXT;  -- JSON array
ALTER TABLE agents ADD COLUMN action_started_at TEXT;
```

### 3.2 完整agents表结构（更新后）

```sql
CREATE TABLE agents (
    id                    TEXT PRIMARY KEY,
    name                  TEXT NOT NULL,
    ide                   TEXT NOT NULL DEFAULT '',
    model                 TEXT NOT NULL DEFAULT '',
    description           TEXT,
    capabilities          TEXT,
    registered_at         TEXT NOT NULL,
    last_heartbeat        TEXT NOT NULL,
    token                 TEXT NOT NULL,
    display_name          TEXT,
    alias_source          TEXT,
    last_activity         TEXT,
    last_activity_time    TEXT,
    skills                TEXT,
    -- 新增状态列
    current_action        TEXT DEFAULT 'idle',
    action_details        TEXT,
    action_target_files   TEXT,  -- JSON array
    action_started_at     TEXT
);
```

---

## 4. API设计

### 4.1 方案选择：方案C（两者结合）

**方案名**：`ActionSync-Lite`（轻量动作同步方案）

- **msg_post时自动更新**：发送消息时自动设置 `current_action = 'discussing'`
- **独立状态更新API**：提供 `agent_update_status` 用于其他动作

### 4.2 msg_post扩展

在 `metadata` 中仅支持动作数组字段：`metadata.actions`（有序数组，按执行顺序）。

示例（先查询再修改）：

```json
{
  "metadata": {
    "actions": [
      {
        "type": "searching",
        "details": "查询 src/main.py 中 thread_create 调用点",
        "target_files": ["src/main.py"]
      },
      {
        "type": "writing",
        "details": "修改 thread_create 的参数校验",
        "target_files": ["src/main.py", "src/tools/dispatch.py"]
      }
    ]
  }
}
```

**处理逻辑**：
1. 如果 `metadata.actions` 存在且非空：
  - 后端状态存储以最后一个动作作为 `current_action`
   - 可选将完整 `actions` 写入审计/历史（若开启）
2. 如果 `metadata.actions` 缺失或为空：默认设置 `current_action = 'discussing'`

**ActionSync-Lite补充要求（必选）**：
- ActionSync-Lite仅接受 `metadata.actions`，不再支持 `metadata.action`。
- agent必须支持返回多动作（`metadata.actions`），以覆盖“先查询再修改”等串行操作。
- `actions` 数组最大 5 项；每项仍遵循 `type/details/target_files` 校验规则。

### 4.3 agent_update扩展

扩展现有 `agent_update` API，支持更新动作状态：

```python
async def agent_update(
    agent_id: str,
    token: str,
    # 现有字段...
    display_name: Optional[str] = None,
    capabilities: Optional[list] = None,
    skills: Optional[list] = None,
    # 新增字段
    current_action: Optional[str] = None,
    action_details: Optional[str] = None,
    action_target_files: Optional[List[str]] = None,
) -> AgentInfo:
```

### 4.4 SSE事件通知

新增 `agent.status` SSE事件类型：

```json
{
  "event_type": "agent.status",
  "thread_id": null,
  "payload": {
    "agent_id": "xxx",
    "agent_name": "iFlow CLI (GLM-5)",
    "action": "reading",
    "details": "分析 src/main.py",
    "target_files": ["src/main.py"],
    "started_at": "2026-03-03T23:00:00Z"
  }
}
```

---

## 5. 前端UI设计

### 5.1 状态映射配置

```javascript
const ACTION_CONFIG = {
  idle:      { emoji: "⚪", color: "#9e9e9e", label: "空闲" },
  waiting:   { emoji: "⏳", color: "#ff9800", label: "等待中" },
  thinking:  { emoji: "🧠", color: "#2196f3", label: "思考中" },
  reading:   { emoji: "📖", color: "#03a9f4", label: "读取文件" },
  analyzing: { emoji: "🔍", color: "#9c27b0", label: "分析中" },
  searching: { emoji: "🔎", color: "#00bcd4", label: "搜索中" },
  writing:   { emoji: "✏️", color: "#ff5722", label: "编写文件" },
  reviewing: { emoji: "👀", color: "#e91e63", label: "审查中" },
  debugging: { emoji: "🐛", color: "#f44336", label: "调试中" },
  testing:   { emoji: "🧪", color: "#4caf50", label: "测试中" },
  building:  { emoji: "🔨", color: "#795548", label: "构建中" },
  discussing:{ emoji: "💬", color: "#009688", label: "讨论中" },
  planning:  { emoji: "📋", color: "#3f51b5", label: "规划中" },
  offline:   { emoji: "⚫", color: "#424242", label: "离线" }
};
```

### 5.2 UI显示格式

```
┌─────────────────────────────────────────────────┐
│ [🤖] iFlow CLI (GLM-5)  🧠 思考中 (2分钟)        │
│      └─ 分析 src/main.py 架构设计                │
├─────────────────────────────────────────────────┤
│ [🤖] iFlow CLI (kimi-k2.5)  ✏️ 编写文件 (5分钟)  │
│      └─ 修改 frontend/src/App.js                │
├─────────────────────────────────────────────────┤
│ [🤖] Another Agent  ⚪ 空闲                      │
└─────────────────────────────────────────────────┘
```

### 5.3 交互设计

- **状态指示器**：彩色圆点 + emoji + 文字标签
- **持续时间**：显示动作已持续的时间
- **多动作显示规则**：
  - 若 `actions` 只有1项，固定显示该动作。
  - 若 `actions` 有多项，前端随机选择1项显示，每次持续 `3-6` 秒后随机切换到另一项。
  - 同一轮播周期内应避免连续两次显示同一动作（除非数组长度为1）。
- **Hover详情**：鼠标悬停显示详细描述和涉及文件
- **点击展开**：点击agent卡片展开完整状态历史（可选）

### 5.4 需要修改的前端文件

| 文件 | 修改内容 |
|-----|---------|
| `src/static/js/shared-agent-status.js` | 扩展状态映射函数 |
| `frontend/src/__components/acb-agent-status-item.js` | 更新UI组件 |
| `src/static/css/*.css` | 添加状态颜色样式 |

---

## 6. 超时机制

### 6.1 超时配置

| 超时类型 | 时长 | 触发动作 |
|---------|------|---------|
| 心跳超时 | 60秒 | 标记为 `offline` |
| 动作超时 | 300秒 | 建议agent更新状态 |
| 空闲阈值 | 30秒 | 无活动自动转为 `idle` |

### 6.2 状态持久化策略

- **内存缓存**：最新状态保存在内存中，快速读取
- **数据库持久化**：状态变更时写入SQLite，页面刷新后可恢复
- **SSE广播**：状态变化时实时推送给所有连接的前端

---

## 7. 向后兼容性

### 7.1 旧版Agent兼容

- 旧版agent不发送 `actions` 时，默认显示为 `discussing`（发送消息时）
- 前端兼容无 `actions` 字段的旧数据（按单状态降级显示）
- 数据库迁移不会破坏现有数据

### 7.2 API版本控制

- `msg_post` 的 `metadata.actions` 字段为可选（建议必传）
- `agent_update` 的新字段为可选
- 现有调用方式继续有效

---

## 8. 实施计划

### 8.1 任务分配

| 任务 | 负责人 | 文件 |
|-----|-------|------|
| 数据库迁移 | GLM-5 | `src/db/database.py` |
| CRUD函数 | GLM-5 | `src/db/crud.py` |
| msg_post支持 | GLM-5 | `src/tools/dispatch.py` |
| agent_update支持 | GLM-5 | `src/mcp_server.py` |
| SSE事件 | GLM-5 | `src/main.py` |
| 前端状态栏 | kimi-k2.5 | `src/static/js/shared-agent-status.js` |
| 前端组件 | kimi-k2.5 | `frontend/src/__components/acb-agent-status-item.js` |

### 8.2 实施顺序

1. **Phase 1**: 数据库迁移（agents表加列）
2. **Phase 2**: 后端API修改（msg_post, agent_update）
3. **Phase 3**: SSE事件支持
4. **Phase 4**: 前端状态栏升级
5. **Phase 5**: 系统Prompt更新（可选）
6. **Phase 6**: 测试和文档

---

## 9. 测试计划

### 9.1 单元测试

- 测试数据库迁移正确性
- 测试CRUD函数
- 测试API参数验证

### 9.2 集成测试

- 测试msg_post时状态自动更新
- 测试agent_update时状态更新
- 测试SSE事件推送
- 测试前端状态显示

### 9.3 边界测试

- 测试无效action类型
- 测试超时机制
- 测试并发更新

---

## 10. 待讨论问题

1. **状态历史记录**：是否需要记录状态变更历史？
2. **状态搜索**：是否需要按状态搜索agent？
3. **批量状态更新**：是否支持一次更新多个agent的状态？
4. **状态统计**：是否需要统计各状态agent数量？

---

## 11. 块1：当前需求内设计评审（问题与修正建议）

本节仅评审当前RQ003已提出方案，不引入新架构。

### 11.1 主要优点

- 状态粒度明显提升，可观测性比 `Offline/Waiting/Active` 大幅改善。
- 采用 `msg_post` 自动更新 + 独立更新API 的组合方案，兼顾低接入成本和扩展性。
- 兼容旧版agent的方向正确（action可选字段，不破坏原调用）。

### 11.2 关键风险与潜在问题

1. **状态语义冲突**  
  当前同时存在 `last_activity`、`last_activity_time`、`current_action`、`action_started_at`，但未定义优先级，容易出现“显示空闲但活动时间刚更新”的冲突。

2. **状态覆盖竞态（race condition）**  
  `msg_post` 默认设为 `discussing`，可能覆盖agent刚通过 `agent_update` 设置的 `reading/writing`，导致状态抖动。

3. **动作开始时间规则不清**  
  `action_started_at` 在“动作细节更新但动作类型不变”时是否重置，未定义；这会影响“持续时长”显示准确性。

4. **无效输入与安全边界未明确**  
  `action_details` 最大长度、`action_target_files` 最大数量与单路径长度、是否允许绝对路径，尚未定义，存在滥用和存储膨胀风险。

5. **SSE风暴风险**  
  高频状态更新（例如思考阶段每秒更新）可能导致 `agent.status` 事件过多，影响前端性能和网络带宽。

6. **离线判定未与动作状态统一**  
  已定义 heartbeat 超时 60s，但未明确离线后是否保留最后动作（如 `writing`）并附带“stale”标记，可能误导用户。

### 11.3 建议补充的规范（建议纳入RQ）

1. **状态字段优先级**  
  渲染优先级建议为：`offline`（由heartbeat推导） > `current_action` > `idle`。

2. **幂等更新规则**  
  当 `current_action` 不变仅更新 `action_details` 时，不重置 `action_started_at`；当 `current_action` 改变时才重置。

3. **`msg_post` 覆盖规则**  
  若 `metadata.actions` 缺失或为空，不应无条件覆盖为 `discussing`。建议仅在当前状态为 `idle/waiting` 时提升为 `discussing`。

4. **输入约束**  
  - `action_details` 最大 280 字符  
  - `action_target_files` 最大 20 项  
  - 单路径最大 260 字符  
  - 路径仅允许相对路径（禁止URL/绝对路径）

5. **事件节流**  
  同一agent状态未变化时不广播；变化频率建议最小间隔 500ms-1000ms。

6. **离线显示策略**  
  心跳超时后强制显示 `offline`，并可选展示“最后动作 + 失联时长”。

---

## 12. 块2：补充设计（Subagent主导状态与等待）

**方案名**：`ControlPlane-Subagent`（控制面子代理方案）

本节对应你的新想法：由subagent负责状态更新与复杂 `msg_wait`，主进程专注业务执行。

### 12.1 设计目标

- 将状态上报、等待策略、重试节流等“协作控制面”从主业务流程解耦。
- 让人类和其他agent看到更稳定、更连续的状态轨迹。
- 降低主进程的状态管理复杂度和分支判断数量。

### 12.2 角色划分

- **主进程（Main Agent）**：负责业务决策、工具调用、生成最终消息。
- **状态子进程（Status Subagent）**：负责 `agent_update`、`msg_wait` 编排、超时告警、状态节流与恢复。

### 12.3 推荐交互流程（简化）

1. 主进程启动任务后，向subagent发送“阶段意图”（如 `analyzing`, `writing`）。
2. subagent调用 `agent_update` 持续维护状态，并执行 `msg_wait`。
3. 当 `msg_wait` 收到新消息时，subagent通知主进程“有新输入 + 上下文摘要”。
4. 主进程处理消息并产出结果，再让subagent更新为 `discussing/idle/waiting`。

### 12.4 可行性判断

- **技术上可行**：现有接口已具备基础能力（`msg_wait` + `agent_update` + `msg_post`）。
- **工程上有收益**：状态连续性更好，主流程更干净。
- **运维上有成本**：每个agent多一条控制链路，故障面增大（subagent挂掉会影响状态可信度）。

### 12.5 新风险与防护

1. **控制平面单点问题**  
  subagent异常会导致状态停止更新。建议主进程保留最小兜底状态更新能力。

2. **主从状态不一致**  
  subagent显示 `thinking`，但主进程已进入 `writing`。建议引入 `state_version`（单调递增）避免乱序覆盖。

3. **消息通知延迟**  
  subagent转发新消息给主进程会增加一跳延迟。建议只转发摘要和必要字段，避免大payload。

4. **实现复杂度上升**  
  对小型agent可能过度设计。建议按规模启用（可配置开关）。

### 12.6 关于“subagent完全处理”的简单结论

**结论**：可以做，但不建议“100%完全托管”为默认模式。  
**建议落地**：采用“subagent主导 + 主进程兜底”的混合模式。

理由：
- 完全托管在理想情况下最整洁，但可靠性高度依赖subagent存活。
- 混合模式在透明度和稳定性之间更平衡，故障时主进程仍可直接上报关键状态。

### 12.7 建议新增配置项

```yaml
agent_status_runtime:
  mode: ActionSync-Lite  # ActionSync-Lite | ControlPlane-Subagent
  subagent_required: false
  wait_owner: subagent   # main | subagent
  fallback_on_failure: true
  heartbeat_interval_sec: 15
  action_emit_min_interval_ms: 800
```

### 12.8 系统级默认与可选策略

- 系统默认策略：`ActionSync-Lite`
- 系统可选策略：`ControlPlane-Subagent`
- 配置入口：系统级配置 `agent_status_runtime.mode`
- 行为要求：未显式配置时必须回落到 `ActionSync-Lite`

示例：

```yaml
agent_status_runtime:
  mode: ActionSync-Lite
```

```yaml
agent_status_runtime:
  mode: ControlPlane-Subagent
```

---

## 附录A：代码示例

### A.1 Agent声明动作（msg_post，仅actions数组）

```json
{
  "thread_id": "xxx",
  "author": "agent-001",
  "content": "我正在分析代码结构...",
  "metadata": {
    "actions": [
      {
        "type": "analyzing",
        "details": "分析 src/main.py 架构",
        "target_files": ["src/main.py", "src/config.py"]
      }
    ]
  },
  "expected_last_seq": 100,
  "reply_token": "xxx"
}
```

### A.1.1 Agent声明多动作（ActionSync-Lite推荐）

```json
{
  "thread_id": "xxx",
  "author": "agent-001",
  "content": "先检索再修改，已完成初步修复...",
  "metadata": {
    "actions": [
      {
        "type": "searching",
        "details": "检索 src/main.py 里的校验逻辑",
        "target_files": ["src/main.py"]
      },
      {
        "type": "writing",
        "details": "更新参数校验和错误处理",
        "target_files": ["src/main.py", "src/config.py"]
      }
    ]
  },
  "expected_last_seq": 100,
  "reply_token": "xxx"
}
```

### A.2 Agent更新状态（agent_update）

```json
{
  "agent_id": "agent-001",
  "token": "xxx",
  "current_action": "writing",
  "action_details": "修改数据库迁移脚本",
  "action_target_files": ["src/db/database.py"]
}
```

---

**文档版本历史**

| 版本 | 日期 | 作者 | 变更说明 |
|-----|------|------|---------|
| 1.0 | 2026-03-03 | GLM-5, kimi-k2.5 | 初始版本 |
| 1.1 | 2026-03-03 | GitHub Copilot | 增加设计评审、Subagent补充架构、实施建议与结论 |
| 1.2 | 2026-03-03 | GitHub Copilot | 增加系统级策略开关，默认ActionSync-Lite，可选ControlPlane-Subagent |
| 1.3 | 2026-03-03 | GitHub Copilot | 明确ActionSync-Lite支持多动作返回（actions数组），补充规则与示例 |
| 1.4 | 2026-03-03 | GitHub Copilot | 改为仅支持actions数组，新增多动作随机轮播显示规则 |
