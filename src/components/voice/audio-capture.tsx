'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, Upload, X } from 'lucide-react';
import { Alert, Button, Tabs, cn } from '@/components/ui';

const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPT = 'audio/*,.mp3,.m4a,.wav,.webm,.ogg,.flac,.mp4';

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function extensionFor(mime: string): string {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export function AudioCapture({
  file,
  onFile,
  disabled,
  onError,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  disabled?: boolean;
  onError?: (message: string | null) => void;
}) {
  const [mode, setMode] = useState<'record' | 'upload'>('record');
  const [supported, setSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const previewUrl = useRef<string | null>(null);

  useEffect(() => {
    const canRecord =
      typeof window !== 'undefined' &&
      typeof MediaRecorder !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia);
    setSupported(canRecord);
    if (!canRecord) setMode('upload');
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  async function startRecording() {
    setPermissionError(null);
    onError?.(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        cleanupStream();
        setRecording(false);

        if (blob.size === 0) {
          setPermissionError('No audio was captured. Check that your microphone is not muted, then try again.');
          return;
        }
        if (blob.size > MAX_BYTES) {
          setPermissionError('That recording is larger than 25 MB. Record a shorter clip.');
          return;
        }
        const extension = extensionFor(type);
        onFile(new File([blob], `recording-${Date.now()}.${extension}`, { type }));
      };

      recorder.start(250);
      recorderRef.current = recorder;
      setRecording(true);
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setPermissionError(
          'Microphone access was blocked. Allow microphone permission for this site in your browser settings, then try again.',
        );
      } else if (name === 'NotFoundError') {
        setPermissionError('No microphone was found on this device. Upload an audio file instead.');
      } else {
        setPermissionError('The microphone could not be started. Upload an audio file instead.');
      }
      cleanupStream();
      setRecording(false);
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    } else {
      cleanupStream();
      setRecording(false);
    }
  }

  function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    onError?.(null);
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (!selected) return;
    if (selected.size > MAX_BYTES) {
      onError?.('That file is larger than 25 MB. Choose a shorter clip or compress it to MP3.');
      return;
    }
    if (selected.size < 1024) {
      onError?.('That file is too small to contain audio.');
      return;
    }
    onFile(selected);
    setMode('upload');
  }

  function clearFile() {
    if (previewUrl.current) {
      URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
    }
    onFile(null);
    onError?.(null);
  }

  const previewSrc = (() => {
    if (!file) return null;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = URL.createObjectURL(file);
    return previewUrl.current;
  })();

  return (
    <div>
      <Tabs
        value={mode}
        onChange={(next) => {
          if (recording) stopRecording();
          setMode(next);
        }}
        tabs={[
          { id: 'record', label: 'Record' },
          { id: 'upload', label: 'Upload file' },
        ]}
      />

      <div className="mt-4">
        {mode === 'record' ? (
          !supported ? (
            <Alert tone="warning" title="Recording is not supported in this browser">
              Use a recent version of Chrome, Edge, Firefox or Safari, or upload an audio file instead.
            </Alert>
          ) : (
            <div className="rounded-xl border border-line bg-canvas/60 p-5 text-center">
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                disabled={disabled}
                className={cn(
                  'relative mx-auto flex h-16 w-16 items-center justify-center rounded-full text-white transition-colors disabled:opacity-60',
                  recording ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700',
                )}
                aria-label={recording ? 'Stop recording' : 'Start recording'}
              >
                {recording && <span className="absolute inset-0 animate-pulseRing rounded-full bg-red-500/40" aria-hidden />}
                {recording ? <Square className="h-5 w-5" /> : <Mic className="h-6 w-6" />}
              </button>
              <p className="mt-3 text-sm font-medium text-ink-900">
                {recording ? `Recording… ${formatElapsed(elapsed)}` : 'Tap to record a test clip'}
              </p>
              <p className="mt-1 text-[11.5px] text-muted">
                {recording ? 'Tap the square to stop and attach the recording.' : 'Up to 25 MB. Nothing is uploaded until you press Transcribe.'}
              </p>
            </div>
          )
        ) : (
          <div>
            <label
              htmlFor="audio-upload"
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-line bg-canvas/60 px-5 py-8 text-center transition-colors hover:border-brand-300 hover:bg-brand-50/40',
                disabled && 'pointer-events-none opacity-60',
              )}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-brand-600 shadow-sm">
                <Upload className="h-4 w-4" aria-hidden />
              </span>
              <span className="mt-3 text-sm font-medium text-ink-900">Choose an audio file</span>
              <span className="mt-1 text-[11.5px] text-muted">MP3, WAV, M4A, WEBM, OGG or FLAC · max 25 MB</span>
              <input
                id="audio-upload"
                type="file"
                accept={ACCEPT}
                className="sr-only"
                onChange={handleUpload}
                disabled={disabled}
              />
            </label>
          </div>
        )}
      </div>

      {permissionError && (
        <Alert tone="error" className="mt-4">
          {permissionError}
        </Alert>
      )}

      {file && (
        <div className="mt-4 rounded-xl border border-line bg-white p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-ink-900">{file.name}</p>
              <p className="text-[11.5px] text-muted">
                {(file.size / 1024).toFixed(0)} KB · {file.type || 'audio'}
              </p>
            </div>
            <button
              type="button"
              onClick={clearFile}
              className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink-800"
              aria-label="Remove audio file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {previewSrc && (
            <audio controls src={previewSrc} className="mt-3 w-full" preload="metadata">
              Your browser does not support audio playback.
            </audio>
          )}
        </div>
      )}
    </div>
  );
}
