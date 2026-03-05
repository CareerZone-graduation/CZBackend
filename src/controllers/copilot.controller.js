import asyncHandler from 'express-async-handler';
import config from '../config/index.js';
import { CopilotSession } from '../models/CopilotSession.js';
import * as copilotService from '../services/copilot.service.js';

/**
 * Handle POST /api/copilot/chat
 * Streams the response from FastAPI directly to the client via SSE
 */
export const chat = asyncHandler(async (req, res) => {
    const { message, sessionId, context } = req.body;
    const user = req.user;

    // 1. Enrich context & Session Management
    const userContext = {
        userId: user._id.toString(),
        role: user.role,
    };

    let session;
    if (sessionId) {
        session = await CopilotSession.findById(sessionId);
    }
    if (!session) {
        session = new CopilotSession({
            userId: user._id,
            title: message.length > 50 ? message.substring(0, 50) + '...' : message,
            messages: [],
            isActive: true
        });
    }

    // Append user message to DB
    session.messages.push({
        role: 'user',
        content: message,
        timestamp: new Date()
    });

    // Prepare initial payload
    let currentMessages = session.messages.map(m => {
        const msg = { role: m.role };
        if (m.content) msg.content = m.content;

        if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
            msg.tool_calls = m.toolCalls.map(tc => ({
                id: tc.id,
                type: "function",
                function: { name: tc.functionName, arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || {}) }
            }));
        }

        if (m.role === 'tool' && m.toolCalls && m.toolCalls[0]) {
            msg.tool_call_id = m.toolCalls[0].id;
            msg.content = typeof m.toolCalls[0].result === 'string' ? m.toolCalls[0].result : JSON.stringify(m.toolCalls[0].result || {});
            // Do not send tool_calls on a tool message
        }
        return msg;
    });

    const pythonServiceUrl = `${config.PYTHON_SERVICE_URL}/api/v1/copilot/invoke`;
    const internalSecret = process.env.INTERNAL_API_SECRET || 'careerzone_internal_secret_2024';

    // 2. Setup Server-Sent Events (SSE) stream headers ONCE
    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });

    // Send session ID immediately
    res.write(`event: session\ndata: ${JSON.stringify({ sessionId: session._id })}\n\n`);

    try {
        let isFinalAnswer = false;
        let loopCount = 0;
        const MAX_LOOPS = 5;
        let pendingJobCards = [];
        let pendingTotalCount = 0;
        let pendingInterviews = [];

        // Agent Loop
        while (!isFinalAnswer && loopCount < MAX_LOOPS) {
            loopCount++;

            const payload = {
                messages: currentMessages,
                stream: true,
                user_context: userContext,
                session_id: session._id.toString(),
                ui_context: context || {}
            };

            const response = await fetch(pythonServiceUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Internal-Secret': internalSecret
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`FastAPI error: ${response.status} - ${errorText}`);
                res.write(`event: error\ndata: ${JSON.stringify({ code: 'INTERNAL_ERROR', message: 'Lỗi Call AI Service' })}\n\n`);
                return res.end();
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            let currentAssistantMessage = "";
            let currentToolCalls = []; // Accumulate tool calls in this iteration

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');
                buffer = lines.pop();

                for (const block of lines) {
                    if (!block.trim()) continue;

                    if (block.startsWith('event: tool_call')) {
                        const dataMatch = block.match(/data: (.*)/);
                        if (dataMatch) {
                            try {
                                const tc = JSON.parse(dataMatch[1]);
                                currentToolCalls.push(tc);
                                // Don't emit tool_progress here — emit right before execution
                            } catch (err) {
                                console.error('Error parsing tool_call:', err);
                            }
                        }
                    } else if (block.startsWith('event: text_delta')) {
                        const dataMatch = block.match(/data: (.*)/);
                        if (dataMatch) {
                            try {
                                const payload = JSON.parse(dataMatch[1]);
                                currentAssistantMessage += payload.delta;
                                // Forward text directly to user
                                res.write(block + '\n\n');
                            } catch (e) { }
                        }
                    } else if (block.startsWith('event: done')) {
                        // Do NOT forward the done event YET if we have internal tools to process
                    } else {
                        // Forward other events (error, etc)
                        res.write(block + '\n\n');
                    }
                }
            }

            if (currentToolCalls.length === 0) {
                // No tools called -> LLM has provided the final text answer
                isFinalAnswer = true;

                // Save assistant text response to DB
                if (currentAssistantMessage) {
                    session.messages.push({
                        role: 'assistant',
                        content: currentAssistantMessage,
                        timestamp: new Date()
                    });
                }

                // Stream the accumulated interview cards with a pleasant delay
                if (pendingInterviews.length > 0) {
                    const accumulatedInterviews = [];
                    for (const iv of pendingInterviews) {
                        accumulatedInterviews.push(iv);
                        res.write(`event: structured_data\ndata: ${JSON.stringify({ type: "interview_schedule", data: { interviews: [...accumulatedInterviews] } })}\n\n`);
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                }

                // Stream the accumulated job cards with a pleasant delay
                if (pendingJobCards.length > 0) {
                    const accumulatedJobs = [];
                    for (const job of pendingJobCards) {
                        accumulatedJobs.push(job);
                        res.write(`event: structured_data\ndata: ${JSON.stringify({ type: "job_cards", data: { jobs: accumulatedJobs, totalCount: pendingTotalCount } })}\n\n`);
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                }

                res.write(`event: done\ndata: {}\n\n`);

            } else {
                // LLM called tools. 
                // 1. Save assistant tool call intention to history
                const assistantHistoryItem = {
                    role: 'assistant',
                    content: currentAssistantMessage || null,
                    toolCalls: currentToolCalls.map(tc => ({
                        id: tc.id,
                        functionName: tc.function,
                        arguments: JSON.parse(tc.arguments || '{}')
                    }))
                };
                session.messages.push(assistantHistoryItem);
                currentMessages.push({
                    role: 'assistant',
                    content: currentAssistantMessage || null,
                    tool_calls: currentToolCalls.map(tc => ({
                        id: tc.id,
                        type: 'function',
                        function: { name: tc.function, arguments: tc.arguments }
                    }))
                });

                // 2. Execute internal tools
                let toolResultsMessages = [];
                for (const tc of currentToolCalls) {
                    // Emit tool_progress right before execution so user sees each tool sequentially
                    res.write(`event: tool_progress\ndata: ${JSON.stringify({ tool: tc.function, status: 'running' })}\n\n`);

                    let resultData = null;
                    const args = JSON.parse(tc.arguments || '{}');

                    try {
                        switch (tc.function) {
                            case 'search_jobs':
                                resultData = await copilotService.hybridSearchJobs(args);
                                if (resultData && resultData.jobs) {
                                    pendingJobCards = resultData.jobs;
                                    pendingTotalCount = resultData.totalCount || resultData.jobs.length;
                                }
                                break;
                            case 'get_job_detail':
                                resultData = await copilotService.get_job_detail(args);
                                break;
                            case 'get_recommendations':
                                resultData = await copilotService.get_recommendations(userContext.userId, args);
                                if (resultData && resultData.data) {
                                    pendingJobCards = resultData.data;
                                    pendingTotalCount = resultData.data.length;
                                }
                                break;
                            case 'get_my_interviews':
                                resultData = await copilotService.getUpcomingInterviews(userContext.userId, userContext.role, args);
                                if (Array.isArray(resultData)) {
                                    pendingInterviews = resultData;
                                    // Strip heavy fields before sending to LLM to reduce noise
                                    resultData = resultData.map(iv => ({
                                        _id: iv._id,
                                        jobTitle: iv.jobId?.title || 'N/A',
                                        candidateEmail: iv.candidateId?.email || 'N/A',
                                        scheduledTime: iv.scheduledTime,
                                        status: iv.status,
                                        duration: iv.duration,
                                        meetingProvider: iv.meetingProvider
                                    }));
                                }
                                break;
                            case 'get_my_applications':
                                resultData = await copilotService.get_my_applications(userContext.userId, args);
                                break;
                            case 'getExpiringJobs':
                                resultData = await copilotService.getExpiringJobs(userContext.userId, args.days);
                                if (resultData && resultData.length > 0) {
                                    pendingJobCards = resultData;
                                    pendingTotalCount = resultData.length;
                                }
                                break;
                            case 'getSavedJobsExpiringSoon':
                                resultData = await copilotService.getSavedJobsExpiringSoon(userContext.userId, args.days);
                                if (resultData && resultData.length > 0) {
                                    pendingJobCards = resultData;
                                    pendingTotalCount = resultData.length;
                                }
                                break;
                            case 'search_knowledge_base':
                                resultData = await copilotService.search_knowledge_base(args);
                                break;
                            default:
                                resultData = { error: `Tool ${tc.function} not implemented.` };
                        }
                    } catch (err) {
                        console.error(`Error executing tool ${tc.function}:`, err);
                        resultData = { error: err.message };
                    }

                    // 3. Tool completed — don't emit 'completed' status.
                    // The 'running' indicator stays visible until LLM text starts streaming,
                    // which provides a seamless transition for the user.

                    // 4. Save tool result to DB and history array for next loop
                    session.messages.push({
                        role: 'tool',
                        toolCalls: [{ id: tc.id, result: resultData }]
                    });

                    let promptModifier = "";
                    const jobTools = ['search_jobs', 'getExpiringJobs', 'getSavedJobsExpiringSoon', 'get_recommendations'];
                    const interviewTools = ['get_my_interviews'];

                    if (jobTools.includes(tc.function) || interviewTools.includes(tc.function)) {
                        promptModifier = "\n\n[SYSTEM INSTRUCTION: Bạn đã lấy dữ liệu thành công, và DỮ LIỆU NÀY SẼ ĐƯỢC FRONTEND TỰ ĐỘNG VẼ THÀNH UI CARDS. Do đó, bạn CHỈ CẦN trả lời BẰNG MỘT CÂU NGẮN GỌN (Ví dụ: 'Dưới đây là danh sách các công việc phù hợp với yêu cầu, Dưới đây là danh sách lịch phỏng vấn thỏa mãn tiêu chí của bạn,...'). TUYỆT ĐỐI KHÔNG sinh ra bảng (markdown table) hoặc liệt kê lại các công việc này bằng chữ dưới bất kỳ hình thức nào.]";
                    }

                    toolResultsMessages.push({
                        role: 'tool',
                        tool_call_id: tc.id,
                        content: JSON.stringify(resultData) + promptModifier
                    });
                }

                // Append tool results and loop to let LLM generate text
                currentMessages.push(...toolResultsMessages);
                console.log("currentMessages", currentMessages);
            }
        } // End of Agent Loop

        // Save session after all loops
        await session.save();
        res.end();

    } catch (error) {
        console.error('Copilot Chat Error:', error);
        res.write(`event: error\ndata: ${JSON.stringify({ code: 'INTERNAL_ERROR', message: 'Internal Server Error' })}\n\n`);
        res.end();
    }
});
