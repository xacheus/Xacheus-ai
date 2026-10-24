/**
 * Public Firebase web configuration for project `xacheus-ai`.
 * These values are intended to ship to browsers; they are NOT secrets.
 * Access control lives in Firestore rules, not in this file.
 */
export const firebaseWebConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyCXKhOJYmmYz2Aqyv1powJuUaJHAySI87o',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'xacheus-ai.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'xacheus-ai',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'xacheus-ai.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '381741784268',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:381741784268:web:3d9e4f5b70a794c0bd3669',
};

export const appCheckSiteKey = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY || '';
