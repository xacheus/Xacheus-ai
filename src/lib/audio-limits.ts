/**
 * Public upload limits shared by the browser and API validation.
 * Vercel Functions accept at most 4.5 MB per request. Keep audio at 4 MB to
 * leave room for multipart headers and the other form fields. Larger files
 * would need a separate direct-to-storage upload flow, not a higher body limit.
 * This module must not import the server-only Groq client or environment.
 */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const AUDIO_SIZE_LABEL = '4 MB';
