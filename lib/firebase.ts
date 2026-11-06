import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCs0PL2dlFYW7ETgcFI5CrUvudKj46RlQo",
  authDomain: "zip-groups.firebaseapp.com",
  projectId: "zip-groups",
  storageBucket: "zip-groups.firebasestorage.app",
  messagingSenderId: "49480467707",
  appId: "1:49480467707:web:9c611aa74335a459439c5e",
  measurementId: "G-TFW4WV60JH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize the Real-Time Database (Firestore)
export const db = getFirestore(app);