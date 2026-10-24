'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AUDIO_SIZE_LABEL } from '@/lib/audio-limits';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  CircleStop,
  Copy,
  Info,
  Loader2,
  Mic,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { useAgents, type AgentDoc } from '@/lib/client/firestore-data';
import { AudioCapture } from '@/components/voice/audio-capture';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  PageHeader,
  Select,
  Textarea,
  cn,
} from '@/components/ui';
import { ApiClientError, apiFetch, errorMessage } from '@/lib/client/api';
import { initialSession, reduceSession, type VoiceSession } from '@/lib/voice/conversation';

interface TranscriptionResponse {
  text: string;
  language: string | null;
  durationSeconds: number;
  model: string;
  empty: boolean;
  usage: { chargedSeconds: number; estimatedCostUsd: number };
}

interface ChatResponse {
  reply: string;
  model: string;
  usage: { totalTokens: number; estimatedCostUsd: number };
  notice: string;
}

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  at: number;
  source?: 'typed' | 'transcription';
}

const LANGUAGES = [
  ['', 'Auto-detect'],
  ['en-US', 'English (US)'],
  ['en-GB', 'English (UK)'],
  ['fr-FR', 'French'],
  ['pt-BR', 'Portuguese (BR)'],
  ['es-ES', 'Spanish'],
  ['de-DE', 'German'],
  ['ar-SA', 'Arabic'],
  ['hi-IN', 'Hindi'],
  ['sw-KE', 'Swahili'],
  ['zh-CN', 'Chinese'],
];

function VoiceLabInner() {
  const params = useSearchParams();
  const { user, account, refreshAccount } = useAuth();
  const serverMetering = account?.serverMetering === true;
  const { data: agents, loading: agentsLoading, error: agentsError } = useAgents(user?.uid);

  const [agentId, setAgentId] = useState<string>(params.get('agent') || '');
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [language, setLanguage] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [transcriptionMeta, setTranscriptionMeta] = useState<TranscriptionResponse | null>(null);
  const [transcriptionError, setTranscriptionError] = useState<{ message: string; hint?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [session, setSession] = useState<VoiceSession>(initialSession);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<{ message: string; hint?: string } | null>(null);
  const [speakReplies, setSpeakReplies] = useState(true);
  const [speaking, setSpeaking] = useState(false);

  const conversationEndRef = useRef<HTMLDivElement | null>(null);

  const activeAgents = useMemo(() => (agents || []).filter((agent) => agent.status === 'active'), [agents]);
  const selectedAgent: AgentDoc | undefined = useMemo(
    () => activeAgents.find((agent) => agent.id === agentId) || activeAgents[0],
    [activeAgents, agentId],
  );

  useEffect(() => {
    if (!agentId && selectedAgent) setAgentId(selectedAgent.id);
  }, [agentId, selectedAgent]);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [turns.length, sending]);

  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const stopSpeaking = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setSession((current) => reduceSession(current, { type: 'BARGE_IN' }));
  }, []);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, []);

  const speak = useCallback(
    (text: string, agent: AgentDoc) => {
      if (!ttsSupported || !speakReplies || !text.trim()) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = agent.language;
      utterance.rate = Math.min(1.5, Math.max(0.5, agent.speakingRate || 1));
      utterance.pitch = 1;

      const match = synth.getVoices().find((voice) => voice.lang?.replace('_', '-') === agent.language);
      if (match) utterance.voice = match;

      utterance.onstart = () => {
        setSpeaking(true);
        setSession((current) => reduceSession(current, { type: 'SPEECH_STARTED' }));
      };
      utterance.onend = () => {
        setSpeaking(false);
        setSession((current) => reduceSession(current, { type: 'SPEECH_ENDED' }));
      };
      utterance.onerror = () => {
        setSpeaking(false);
        setSession((current) => reduceSession(current, { type: 'SPEECH_ENDED' }));
      };

      synth.speak(utterance);
    },
    [speakReplies, ttsSupported],
  );

  async function transcribe() {
    if (!file) {
      setTranscriptionError({ message: 'Add a recording or choose an audio file first.' });
      return;
    }
    setTranscribing(true);
    setTranscriptionError(null);
    setSession((current) => reduceSession(current, { type: 'TRANSCRIBE_START' }));

    try {
      const form = new FormData();
      form.append('file', file);
      if (language) form.append('language', language);

      const result = await apiFetch<TranscriptionResponse>('/api/transcribe', { method: 'POST', body: form });
      setTranscript(result.text);
      setTranscriptionMeta(result);
      setSession((current) => reduceSession(current, { type: 'TRANSCRIPTION_READY', text: result.text }));
      if (result.empty) {
        setTranscriptionError({
          message: 'No speech was detected in that audio.',
          hint: 'Try a clearer recording, move closer to the microphone, or check the file plays correctly.',
        });
      }
      await accountRefresh();
    } catch (error) {
      const mapped =
        error instanceof ApiClientError
          ? { message: error.message, hint: error.hint }
          : { message: errorMessage(error) };
      setTranscriptionError(mapped);
      setSession((current) =>
        reduceSession(current, { type: 'TRANSCRIBE_FAILED', message: mapped.message }),
      );
    } finally {
      setTranscribing(false);
    }
  }

  async function accountRefresh() {
    await refreshAccount().catch(() => undefined);
  }

  async function copyTranscript() {
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function clearTranscript() {
    setTranscript('');
    setTranscriptionMeta(null);
    setTranscriptionError(null);
    setSession((current) => reduceSession(current, { type: 'RESET' }));
  }

  function retryTranscription() {
    setTranscriptionError(null);
    void transcribe();
  }

  async function sendMessage(text: string, source: Turn['source'] = 'typed') {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!selectedAgent) {
      setChatError({ message: 'Create and activate an agent before starting a test conversation.' });
      return;
    }

    setChatError(null);
    setSending(true);
    setSession((current) => reduceSession(current, { type: 'REQUEST_START' }));
    const userTurn: Turn = { role: 'user', content: trimmed, at: Date.now(), source };
    const history = turns.slice(-18).map((turn) => ({ role: turn.role, content: turn.content }));
    setTurns((current) => [...current, userTurn]);
    setMessage('');

    try {
      const result = await apiFetch<ChatResponse>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ agentId: selectedAgent.id, message: trimmed, history }),
      });
      setTurns((current) => [...current, { role: 'assistant', content: result.reply, at: Date.now() }]);
      setSession((current) => reduceSession(current, { type: 'REPLY_READY', text: result.reply }));
      speak(result.reply, selectedAgent);
      await accountRefresh();
    } catch (error) {
      const mapped =
        error instanceof ApiClientError
          ? { message: error.message, hint: error.hint }
          : { message: errorMessage(error) };
      setChatError(mapped);
      setSession((current) => reduceSession(current, { type: 'LLM_FAILED', message: mapped.message }));
    } finally {
      setSending(false);
    }
  }

  function endSession() {
    stopSpeaking();
    setSession((current) => reduceSession(current, { type: 'TERMINATE' }));
  }

  function resetSession() {
    stopSpeaking();
    setTurns([]);
    setMessage('');
    setChatError(null);
    setSession({ ...initialSession });
  }

  const stateLabel: Record<VoiceSession['state'], string> = {
    idle: session.turnCount > 0 ? 'Ready' : 'Idle',
    listening: 'Listening',
    transcribing: 'Transcribing',
    thinking: 'Thinking',
    speaking: 'Speaking',
    error: 'Needs attention',
  };

  if (!agentsLoading && activeAgents.length === 0) {
    return (
      <div>
        <PageHeader eyebrow="Voice lab" title="Test speech-to-text and agent conversations" />
        <Card>
          <EmptyState
            icon={<Bot className="h-5 w-5" />}
            title="Create an active agent first"
            description="Transcription works on its own, but conversations need an agent whose status is active."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/app/agents/new">
                  <Button>New agent</Button>
                </Link>
                <Link href="/app/agents">
                  <Button variant="secondary">Manage agents</Button>
                </Link>
              </div>
            }
          />
        </Card>
        {agentsError && (
          <Alert tone="error" title="Could not load agents" className="mt-4">
            {agentsError}
          </Alert>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Voice lab"
        title="Speech-to-text and conversation testing"
        description="Everything here runs in your browser. Recordings and transcripts are not telephone calls, and audio is not stored after transcription."
        actions={
          <Link href="/app/agents">
            <Button variant="secondary">Manage agents</Button>
          </Link>
        }
      />

      {!serverMetering && (
        <Alert tone="warning" title="Server metering is unavailable" className="mb-4">
          Usage counters and plan limits cannot be enforced without{' '}
          <code className="rounded bg-amber-100 px-1">FIREBASE_SERVICE_ACCOUNT_KEY</code>. Transcription still requires{' '}
          <code className="rounded bg-amber-100 px-1">GROQ_API_KEY</code>.
        </Alert>
      )}

      <Card className="mb-4">
        <div className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
          <Field label="Agent under test" htmlFor="agent-select" hint="Only active agents can hold a conversation.">
            <Select
              id="agent-select"
              value={selectedAgent?.id || ''}
              onChange={(event) => {
                setAgentId(event.target.value);
                resetSession();
              }}
              disabled={agentsLoading}
            >
              {activeAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} · {agent.language}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-wrap gap-2 text-[12px] text-muted">
            <Badge tone="brand">
              <Sparkles className="h-3 w-3" aria-hidden />
              Browser test only
            </Badge>
            <Badge tone="neutral">Whisper: {account?.capabilities?.groq.whisperModel || 'not configured'}</Badge>
            <Badge tone="neutral">Text: {account?.capabilities?.groq.textModel || 'not configured'}</Badge>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="1 · Audio input"
            description={`Record a clip or upload a supported audio file. Maximum ${AUDIO_SIZE_LABEL}.`}
            action={<Badge tone="neutral"><Mic className="h-3 w-3" aria-hidden />Input</Badge>}
          />
          <div className="card-body">
            <AudioCapture
              file={file}
              onFile={(next) => {
                setFile(next);
                setTranscriptionError(null);
                setTranscriptionMeta(null);
              }}
              disabled={transcribing}
              onError={setUploadError}
            />

            {uploadError && (
              <Alert tone="error" className="mt-4">
                {uploadError}
              </Alert>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="Spoken language" htmlFor="transcription-language" hint="Auto-detect is usually accurate.">
                <Select id="transcription-language" value={language} onChange={(event) => setLanguage(event.target.value)}>
                  {LANGUAGES.map(([value, label]) => (
                    <option key={value || 'auto'} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button onClick={transcribe} loading={transcribing} disabled={!file || transcribing} className="h-[42px]">
                {transcribing ? 'Transcribing…' : 'Transcribe'}
              </Button>
            </div>

            {transcribing && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-[12.5px] text-brand-800">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Uploading to the server and running Whisper. Long clips can take up to a minute.
              </div>
            )}

            {transcriptionError && (
              <Alert tone="error" title={transcriptionError.message} className="mt-4">
                <div className="space-y-2">
                  {transcriptionError.hint && <p>{transcriptionError.hint}</p>}
                  {file && (
                    <Button variant="secondary" small onClick={retryTranscription}>
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                      Retry transcription
                    </Button>
                  )}
                </div>
              </Alert>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="2 · Transcription"
            description="You can edit the text before sending it to the agent."
            action={
              transcript ? (
                <div className="flex gap-1.5">
                  <Button variant="secondary" small onClick={copyTranscript}>
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                  <Button variant="ghost" small onClick={clearTranscript}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Clear
                  </Button>
                </div>
              ) : null
            }
          />
          <div className="card-body">
            {!transcribing && !transcript && !transcriptionMeta && (
              <div className="rounded-xl border border-dashed border-line bg-canvas/60 px-4 py-10 text-center">
                <Volume2 className="mx-auto h-6 w-6 text-ink-500/50" aria-hidden />
                <p className="mt-3 text-sm font-medium text-ink-800">No transcription yet</p>
                <p className="mt-1 text-[12px] text-muted">
                  Add audio, then press Transcribe. Results appear here with duration and provider details.
                </p>
              </div>
            )}

            {transcribing && (
              <div className="space-y-2" aria-live="polite">
                <div className="skeleton h-4 w-11/12" />
                <div className="skeleton h-4 w-9/12" />
                <div className="skeleton h-4 w-10/12" />
                <p className="pt-2 text-xs text-muted">Processing audio…</p>
              </div>
            )}

            {(transcript || transcriptionMeta) && !transcribing && (
              <div aria-live="polite">
                <label htmlFor="transcript-text" className="label">
                  Transcript
                </label>
                <Textarea
                  id="transcript-text"
                  value={transcript}
                  onChange={(event) => setTranscript(event.target.value)}
                  className="min-h-[170px]"
                  placeholder="Transcribed speech appears here."
                />
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted">
                  <span>{transcript.trim().split(/\s+/).filter(Boolean).length} words</span>
                  {transcriptionMeta && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{transcriptionMeta.durationSeconds.toFixed(1)}s audio</span>
                      <span aria-hidden>·</span>
                      <span>{transcriptionMeta.language || 'language unknown'}</span>
                      <span aria-hidden>·</span>
                      <span>{transcriptionMeta.model}</span>
                    </>
                  )}
                  {transcriptionMeta && (
                    <>
                      <span aria-hidden>·</span>
                      <span>charged {transcriptionMeta.usage.chargedSeconds}s</span>
                    </>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    onClick={() => void sendMessage(transcript, 'transcription')}
                    disabled={!transcript.trim() || !selectedAgent || sending}
                  >
                    <Send className="h-4 w-4" aria-hidden />
                    Send to {selectedAgent?.name || 'agent'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setMessage(transcript)}
                    disabled={!transcript.trim()}
                  >
                    Insert into conversation
                  </Button>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted">
                  Audio is not retained: it is buffered in memory, sent to the provider and discarded after the response.
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="3 · Test conversation"
          description="Text in, AI reply out. This is a browser demonstration, not a telephone call."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'badge border',
                  session.state === 'error'
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : session.state === 'speaking'
                      ? 'border-brand-200 bg-brand-50 text-brand-700'
                      : 'border-line bg-canvas text-ink-700',
                )}
              >
                {session.state === 'speaking' && <Volume2 className="h-3 w-3" aria-hidden />}
                {stateLabel[session.state]}
              </span>
              <button
                type="button"
                onClick={() => setSpeakReplies((value) => !value)}
                className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink-800"
                aria-label={speakReplies ? 'Disable spoken replies' : 'Enable spoken replies'}
                title={ttsSupported ? (speakReplies ? 'Spoken replies on' : 'Spoken replies off') : 'Speech synthesis unavailable'}
                disabled={!ttsSupported}
              >
                {speakReplies && ttsSupported ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
              {speaking && (
                <Button variant="secondary" small onClick={stopSpeaking}>
                  <CircleStop className="h-3.5 w-3.5" aria-hidden />
                  Barge in
                </Button>
              )}
              <Button variant="ghost" small onClick={resetSession} disabled={turns.length === 0 && !session.error}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Reset
              </Button>
            </div>
          }
        />

        <div className="card-body">
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-canvas px-3 py-2 text-[11.5px] leading-relaxed text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Test conversations are stored only in this browser tab. No telephone number is dialled, and generated replies
              follow your agent&apos;s facts and escalation rules.
            </span>
          </div>

          <div className="max-h-[420px] min-h-[220px] space-y-3 overflow-y-auto rounded-xl border border-line bg-canvas/40 p-4">
            {turns.length === 0 && !sending && (
              <div className="flex h-full min-h-[180px] flex-col items-center justify-center text-center">
                <Bot className="h-6 w-6 text-ink-500/50" aria-hidden />
                <p className="mt-2 text-sm font-medium text-ink-800">
                  {selectedAgent ? `Start a conversation with ${selectedAgent.name}` : 'Select an agent'}
                </p>
                <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-muted">
                  {selectedAgent?.welcomeMessage ||
                    'Ask about opening hours, services or anything covered by the business knowledge you saved.'}
                </p>
                {selectedAgent && (
                  <Button
                    variant="secondary"
                    small
                    className="mt-3"
                    onClick={() => void sendMessage(selectedAgent.welcomeMessage || 'Hello, what can you help with?')}
                  >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    Use welcome message
                  </Button>
                )}
              </div>
            )}

            {turns.map((turn, index) => (
              <div
                key={`${turn.at}-${index}`}
                className={cn('flex', turn.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed',
                    turn.role === 'user'
                      ? 'rounded-br-sm bg-brand-600 text-white'
                      : 'rounded-bl-sm border border-line bg-white text-ink-800',
                  )}
                >
                  {turn.content}
                  {turn.source === 'transcription' && (
                    <span className="mt-1 block text-[10px] uppercase tracking-wide text-white/60">from transcription</span>
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-line bg-white px-3.5 py-2.5 text-[13px] text-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  {selectedAgent?.name || 'Agent'} is thinking…
                </div>
              </div>
            )}
            <div ref={conversationEndRef} />
          </div>

          {chatError && (
            <Alert tone="error" title={chatError.message} className="mt-4">
              {chatError.hint}
            </Alert>
          )}

          {session.interrupted && session.state === 'listening' && (
            <p className="mt-3 text-[11.5px] text-amber-700">Playback stopped — you interrupted the agent (barge-in).</p>
          )}

          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(message);
            }}
          >
            <div className="flex-1">
              <label htmlFor="chat-input" className="sr-only">
                Message
              </label>
              <Textarea
                id="chat-input"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage(message);
                  }
                }}
                placeholder={
                  selectedAgent
                    ? `Ask ${selectedAgent.name} a question…`
                    : 'Select an agent to start'
                }
                className="min-h-[52px]"
                maxLength={2000}
                disabled={!selectedAgent || sending || session.terminated}
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                loading={sending}
                disabled={!message.trim() || !selectedAgent || session.terminated}
                className="h-[42px]"
              >
                <Send className="h-4 w-4" aria-hidden />
                Send
              </Button>
              <Button type="button" variant="secondary" onClick={endSession} disabled={turns.length === 0} className="h-[42px]">
                <Square className="h-3.5 w-3.5" aria-hidden />
                End
              </Button>
            </div>
          </form>

          {session.terminated && (
            <Alert tone="info" className="mt-3" title="Session ended">
              Reset the conversation to continue testing. Nothing was sent to a telephone network.
            </Alert>
          )}
        </div>
      </Card>

      <div className="mt-4 rounded-xl border border-line bg-white px-4 py-3 text-[11.5px] leading-relaxed text-muted">
        <p className="font-semibold text-ink-800">What this page does not do</p>
        <p className="mt-1">
          It does not place or receive telephone calls, stream live audio to a phone network, or perform human transfers.
          Those require a deployed real-time voice gateway and a verified telephony provider — see the call history page for
          current status.
        </p>
      </div>
    </div>
  );
}

export default function VoiceLabPage() {
  return (
    <Suspense
      fallback={
        <div className="card card-body">
          <div className="skeleton h-4 w-1/3" />
          <div className="mt-3 skeleton h-24 w-full" />
        </div>
      }
    >
      <VoiceLabInner />
    </Suspense>
  );
}
