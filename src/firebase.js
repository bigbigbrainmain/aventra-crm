import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDLeGSIABOsJK0VKNmYqVqD9E5lmZdUa7w",
  authDomain: "aventra-b9e87.firebaseapp.com",
  projectId: "aventra-b9e87",
  storageBucket: "aventra-b9e87.firebasestorage.app",
  messagingSenderId: "862357734935",
  appId: "1:862357734935:web:675ad0b0ec58c767d73e52"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
