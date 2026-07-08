import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCyP4bL9tx_4AhydOdlMNI9ldXPmuCRBCI",
  authDomain: "gen-lang-client-0365314830.firebaseapp.com",
  projectId: "gen-lang-client-0365314830",
  storageBucket: "gen-lang-client-0365314830.firebasestorage.app",
  messagingSenderId: "316993374718",
  appId: "1:316993374718:web:e6c24ae7cbd9af4fee18af"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
export const auth = getAuth(app);
export const db = getFirestore(app, "ai-studio-swiftchat-441c5370-d3a0-4cb8-bf22-045409df7850");

// Connection Validation as required by Skill
async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    console.log("Firebase connection test complete.");
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration.");
    } else {
      console.log("Firebase connection verified.");
    }
  }
}
testConnection();
