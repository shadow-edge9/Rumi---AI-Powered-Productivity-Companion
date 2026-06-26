import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyA6m3qxgMZU8mY9JMYWdLTDIb6lsn3NQEE",
  authDomain: "gen-lang-client-0021900144.firebaseapp.com",
  projectId: "gen-lang-client-0021900144",
  storageBucket: "gen-lang-client-0021900144.firebasestorage.app",
  messagingSenderId: "659457932500",
  appId: "1:659457932500:web:f19d0e8e1f287e7f29cf41"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "ai-studio-4e490fd1-618e-4f57-8812-731cdd4a517e");
const storage = getStorage(app);

export { auth, db, storage };
