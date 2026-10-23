// Firebase web app config for the dashboard.
//
// Replace every PASTE_… value with the one Firebase shows under
// Project settings → General → Your apps → Web app → SDK setup and configuration → Config.
// See setup-dashboard.md, step 8.
//
// These values are public by design (every Firebase web app ships them to the browser).
// They identify the project; they do not grant access. Access is decided by
// firestore.rules, which only lets the two allowed Google accounts read or write.

export const firebaseConfig = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID",
};
