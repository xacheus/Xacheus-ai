/**
 * Conversation state machine for browser voice sessions.
 *
 * This is the piece of the real-time architecture that runs today: it models
 * the same states a telephony media bridge would use, so the reducer can later
 * be reused behind a websocket without behavioural drift.
 *
 * States:
 *   idle -> listening -> transcribing -> thinking -> speaking -> listening ...
 * Barge-in: SPEECH_STARTED while `speaking` immediately stops playback and
 * returns to `listening`. Timeouts move the session to `error` with a
 * recoverable flag.
 */

export type VoiceState = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error';

export type VoiceEvent =
  | { type: 'START_RECORDING' }
  | { type: 'STOP_RECORDING' }
  | { type: 'TRANSCRIBE_START' }
  | { type: 'TRANSCRIPTION_READY'; text: string }
  | { type: 'REQUEST_START' }
  | { type: 'TRANSCRIPT_READY'; text: string }
  | { type: 'TRANSCRIBE_FAILED'; message: string }
  | { type: 'REPLY_READY'; text: string }
  | { type: 'LLM_FAILED'; message: string }
  | { type: 'SPEECH_STARTED' }
  | { type: 'SPEECH_ENDED' }
  | { type: 'BARGE_IN' }
  | { type: 'TIMEOUT'; stage: 'transcribing' | 'thinking' }
  | { type: 'RESET' }
  | { type: 'TERMINATE' };

export interface VoiceSession {
  state: VoiceState;
  lastTranscript: string;
  lastReply: string;
  error: string | null;
  /** True when the caller interrupted the agent while it was speaking. */
  interrupted: boolean;
  terminated: boolean;
  turnCount: number;
}

export const initialSession: VoiceSession = {
  state: 'idle',
  lastTranscript: '',
  lastReply: '',
  error: null,
  interrupted: false,
  terminated: false,
  turnCount: 0,
};

export function reduceSession(session: VoiceSession, event: VoiceEvent): VoiceSession {
  if (session.terminated && event.type !== 'RESET') return session;

  switch (event.type) {
    case 'START_RECORDING':
      if (session.state === 'listening') return session;
      return { ...session, state: 'listening', error: null, interrupted: false };

    case 'STOP_RECORDING':
      if (session.state !== 'listening') return session;
      return { ...session, state: 'transcribing', error: null };

    case 'TRANSCRIBE_START':
      return { ...session, state: 'transcribing', error: null, interrupted: false };

    case 'TRANSCRIPTION_READY':
      return { ...session, state: 'idle', lastTranscript: event.text, error: null };

    case 'REQUEST_START':
      return { ...session, state: 'thinking', error: null, interrupted: false };

    case 'TRANSCRIPT_READY':
      return {
        ...session,
        state: 'thinking',
        lastTranscript: event.text,
        error: null,
        interrupted: false,
      };

    case 'TRANSCRIBE_FAILED':
      return { ...session, state: 'error', error: event.message };

    case 'REPLY_READY':
      return {
        ...session,
        state: 'speaking',
        lastReply: event.text,
        error: null,
        turnCount: session.turnCount + 1,
      };

    case 'LLM_FAILED':
      return { ...session, state: 'error', error: event.message };

    case 'SPEECH_STARTED':
      return session.state === 'speaking' ? session : { ...session, state: 'speaking' };

    case 'SPEECH_ENDED':
      if (session.state === 'error') return session;
      return { ...session, state: 'idle' };

    case 'BARGE_IN':
      if (session.state !== 'speaking') return session;
      return { ...session, state: 'listening', interrupted: true, lastReply: '' };

    case 'TIMEOUT':
      return {
        ...session,
        state: 'error',
        error:
          event.stage === 'transcribing'
            ? 'Transcription took too long. Check your connection and try again.'
            : 'The assistant took too long to respond. Try again.',
      };

    case 'RESET':
      return { ...initialSession };

    case 'TERMINATE':
      return { ...session, state: 'idle', terminated: true, interrupted: false };

    default:
      return session;
  }
}

export const VOICE_TIMEOUTS = {
  transcribeMs: 90_000,
  replyMs: 30_000,
  maxSessionTurns: 40,
} as const;

/** Whether the UI should let the caller start a new recording. */
export function canRecord(session: VoiceSession): boolean {
  return !session.terminated && session.turnCount < VOICE_TIMEOUTS.maxSessionTurns &&
    (session.state === 'idle' || session.state === 'listening' || session.state === 'error' || session.state === 'speaking');
}
