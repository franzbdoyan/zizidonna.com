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
  apiKey: "AIzaSyBZ_c_1jabPUH6cWnZ9mzf4gozPSC9w9Yc",
  authDomain: "zizidonna-dashboard.firebaseapp.com",
  projectId: "zizidonna-dashboard",
  storageBucket: "zizidonna-dashboard.firebasestorage.app",
  messagingSenderId: "856325297827",
  appId: "1:856325297827:web:ec91d358fcee1ccd8b1116",
};
