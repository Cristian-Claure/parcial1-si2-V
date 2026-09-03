/* VÉLORA Web/PWA Firebase Messaging worker.
 * Scope dedicado para no interferir con Angular ngsw-worker.js.
 */
importScripts(
  'https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js'
);
importScripts(
  'https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js'
);

firebase.initializeApp({"apiKey":"AIzaSyDLp_CBWsXQsh9TEvhclMu0SSeB0SbLY7c","authDomain":"velora-784de.firebaseapp.com","projectId":"velora-784de","storageBucket":"velora-784de.firebasestorage.app","messagingSenderId":"1051623939328","appId":"1:1051623939328:web:5d8846572c58d7166ea7e5"});
firebase.messaging();
