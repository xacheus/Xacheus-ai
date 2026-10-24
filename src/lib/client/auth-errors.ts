'use client';

/** Map Firebase Auth error codes to actionable, human-readable messages. */
export function authErrorMessage(error: unknown): { message: string; hint?: string } {
  const code = (error as { code?: string })?.code || '';
  switch (code) {
    case 'auth/invalid-email':
      return { message: 'That email address is not valid.' };
    case 'auth/user-disabled':
      return { message: 'This account has been disabled. Contact support.' };
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return { message: 'Email or password is incorrect.', hint: 'Check your details or reset your password.' };
    case 'auth/email-already-in-use':
      return { message: 'An account already exists with that email.', hint: 'Sign in instead, or reset your password.' };
    case 'auth/weak-password':
      return { message: 'Choose a stronger password.', hint: 'Use at least 8 characters with letters and numbers.' };
    case 'auth/too-many-requests':
      return { message: 'Too many attempts.', hint: 'Wait a few minutes before trying again.' };
    case 'auth/operation-not-allowed':
      return {
        message: 'Email/password sign-in is not enabled for this Firebase project.',
        hint: 'An administrator must enable the Email/Password provider in Firebase Console → Authentication → Sign-in method.',
      };
    case 'auth/unauthorized-domain':
      return {
        message: 'This domain is not authorised for Firebase Authentication.',
        hint: 'Add this hostname under Firebase Console → Authentication → Settings → Authorized domains.',
      };
    case 'auth/popup-blocked':
      return { message: 'Your browser blocked the sign-in popup.', hint: 'Allow popups for this site and try again.' };
    case 'auth/popup-closed-by-user':
      return { message: 'Sign-in was cancelled.' };
    case 'auth/account-exists-with-different-credential':
      return { message: 'That email is already registered with a different sign-in method.' };
    case 'auth/network-request-failed':
      return { message: 'Network error while contacting Firebase.', hint: 'Check your connection and try again.' };
    case 'auth/requires-recent-login':
      return { message: 'Please sign in again to continue.' };
    default:
      return { message: 'Sign-in failed. Please try again.' };
  }
}
