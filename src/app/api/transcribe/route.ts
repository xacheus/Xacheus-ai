import { NextResponse } from 'next/server';
import { AUDIO_SIZE_LABEL } from '@/lib/audio-limits';
import { ApiError, apiErrors, errorResponse, newRequestId } from '@/lib/api/errors';
import { authenticateRequest } from '@/lib/api/auth';
import { enforceRateLimit } from '@/lib/api/rate-limit';
import { checkQuota, recordUsage } from '@/lib/api/usage';
import { AUDIO_LIMITS, groqConfigured, transcribeAudio } from '@/lib/groq/client';
import { validateAudioFile } from '@/lib/api/audio-validation';
import { estimateTranscriptionCostUsd } from '@/lib/pricing';
import { serverEnv } from '@/lib/env';
import { logServerError } from '@/lib/server/errors-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request) {
  const requestId = newRequestId();
  let uid: string | undefined;

  try {
    // Authenticate before revealing provider configuration.
    const user = await authenticateRequest(request);
    uid = user.uid;
    enforceRateLimit(`transcribe:${user.uid}`, serverEnv.rateLimitTranscribePerHour);

    if (!groqConfigured()) {
      throw apiErrors.providerNotConfigured(
        'Speech-to-text is not enabled on this deployment.',
        'Set GROQ_API_KEY in Vercel Project Settings → Environment Variables, then redeploy (or restart locally).',
      );
    }

    // Reject obviously oversized bodies before buffering them.
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > AUDIO_LIMITS.maxBytes + 1024 * 512) {
      throw new ApiError(413, 'payload_too_large', `Audio files must be no larger than ${AUDIO_SIZE_LABEL}.`);
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw apiErrors.badRequest('Upload an audio file using multipart form data.');
    }

    const file = form.get('file');
    if (!(file instanceof File)) throw apiErrors.badRequest('No audio file was uploaded.');

    const mime = (file.type || 'application/octet-stream').toLowerCase();
    const validation = validateAudioFile({ name: file.name || '', size: file.size, type: mime });
    if (!validation.ok) {
      throw new ApiError(validation.status, validation.code, validation.message, {
        details: { receivedType: mime || 'unknown', sizeBytes: file.size },
      });
    }

    // Do not trust the client filename: rebuild a safe one.
    const filename = `audio-${Date.now()}${validation.extension}`;

    const languageRaw = String(form.get('language') || '').trim();
    const language = /^[a-z]{2}(-[A-Za-z]{2})?$/.test(languageRaw) ? languageRaw : undefined;

    await checkQuota(user.uid, 'transcription', 1);

    const data = await file.arrayBuffer();
    const result = await transcribeAudio({
      data,
      mimeType: mime === 'application/octet-stream' ? 'audio/webm' : mime,
      filename,
      language,
    });

    // Bill actual audio duration; fall back to one second when the provider
    // omits a duration so usage still records a request.
    const chargedSeconds = Math.max(1, Math.round(result.durationSeconds || 0));
    const cost = estimateTranscriptionCostUsd(result.model, chargedSeconds);

    await recordUsage(user.uid, {
      transcriptionSeconds: chargedSeconds,
      transcriptionCount: 1,
      estimatedCostUsd: cost,
    });

    return NextResponse.json(
      {
        text: result.text,
        language: result.language,
        durationSeconds: result.durationSeconds,
        model: result.model,
        empty: result.text.length === 0,
        usage: { chargedSeconds, estimatedCostUsd: cost },
        requestId,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status >= 500) {
      await logServerError({
        scope: 'transcribe',
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

export async function GET() {
  return NextResponse.json(
    {
      error: {
        code: 'method_not_allowed',
        message: 'Use POST with multipart form data containing a `file` field.',
      },
    },
    { status: 405 },
  );
}
