import { NextResponse } from 'next/server';
import { ApiError, apiErrors, errorResponse, newRequestId } from '@/lib/api/errors';
import { authenticateRequest } from '@/lib/api/auth';
import { enforceRateLimit } from '@/lib/api/rate-limit';
import { checkQuota, recordUsage } from '@/lib/api/usage';
import { chatRequestSchema, parseJson } from '@/lib/api/validation';
import { generateChatCompletion, groqConfigured } from '@/lib/groq/client';
import { buildChatMessages, sanitiseSpokenReply } from '@/lib/ai/prompt';
import { estimateChatCostUsd } from '@/lib/pricing';
import { fetchOwnedAgent, fetchOwnedWorkspace } from '@/lib/server/repository';
import { serverEnv } from '@/lib/env';
import { logServerError } from '@/lib/server/errors-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Test-conversation endpoint: text in, AI reply out.
 * This is a browser/API conversation, NOT a telephone call.
 */
export async function POST(request: Request) {
  const requestId = newRequestId();
  let uid: string | undefined;

  try {
    const user = await authenticateRequest(request);
    uid = user.uid;
    enforceRateLimit(`chat:${user.uid}`, serverEnv.rateLimitChatPerHour);

    if (!groqConfigured()) {
      throw apiErrors.providerNotConfigured(
        'AI responses are not enabled on this deployment.',
        'Set GROQ_API_KEY in Vercel Project Settings → Environment Variables, then redeploy (or restart locally).',
      );
    }

    const body = await parseJson(request, chatRequestSchema);
    const agent = await fetchOwnedAgent(user.uid, body.agentId);
    if (agent.status !== 'active') {
      throw apiErrors.badRequest('This agent is deactivated. Activate it before testing conversations.');
    }

    const workspace = await fetchOwnedWorkspace(user.uid);
    await checkQuota(user.uid, 'chat', 1);

    const result = await generateChatCompletion({
      messages: buildChatMessages(agent, workspace, body.history, body.message),
      temperature: 0.4,
      maxTokens: 350,
      timeoutMs: 30_000,
    });

    const reply = sanitiseSpokenReply(result.content);
    const cost = estimateChatCostUsd(result.model, result.promptTokens, result.completionTokens);

    await recordUsage(user.uid, {
      chatRequests: 1,
      chatTokens: result.totalTokens,
      estimatedCostUsd: cost,
    });

    return NextResponse.json(
      {
        reply,
        model: result.model,
        agent: { id: agent.id, name: agent.name },
        usage: {
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          totalTokens: result.totalTokens,
          estimatedCostUsd: cost,
        },
        mode: 'text-test',
        notice: 'This is a text test conversation. It does not place a telephone call.',
        requestId,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status >= 500) {
      await logServerError({
        scope: 'chat',
        error,
        requestId,
        uid,
        status: error.status,
        code: error.code,
      });
    }
    return errorResponse(error, requestId);
  }
}
