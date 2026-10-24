import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canRecord,
  initialSession,
  reduceSession,
  VOICE_TIMEOUTS,
  type VoiceSession,
} from '../src/lib/voice/conversation';

function run(events: Parameters<typeof reduceSession>[1][]): VoiceSession {
  return events.reduce<VoiceSession>((session, event) => reduceSession(session, event), initialSession);
}

test('full turn: listening -> transcribing -> thinking -> speaking', () => {
  const session = run([
    { type: 'START_RECORDING' },
    { type: 'STOP_RECORDING' },
    { type: 'TRANSCRIBE_START' },
    { type: 'TRANSCRIPTION_READY', text: 'hello' },
    { type: 'REQUEST_START' },
    { type: 'REPLY_READY', text: 'hi there' },
  ]);
  assert.equal(session.state, 'speaking');
  assert.equal(session.lastTranscript, 'hello');
  assert.equal(session.lastReply, 'hi there');
  assert.equal(session.turnCount, 1);
});

test('barge-in stops playback and interrupts only while speaking', () => {
  const speaking = run([
    { type: 'REQUEST_START' },
    { type: 'REPLY_READY', text: 'long answer' },
  ]);
  const interrupted = reduceSession(speaking, { type: 'BARGE_IN' });
  assert.equal(interrupted.state, 'listening');
  assert.equal(interrupted.interrupted, true);
  assert.equal(interrupted.lastReply, '');

  const idle = reduceSession(initialSession, { type: 'BARGE_IN' });
  assert.equal(idle.state, 'idle');
  assert.equal(idle.interrupted, false);
});

test('stop recording is ignored unless actually listening', () => {
  assert.equal(reduceSession(initialSession, { type: 'STOP_RECORDING' }).state, 'idle');
});

test('timeouts surface a recoverable error with a useful message', () => {
  const transcribeTimeout = reduceSession(
    { ...initialSession, state: 'transcribing' },
    { type: 'TIMEOUT', stage: 'transcribing' },
  );
  assert.equal(transcribeTimeout.state, 'error');
  assert.match(transcribeTimeout.error || '', /Transcription took too long/);

  const replyTimeout = reduceSession({ ...initialSession, state: 'thinking' }, { type: 'TIMEOUT', stage: 'thinking' });
  assert.equal(replyTimeout.state, 'error');
  assert.match(replyTimeout.error || '', /assistant took too long/);
});

test('terminated sessions ignore further events until reset', () => {
  const terminated = reduceSession(initialSession, { type: 'TERMINATE' });
  assert.equal(terminated.terminated, true);
  assert.equal(canRecord(terminated), false);
  assert.equal(reduceSession(terminated, { type: 'START_RECORDING' }).state, 'idle');

  const reset = reduceSession(terminated, { type: 'RESET' });
  assert.equal(reset.terminated, false);
  assert.equal(reset.state, 'idle');
  assert.equal(canRecord(reset), true);
});

test('turn limit prevents unbounded sessions', () => {
  const exhausted: VoiceSession = {
    ...initialSession,
    turnCount: VOICE_TIMEOUTS.maxSessionTurns,
    state: 'idle',
  };
  assert.equal(canRecord(exhausted), false);
});

test('speech end returns to idle and clears speaking state', () => {
  const speaking = reduceSession(initialSession, { type: 'SPEECH_STARTED' });
  assert.equal(speaking.state, 'speaking');
  assert.equal(reduceSession(speaking, { type: 'SPEECH_ENDED' }).state, 'idle');
});
