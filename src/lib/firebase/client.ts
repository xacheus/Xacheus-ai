'use client';

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { appCheckSiteKey, firebaseWebConfig } from './config';

/**
 * Browser-side Firebase singletons.
 *
 * Clients are created lazily so server rendering never touches the SDK, and so
 * an unconfigured App Check key degrades to "no App Check" rather than a crash.
 */

let appCheckInitialised = false;

export function getFirebaseApp(): FirebaseApp {
  const app = getApps().length ? getApp() : initializeApp(firebaseWebConfig);
  void initAppCheck(app);
  return app;
}

async function initAppCheck(app: FirebaseApp) {
  if (appCheckInitialised || !appCheckSiteKey || typeof window === 'undefined') return;
  appCheckInitialised = true;
  try {
    const { initializeAppCheck, ReCaptchaV3Provider } = await import('firebase/app-check');
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    // App Check is optional; auth and Firestore still work without it.
    console.warn('[app-check] initialisation skipped', error instanceof Error ? error.message : error);
  }
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

export function getDb(): Firestore {
  return getFirestore(getFirebaseApp());
}
