import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAJhhknsvNdi2_UfDVKzz8Vei93nK8r5Qs",
    authDomain: "laporan-harian-pdam.firebaseapp.com",
    projectId: "laporan-harian-pdam",
    storageBucket: "laporan-harian-pdam.firebasestorage.app",
    messagingSenderId: "689446175632",
    appId: "1:689446175632:web:d7de27e1fcd58fad35e915",
    measurementId: "G-RGGL8PPKKV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);
