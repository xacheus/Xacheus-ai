'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  limit as limitTo,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type Query,
  type QuerySnapshot,
} from 'firebase/firestore';
import { getDb } from '@/lib/firebase/client';

export function timestampToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'number') return new Date(value);
  return null;
}

export interface LiveResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function friendlyFirestoreError(error: unknown): string {
  const code = (error as { code?: string }).code || '';
  if (code === 'permission-denied') {
    return 'You do not have permission to read this data. The Firestore security rules may not be deployed yet.';
  }
  if (code === 'unavailable') return 'Cannot reach Firestore right now. Check your connection.';
  if (code === 'failed-precondition') {
    return 'This query needs a Firestore index that has not been deployed yet.';
  }
  return 'Could not load data from Firestore.';
}

function useLiveQuery<T>(
  build: () => Query<DocumentData> | null,
  map: (snapshot: QuerySnapshot<DocumentData>) => T,
  deps: unknown[],
): LiveResult<T> {
  const [state, setState] = useState<LiveResult<T>>({ data: null, loading: true, error: null });

  const key = JSON.stringify(deps);

  useEffect(() => {
    let target: Query<DocumentData> | null = null;
    try {
      target = build();
    } catch (error) {
      setState({ data: null, loading: false, error: friendlyFirestoreError(error) });
      return;
    }
    if (!target) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    setState((previous) => ({ ...previous, loading: true, error: null }));
    const unsubscribe = onSnapshot(
      target,
      (snapshot) => {
        setState({ data: map(snapshot), loading: false, error: null });
      },
      (error) => {
        setState({ data: null, loading: false, error: friendlyFirestoreError(error) });
      },
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

function useLiveDoc<T>(
  build: (() => ReturnType<typeof doc> | null),
  map: (snapshot: DocumentSnapshot<DocumentData>) => T,
  deps: unknown[],
): LiveResult<T> {
  const [state, setState] = useState<LiveResult<T>>({ data: null, loading: true, error: null });
  const key = JSON.stringify(deps);

  useEffect(() => {
    let target: ReturnType<typeof doc> | null = null;
    try {
      target = build();
    } catch (error) {
      setState({ data: null, loading: false, error: friendlyFirestoreError(error) });
      return;
    }
    if (!target) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    setState((previous) => ({ ...previous, loading: true, error: null }));
    const unsubscribe = onSnapshot(
      target,
      (snapshot) => {
        try {
          setState({ data: map(snapshot), loading: false, error: null });
        } catch {
          setState({ data: null, loading: false, error: 'This record could not be read.' });
        }
      },
      (error) => setState({ data: null, loading: false, error: friendlyFirestoreError(error) }),
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

export interface AgentDoc {
  id: string;
  name: string;
  purpose: string;
  businessName: string;
  personality: string;
  speakingStyle: string;
  language: string;
  voiceProvider: string;
  voiceId: string;
  speakingRate: number;
  welcomeMessage: string;
  faqs: Array<{ question: string; answer: string }>;
  knowledge: string;
  systemInstructions: string;
  callHandlingInstructions: string;
  transferInstructions: string;
  transferNumber: string;
  businessHours: string;
  status: 'active' | 'inactive';
  createdAt: Date | null;
  updatedAt: Date | null;
}

function mapAgent(id: string, data: DocumentData): AgentDoc {
  return {
    id,
    name: (data.name as string) || 'Untitled agent',
    purpose: (data.purpose as string) || '',
    businessName: (data.businessName as string) || '',
    personality: (data.personality as string) || '',
    speakingStyle: (data.speakingStyle as string) || '',
    language: (data.language as string) || 'en-US',
    voiceProvider: (data.voiceProvider as string) || 'browser',
    voiceId: (data.voiceId as string) || 'browser-default',
    speakingRate: typeof data.speakingRate === 'number' ? data.speakingRate : 1,
    welcomeMessage: (data.welcomeMessage as string) || '',
    faqs: Array.isArray(data.faqs) ? data.faqs : [],
    knowledge: (data.knowledge as string) || '',
    systemInstructions: (data.systemInstructions as string) || '',
    callHandlingInstructions: (data.callHandlingInstructions as string) || '',
    transferInstructions: (data.transferInstructions as string) || '',
    transferNumber: (data.transferNumber as string) || '',
    businessHours: (data.businessHours as string) || '',
    status: data.status === 'inactive' ? 'inactive' : 'active',
    createdAt: timestampToDate(data.createdAt),
    updatedAt: timestampToDate(data.updatedAt),
  };
}

export function useAgents(uid: string | null | undefined) {
  return useLiveQuery<AgentDoc[]>(
    () => {
      if (!uid) return null;
      return query(
        collection(getDb(), 'users', uid, 'agents'),
        orderBy('createdAt', 'desc'),
        limitTo(100),
      );
    },
    (snapshot) => snapshot.docs.map((document) => mapAgent(document.id, document.data())),
    [uid],
  );
}

export function useAgent(uid: string | null | undefined, agentId: string | null | undefined) {
  return useLiveDoc<AgentDoc>(
    () => {
      if (!uid || !agentId) return null;
      return doc(getDb(), 'users', uid, 'agents', agentId);
    },
    (snapshot) => {
      if (!snapshot.exists()) throw new Error('missing');
      return mapAgent(snapshot.id, snapshot.data() || {});
    },
    [uid, agentId],
  );
}

export interface WorkspaceDoc {
  id: string;
  name: string;
  description: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  timezone: string;
  businessHours: string;
  faqs: Array<{ question: string; answer: string }>;
  products: string;
  appointmentInstructions: string;
  escalationContact: string;
  updatedAt: Date | null;
}

export function useWorkspace(uid: string | null | undefined) {
  return useLiveDoc<WorkspaceDoc>(
    () => {
      if (!uid) return null;
      return doc(getDb(), 'workspaces', uid);
    },
    (snapshot) => {
      const data = snapshot.data() || {};
      return {
        id: snapshot.id,
        name: (data.name as string) || '',
        description: (data.description as string) || '',
        contactEmail: (data.contactEmail as string) || '',
        contactPhone: (data.contactPhone as string) || '',
        website: (data.website as string) || '',
        timezone: (data.timezone as string) || 'UTC',
        businessHours: (data.businessHours as string) || '',
        faqs: Array.isArray(data.faqs) ? data.faqs : [],
        products: (data.products as string) || '',
        appointmentInstructions: (data.appointmentInstructions as string) || '',
        escalationContact: (data.escalationContact as string) || '',
        updatedAt: timestampToDate(data.updatedAt),
      };
    },
    [uid],
  );
}

export interface CallDoc {
  id: string;
  agentId: string | null;
  agentName: string | null;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string;
  status: string;
  durationSeconds: number;
  transcript: string | null;
  summary: string | null;
  outcome: string | null;
  failureReason: string | null;
  createdAt: Date | null;
  startTime: Date | null;
}

export function useCalls(uid: string | null | undefined, max = 100) {
  return useLiveQuery<CallDoc[]>(
    () => {
      if (!uid) return null;
      return query(
        collection(getDb(), 'calls'),
        where('ownerId', '==', uid),
        orderBy('createdAt', 'desc'),
        limitTo(max),
      );
    },
    (snapshot) =>
      snapshot.docs.map((document) => {
        const data = document.data();
        return {
          id: document.id,
          agentId: (data.agentId as string) || null,
          agentName: (data.agentName as string) || null,
          direction: data.direction === 'outbound' ? 'outbound' : 'inbound',
          from: (data.from as string) || '',
          to: (data.to as string) || '',
          status: (data.status as string) || 'queued',
          durationSeconds: typeof data.durationSeconds === 'number' ? data.durationSeconds : 0,
          transcript: (data.transcript as string) || null,
          summary: (data.summary as string) || null,
          outcome: (data.outcome as string) || null,
          failureReason: (data.failureReason as string) || null,
          createdAt: timestampToDate(data.createdAt),
          startTime: timestampToDate(data.startTime),
        };
      }),
    [uid, max],
  );
}

/** Format helpers shared by the dashboard. */
export function formatDuration(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds < 0) return '0s';
  const seconds = Math.round(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${rest}s`;
  return `${rest}s`;
}

export function formatMinutes(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  if (minutes === 0) return `${seconds}s`;
  return `${minutes.toLocaleString('en-US')}m ${seconds}s`;
}

export function formatDateTime(date: Date | null): string {
  if (!date) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return mobile;
}

export function useMemoised<T>(factory: () => T, deps: unknown[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(factory, deps);
}
