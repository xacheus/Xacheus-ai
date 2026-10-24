import { AUDIO_SIZE_LABEL } from '@/lib/audio-limits';
import { AUDIO_LIMITS } from '@/lib/groq/client';

export interface AudioFileLike {
  name: string;
  size: number;
  type: string;
}

export type AudioValidationResult =
  | { ok: true; extension: string }
  | {
      ok: false;
      status: 400 | 413 | 415;
      code: 'bad_request' | 'payload_too_large' | 'unsupported_media_type';
      message: string;
    };

const ALLOWED_MIME = new Set(AUDIO_LIMITS.allowedMimeTypes);
const ALLOWED_EXTENSIONS = new Set(AUDIO_LIMITS.allowedExtensions);

export function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index).toLowerCase() : '';
}

/**
 * Validate an uploaded audio file before it is buffered or sent to a provider.
 * Accepts a file when either its MIME type or extension is recognised, because
 * browsers are inconsistent about MIME types for recorded audio.
 */
export function validateAudioFile(file: AudioFileLike): AudioValidationResult {
  if (file.size === 0) {
    return { ok: false, status: 400, code: 'bad_request', message: 'The uploaded file is empty.' };
  }
  if (file.size < AUDIO_LIMITS.minBytes) {
    return { ok: false, status: 400, code: 'bad_request', message: 'That file is too small to contain audio.' };
  }
  if (file.size > AUDIO_LIMITS.maxBytes) {
    return {
      ok: false,
      status: 413,
      code: 'payload_too_large',
      message: `Audio files must be no larger than ${AUDIO_SIZE_LABEL}.`,
    };
  }

  const mime = (file.type || '').toLowerCase();
  const extension = extensionOf(file.name || '');
  const mimeAllowed = mime ? ALLOWED_MIME.has(mime) : false;
  const extensionAllowed = ALLOWED_EXTENSIONS.has(extension);

  if (!mimeAllowed && !extensionAllowed) {
    return {
      ok: false,
      status: 415,
      code: 'unsupported_media_type',
      message: 'Unsupported audio format. Use MP3, WAV, M4A, WEBM, OGG or FLAC.',
    };
  }

  return { ok: true, extension: extensionAllowed ? extension : '.webm' };
}
