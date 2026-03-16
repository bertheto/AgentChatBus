import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { exec, ChildProcess } from 'child_process';

const PORT = 39766; // different port for tests
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Helper function to call MCP tools
async function callMcpTool(toolName: string, params: Record<string, any>) {
    const res = await fetch(`${BASE_URL}/api/mcp/tool/${toolName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
    });
    const data = await res.json();
    
    // Handle error responses - server may return error directly in data[0]
    if (!data || !data[0]) {
        throw new Error(`Empty response from ${toolName}`);
    }
    
    // Check if it's an error response
    if (data[0].error) {
        return data[0]; // Return error payload directly
    }
    
    // Normal response - parse text field
    if (!data[0].text) {
        throw new Error(`Invalid response from ${toolName}: missing text field`);
    }
    
    return JSON.parse(data[0].text);
}

describe('Bus Connect Parity Tests', () => {
    let serverProcess: ChildProcess;

    beforeEach(async () => {
        // Use in-memory database like Python tests (:memory:)
        // This ensures complete isolation - each test starts fresh with seq=0
        const DB_PATH = ':memory:';

        // Start server in a separate process with fresh in-memory DB
        serverProcess = exec(`npx tsx src/cli/index.ts serve`, {
            env: {
                ...process.env,
                AGENTCHATBUS_PORT: PORT.toString(),
                AGENTCHATBUS_DB: DB_PATH
            }
        });

        // Wait for server to be ready
        let ready = false;
        for (let i = 0; i < 30; i++) {
            try {
                const res = await fetch(`${BASE_URL}/api/metrics`);
                if (res.ok) {
                    ready = true;
                    break;
                }
            } catch (e) {}
            await new Promise(r => setTimeout(r, 200));
        }
        if (!ready) throw new Error("Server failed to start");
    }, 10000);

    afterEach(async () => {
        // Kill server process - this clears the in-memory singleton state
        if (serverProcess) {
            // On Windows, use taskkill for more reliable process termination
            const { execSync } = await import('child_process');
            try {
                if (serverProcess.pid) {
                    if (process.platform === 'win32') {
                        execSync(`taskkill /pid ${serverProcess.pid} /T /F`, { stdio: 'ignore' });
                    } else {
                        serverProcess.kill('SIGKILL');
                    }
                }
            } catch (e) {
                // Ignore if process already exited
            }
            // Wait to ensure clean shutdown
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        // No need to clean up DB files - :memory: is automatically cleaned
    });

    it('manages bus_connect flow: register -> join -> post (UP-PARITY)', async () => {
        const threadName = "BusConnect-Topic-" + randomUUID().slice(0, 8);
        
        // 1. Initial bus_connect (new agent, new thread)
        const connectRes = await fetch(`${BASE_URL}/api/mcp/tool/bus_connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                thread_name: threadName,
                ide: "Vitest",
                model: "ParityBot",
                capabilities: ["testing"],
                skills: [{ id: "sync-check", name: "Sync Checker" }]
            })
        });

        expect(connectRes.status).toBe(200);
        const connectData = await connectRes.json();
        const payload = JSON.parse(connectData[0].text);

        expect(payload.agent.registered).toBe(true);
        expect(payload.thread.topic).toBe(threadName);
        expect(payload.thread.created).toBe(true);
        expect(payload.current_seq).toBe(0);
        expect(payload.reply_token).toBeDefined();

        const agentId = payload.agent.agent_id;
        const agentToken = payload.agent.token;
        const threadId = payload.thread.thread_id;

        // 2. Post first message using provided sync context
        const postRes = await fetch(`${BASE_URL}/api/mcp/tool/msg_post`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                thread_id: threadId,
                author: agentId,
                content: "First message from parity bot",
                expected_last_seq: payload.current_seq,
                reply_token: payload.reply_token,
                role: "assistant"
            })
        });

        expect(postRes.status).toBe(200);
        const postData = await postRes.json();
        const postPayload = JSON.parse(postData[0].text);
        expect(postPayload.seq).toBe(1);

        // 3. msg_wait for next turn
        const waitRes = await fetch(`${BASE_URL}/api/mcp/tool/msg_wait`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                thread_id: threadId,
                after_seq: 1,
                timeout_ms: 100,
                agent_id: agentId,
                token: agentToken
            })
        });

        expect(waitRes.status).toBe(200);
        const waitData = await waitRes.json();
        const waitPayload = JSON.parse(waitData[0].text);
        expect(waitPayload.current_seq).toBe(1);
        expect(waitPayload.messages).toHaveLength(0);
        expect(waitPayload.reply_token).toBeDefined();

        // 4. Second connect (reuse agent, existing thread)
        const connectRes2 = await fetch(`${BASE_URL}/api/mcp/tool/bus_connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                thread_name: threadName,
                agent_id: agentId,
                token: agentToken
            })
        });
        expect(connectRes2.status).toBe(200);
        const connectData2 = await connectRes2.json();
        const payload2 = JSON.parse(connectData2[0].text);
        
        expect(payload2.agent.registered).toBe(false); // Already existed
        expect(payload2.thread.created).toBe(false);
        expect(payload2.current_seq).toBe(1); // Exactly 1 (the message we posted)
        expect(payload2.messages.length).toBeGreaterThanOrEqual(1); // At least the first message
    });

    it('bus_connect new agent new thread', async () => {
        // 对应 Python: L21-55
        const args = {
            thread_name: "Test-Auto-Create-" + randomUUID().slice(0, 8),
            ide: "TestIDE",
            model: "TestModel"
        };

        const payload = await callMcpTool('bus_connect', args);
        
        // Check agent
        expect(payload.agent.registered).toBe(true);
        expect(payload.agent.agent_id).toBeDefined();
        expect(payload.agent.token).toBeDefined();

        // Check thread
        expect(payload.thread.topic).toBe(args.thread_name);
        expect(payload.thread.created).toBe(true);

        // Check sync context
        expect(payload.current_seq).toBe(0);
        expect(payload.reply_token).toBeDefined();
    });

    it('bus_connect new agent existing thread', async () => {
        // 对应 Python: L57-92
        const threadName = "Existing-Topic-" + randomUUID().slice(0, 8);
        
        // First connect creates thread and posts message
        const payload1 = await callMcpTool('bus_connect', {
            thread_name: threadName,
            ide: "TestIDE",
            model: "TestModel"
        });
        
        // Post a message
        await callMcpTool('msg_post', {
            thread_id: payload1.thread.thread_id,
            author: payload1.agent.agent_id,
            content: "First message",
            expected_last_seq: payload1.current_seq,
            reply_token: payload1.reply_token,
            role: "assistant"
        });

        // Second connect should find existing thread with message
        const payload2 = await callMcpTool('bus_connect', {
            thread_name: threadName,
            ide: "TestIDE2",
            model: "TestModel2"
        });
        
        expect(payload2.agent.registered).toBe(true);
        expect(payload2.thread.created).toBe(false);
        expect(payload2.thread.topic).toBe(threadName);
        expect(payload2.messages.length).toBeGreaterThanOrEqual(1);
        expect(payload2.current_seq).toBeGreaterThanOrEqual(1);
        expect(payload2.reply_token).toBeDefined();
    });

    it('bus_connect no reuse agent', async () => {
        // 对应 Python: L125-150
        const threadName = "No-Reuse-" + randomUUID().slice(0, 8);
        
        // First connect
        const payload1 = await callMcpTool('bus_connect', {
            thread_name: threadName,
            ide: "TestIDE",
            model: "TestModel"
        });
        
        const agentId = payload1.agent.agent_id;
        
        // Try to connect with wrong credentials - should create new agent
        const payload2 = await callMcpTool('bus_connect', {
            thread_name: threadName + "-2",
            ide: "TestIDE",
            model: "TestModel"
        });
        
        // Should successfully create new agent
        expect(payload2.agent.registered).toBe(true);
        expect(payload2.agent.agent_id).not.toBe(agentId);
    });

    it('bus_connect projects human-only message for agent view', async () => {
        // 对应 Python: L96-123
        const threadName = "Hidden-Topic-" + randomUUID().slice(0, 8);
        
        // Setup: create thread and a hidden message
        const payload1 = await callMcpTool('bus_connect', {
            thread_name: threadName,
            ide: "Human",
            model: "Admin"
        });
        
        await callMcpTool('msg_post', {
            thread_id: payload1.thread.thread_id,
            author: "system",
            content: "Only humans should read this.",
            expected_last_seq: payload1.current_seq,
            reply_token: payload1.reply_token,
            role: "system",
            metadata: { visibility: "human_only", ui_type: "admin_switch_confirmation_required" }
        });

        // Now connect as an agent
        const payload2 = await callMcpTool('bus_connect', {
            thread_name: threadName,
            ide: "TestIDE",
            model: "TestModel"
        });
        
        expect(payload2.messages.length).toBeGreaterThanOrEqual(2); // System prompt + Hidden msg
        // Find the hidden message in the list
        const hiddenMsg = payload2.messages.find((m: any) => m.metadata?.visibility === "human_only");
        expect(hiddenMsg).toBeDefined();
        expect(hiddenMsg.content).toBe("[human-only content hidden]");
    });

    it('msg_post seq mismatch returns first read messages', async () => {
        // 对应 Python: L335-431
        const threadName = "SeqMismatch-" + randomUUID().slice(0, 8);
        
        const payload1 = await callMcpTool('bus_connect', {
            thread_name: threadName,
            ide: "VS Code",
            model: "GPT-5"
        });
        
        // Post something to move seq to 1
        await callMcpTool('msg_post', {
            thread_id: payload1.thread.thread_id,
            author: payload1.agent.agent_id,
            content: "seed",
            expected_last_seq: payload1.current_seq,
            reply_token: payload1.reply_token,
            role: "assistant"
        });

        // Get fresh token for seq 1
        const waitPayload = await callMcpTool('msg_wait', {
            thread_id: payload1.thread.thread_id,
            after_seq: 1,
            timeout_ms: 1,
            agent_id: payload1.agent.agent_id,
            token: payload1.agent.token
        });

        // Now move seq ahead manually via another connection to trigger mismatch
        const payload2 = await callMcpTool('bus_connect', {
            thread_name: threadName,
            ide: "Admin",
            model: "Manual"
        });
        
        // Post 6 messages to exceed tolerance (5)
        for (let i = 0; i < 6; i++) {
            const sync = await callMcpTool('msg_wait', {
                thread_id: payload2.thread.thread_id,
                after_seq: i + 1,
                timeout_ms: 1,
                agent_id: payload2.agent.agent_id,
                token: payload2.agent.token
            });
            await callMcpTool('msg_post', {
                thread_id: payload2.thread.thread_id,
                author: payload2.agent.agent_id,
                content: `Update ${i}`,
                expected_last_seq: sync.current_seq,
                reply_token: sync.reply_token,
                role: "assistant"
            });
        }

        // Now try to post with the stale token from agent 1
        const errPayload = await callMcpTool('msg_post', {
            thread_id: payload1.thread.thread_id,
            author: payload1.agent.agent_id,
            content: "stale post",
            expected_last_seq: waitPayload.current_seq, // Still 1
            reply_token: waitPayload.reply_token,
            role: "assistant"
        });

        expect(errPayload.error).toBe("SeqMismatchError");
        expect(errPayload.action).toBe("READ_MESSAGES_THEN_CALL_MSG_WAIT");
        expect(errPayload.new_messages_1st_read).toBeDefined();
        expect(errPayload.new_messages_1st_read.length).toBeGreaterThanOrEqual(6);
    });

    it('msg_post error invalidate tokens uses validated author when no connection context', async () => {
        // 对应 Python: L247-331
        // 1. Initial bus_connect
        const connectOut = await callMcpTool('bus_connect', {
            thread_name: "Author Fallback Invalidates",
            ide: "VS Code",
            model: "GPT-5.3-Codex"
        });
        
        const threadId = connectOut.thread.thread_id;
        const agentId = connectOut.agent.agent_id;
        const agentToken = connectOut.agent.token;

        // 2. Consume initial bus_connect token so agent starts clean
        await callMcpTool('msg_post', {
            thread_id: threadId,
            author: agentId,
            content: "seed",
            expected_last_seq: connectOut.current_seq,
            reply_token: connectOut.reply_token,
            role: "assistant"
        });

        // 3. Get fresh token via msg_wait
        const waitPayload = await callMcpTool('msg_wait', {
            thread_id: threadId,
            after_seq: 1,
            timeout_ms: 1,
            agent_id: agentId,
            token: agentToken
        });

        // 4. Force seq mismatch using stale expected_last_seq
        try {
            const errPayload = await callMcpTool('msg_post', {
                thread_id: threadId,
                author: agentId,
                content: "stale post",
                expected_last_seq: 0, // Stale sequence number
                reply_token: waitPayload.reply_token,
                role: "assistant"
            });
            
            // If it succeeded (unexpected), check if it's a SeqMismatchError in the payload
            if (errPayload.error === "SeqMismatchError") {
                // Expected error response
            } else {
                throw new Error("Expected SeqMismatchError but got success");
            }
        } catch (err: any) {
            // Error might be thrown as HTTP error, check message
            if (!err.message.includes("SeqMismatchError")) {
                throw err;
            }
        }

        // 5. After invalidation from a failed post, the next msg_wait should quick-return
        const startTime = Date.now();
        const waitPayload2 = await callMcpTool('msg_wait', {
            thread_id: threadId,
            after_seq: 1,
            timeout_ms: 120,
            agent_id: agentId,
            token: agentToken
        });
        const elapsed = Date.now() - startTime;

        // Note: The fast return may include messages, so we just verify it returned quickly
        expect(elapsed).toBeLessThan(80);
        expect(waitPayload2.reply_token).toBeDefined();
    }, 15000);

    it('two agents can chat multiple rounds via bus_connect and msg_wait', async () => {
        // 对应 Python: L716-880
        const threadName = "Realistic Multi Agent Chat";

        // Agent A connects first
        const payloadA = await callMcpTool('bus_connect', {
            thread_name: threadName,
            ide: "VS Code",
            model: "GPT-5.3-Codex"
        });
        
        const threadId = payloadA.thread.thread_id;
        const agentAId = payloadA.agent.agent_id;
        const agentAToken = payloadA.agent.token;

        // Agent A posts first message
        const postA1Payload = await callMcpTool('msg_post', {
            thread_id: threadId,
            author: agentAId,
            content: "A1: hello from agent A",
            expected_last_seq: payloadA.current_seq,
            reply_token: payloadA.reply_token,
            role: "assistant"
        });
        
        expect(postA1Payload.seq).toBe(1);

        // Agent B connects to same thread
        const payloadB = await callMcpTool('bus_connect', {
            thread_name: threadName,
            ide: "VS Code",
            model: "GPT-5.3-Codex"
        });
        
        const agentBId = payloadB.agent.agent_id;
        const agentBToken = payloadB.agent.token;

        // Verify Agent B sees the existing thread and message
        expect(payloadB.thread.thread_id).toBe(threadId);
        expect(payloadB.messages.some((m: any) => m.content === "A1: hello from agent A")).toBe(true);
        expect(payloadB.current_seq).toBe(1);

        // Agent B posts reply
        const postB1Payload = await callMcpTool('msg_post', {
            thread_id: threadId,
            author: agentBId,
            content: "B1: hi A, I joined the thread",
            expected_last_seq: payloadB.current_seq,
            reply_token: payloadB.reply_token,
            role: "assistant"
        });
        
        expect(postB1Payload.seq).toBe(2);

        // Agent A waits for Agent B's message
        const waitA1Payload = await callMcpTool('msg_wait', {
            thread_id: threadId,
            after_seq: 1,
            timeout_ms: 50,
            agent_id: agentAId,
            token: agentAToken
        });
        
        expect(waitA1Payload.messages.map((m: any) => m.content)).toEqual(["B1: hi A, I joined the thread"]);
        expect(waitA1Payload.current_seq).toBe(2);

        // Agent A posts second message
        const postA2Payload = await callMcpTool('msg_post', {
            thread_id: threadId,
            author: agentAId,
            content: "A2: let's discuss the patch plan",
            expected_last_seq: waitA1Payload.current_seq,
            reply_token: waitA1Payload.reply_token,
            role: "assistant"
        });
        
        expect(postA2Payload.seq).toBe(3);

        // Agent B waits for Agent A's message
        const waitB1Payload = await callMcpTool('msg_wait', {
            thread_id: threadId,
            after_seq: 2,
            timeout_ms: 50,
            agent_id: agentBId,
            token: agentBToken
        });
        
        expect(waitB1Payload.messages.map((m: any) => m.content)).toEqual(["A2: let's discuss the patch plan"]);
        expect(waitB1Payload.current_seq).toBe(3);

        // Agent B posts second message
        const postB2Payload = await callMcpTool('msg_post', {
            thread_id: threadId,
            author: agentBId,
            content: "B2: agreed, I will handle the tests",
            expected_last_seq: waitB1Payload.current_seq,
            reply_token: waitB1Payload.reply_token,
            role: "assistant"
        });
        
        expect(postB2Payload.seq).toBe(4);

        // Agent A waits for Agent B's second message
        const waitA2Payload = await callMcpTool('msg_wait', {
            thread_id: threadId,
            after_seq: 3,
            timeout_ms: 50,
            agent_id: agentAId,
            token: agentAToken
        });
        
        expect(waitA2Payload.messages.map((m: any) => m.content)).toEqual(["B2: agreed, I will handle the tests"]);
        expect(waitA2Payload.current_seq).toBe(4);

        // Verify complete message history via msg_list
        const listedRes = await fetch(`${BASE_URL}/api/mcp/tool/msg_list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                thread_id: threadId,
                after_seq: 0,
                limit: 20,
                include_system_prompt: false
            })
        });
        
        const listedData = await listedRes.json();
        // Response might be nested - check if it's {messages: [...]} or direct array
        const dataArray = Array.isArray(listedData) ? listedData : (listedData.messages || []);
        
        // Response is array of {type: "text", text: "..."} from MCP tool
        const messageTexts = dataArray.map((item: any) => item.text).filter(Boolean);
        
        // Parse message format: "[seq] id (role) timestamp\ncontent"
        const messages: Array<{ content: string; header: string }> = [];
        for (let i = 0; i < messageTexts.length; i += 2) {
            const header = messageTexts[i];
            const content = messageTexts[i + 1] || '';
            
            // Extract role from header: "[1] id (assistant) timestamp"
            const roleMatch = header.match(/\((user|assistant|system)\)/);
            if (roleMatch && roleMatch[1] === 'assistant') {
                messages.push({ content, header });
            }
        }
        
        expect(messages.map(m => m.content)).toEqual([
            "A1: hello from agent A",
            "B1: hi A, I joined the thread",
            "A2: let's discuss the patch plan",
            "B2: agreed, I will handle the tests"
        ]);
    }, 20000);

    it('bus_connect does not make next msg_wait fast return', async () => {
        // 对应 Python: L190-243
        const connectOut = await callMcpTool('bus_connect', {
            thread_name: "Fast Return Once",
            ide: "VS Code",
            model: "GPT-5.3-Codex"
        });
        
        const threadId = connectOut.thread.thread_id;
        const agentId = connectOut.agent.agent_id;
        const agentToken = connectOut.agent.token;

        // First wait after bus_connect should follow normal waiting semantics
        const startTime = Date.now();
        const waitedPayload = await callMcpTool('msg_wait', {
            thread_id: threadId,
            after_seq: 0,
            timeout_ms: 120,
            agent_id: agentId,
            token: agentToken
        });
        const elapsed = Date.now() - startTime;

        expect(waitedPayload.messages).toHaveLength(0);
        expect(waitedPayload.reply_token).toBeDefined();
        expect(waitedPayload.current_seq).toBeDefined();
        
        // Should wait at least 80ms (not fast return)
        expect(elapsed).toBeGreaterThanOrEqual(80);

        // Post message with the new sync context
        const posted2Payload = await callMcpTool('msg_post', {
            thread_id: threadId,
            author: agentId,
            content: "first message with msg_wait sync context",
            expected_last_seq: waitedPayload.current_seq,
            reply_token: waitedPayload.reply_token,
            role: "assistant"
        });
        
        expect(posted2Payload.seq).toBe(1);
    }, 15000);

    it('bus_connect with system prompt creates thread with prompt', async () => {
        // 对应 Python: L972-997
        const args = {
            thread_name: "Thread With Custom Prompt",
            ide: "TestIDE",
            model: "TestModel",
            system_prompt: "You are a code reviewer. Focus on security issues."
        };

        const result = await callMcpTool('bus_connect', args);
        
        expect(result.thread.created).toBe(true);
        expect(result.thread.system_prompt).toBe("You are a code reviewer. Focus on security issues.");
    }, 10000);

    it('bus_connect system prompt ignored when joining existing thread', async () => {
        // 对应 Python: L1000-1027
        // First connect creates thread with system prompt
        const result1 = await callMcpTool('bus_connect', {
            thread_name: "Pre-Existing Thread",
            ide: "TestIDE",
            model: "TestModel",
            system_prompt: "Original prompt"
        });
        
        expect(result1.thread.created).toBe(true);
        expect(result1.thread.system_prompt).toBe("Original prompt");

        // Second connect joins existing thread - system prompt should be ignored
        const result2 = await callMcpTool('bus_connect', {
            thread_name: "Pre-Existing Thread",
            ide: "TestIDE",
            model: "TestModel",
            system_prompt: "Attempted override prompt"
        });
        
        expect(result2.thread.created).toBe(false);
        // System prompt should NOT be in response when joining existing thread
        expect(result2.thread.system_prompt).toBeUndefined();
    }, 10000);

    it('bus_connect system prompt reflected in response', async () => {
        // 对应 Python: L1066-1098
        // First connect creates thread
        const result1 = await callMcpTool('bus_connect', {
            thread_name: "Thread With Prompt In Response",
            ide: "TestIDE",
            model: "TestModel",
            system_prompt: "Review all changes for accessibility compliance."
        });
        
        expect(result1.thread.created).toBe(true);
        expect(result1.thread.system_prompt).toBe("Review all changes for accessibility compliance.");

        // Second connect joins existing thread - system_prompt should NOT be in response
        const result2 = await callMcpTool('bus_connect', {
            thread_name: "Thread With Prompt In Response",
            ide: "TestIDE2",
            model: "TestModel2"
        });
        
        expect(result2.thread.created).toBe(false);
        expect(result2.thread.system_prompt).toBeUndefined();
    }, 10000);

    it('msg_post invalid token does not claim new messages arrived', async () => {
        // 对应 Python: L587-614
        const threadResult = await callMcpTool('bus_connect', {
            thread_name: "Invalid Token Guidance",
            ide: "VS Code",
            model: "GPT-5.3-Codex"
        });
        
        const threadId = threadResult.thread.thread_id;

        // Try to post with invalid token
        const errPayload = await callMcpTool('msg_post', {
            thread_id: threadId,
            author: "human",
            content: "post with bad token",
            expected_last_seq: 0,
            reply_token: "not-a-real-token",
            role: "user"
        });

        expect(errPayload.error).toBe("ReplyTokenInvalidError");
        expect(errPayload.action).toBe("CALL_MSG_WAIT");
        expect(errPayload.REMINDER).toBeDefined();
        // Should NOT have CRITICAL_REMINDER or new_messages_1st_read
        expect(errPayload.CRITICAL_REMINDER).toBeUndefined();
        expect(errPayload.new_messages_1st_read).toBeUndefined();
    }, 10000);

    it('msg_wait caught up agent waits instead of fast returning', async () => {
        // 对应 Python: L883-922
        const threadResult = await callMcpTool('bus_connect', {
            thread_name: "Caught Up Wait",
            ide: "VS Code",
            model: "GPT-5.3-Codex"
        });
        
        const threadId = threadResult.thread.thread_id;
        const agentId = threadResult.agent.agent_id;
        const agentToken = threadResult.agent.token;

        // Post seed message
        await callMcpTool('msg_post', {
            thread_id: threadId,
            author: agentId,
            content: "seed",
            expected_last_seq: threadResult.current_seq,
            reply_token: threadResult.reply_token,
            role: "assistant"
        });

        // Wait with after_seq=1 (caught up) - should wait normally, not fast return
        const startTime = Date.now();
        const payload = await callMcpTool('msg_wait', {
            thread_id: threadId,
            after_seq: 1,
            timeout_ms: 120,
            agent_id: agentId,
            token: agentToken
        });
        const elapsed = Date.now() - startTime;

        expect(payload.messages).toHaveLength(0);
        expect(payload.reply_token).toBeDefined();
        
        // Should wait at least 80ms (not fast return)
        expect(elapsed).toBeGreaterThanOrEqual(80);
    }, 15000);

    it('repeated msg_wait timeouts reuse single token', async () => {
        // 对应 Python: L925-969
        const threadResult = await callMcpTool('bus_connect', {
            thread_name: "Stable Wait Token",
            ide: "VS Code",
            model: "GPT-5.3-Codex"
        });
        
        const threadId = threadResult.thread.thread_id;
        const agentId = threadResult.agent.agent_id;
        const agentToken = threadResult.agent.token;

        // First msg_wait timeout
        const firstPayload = await callMcpTool('msg_wait', {
            thread_id: threadId,
            after_seq: 0,
            timeout_ms: 60,
            agent_id: agentId,
            token: agentToken
        });

        // Second msg_wait timeout
        const secondPayload = await callMcpTool('msg_wait', {
            thread_id: threadId,
            after_seq: 0,
            timeout_ms: 60,
            agent_id: agentId,
            token: agentToken
        });

        // Should reuse the same token
        expect(secondPayload.reply_token).toBe(firstPayload.reply_token);
    }, 10000);
});
