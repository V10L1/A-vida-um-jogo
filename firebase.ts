import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithRedirect, signOut, getRedirectResult } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import { GameState, UserProfile } from "./types";

// Configuração do Firebase usando variáveis de ambiente
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

// Debug: Verificar se as chaves estão carregando (mas escondendo valores sensiveis)
console.log("Firebase Config Status:", {
    hasApiKey: !!firebaseConfig.apiKey,
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId
});

// Inicializa o Firebase apenas se as chaves existirem
let app;
let auth: any;
let db: any;
let googleProvider: any;

try {
  if (firebaseConfig.apiKey) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    googleProvider = new GoogleAuthProvider();
  } else {
    console.warn("Chaves do Firebase não encontradas. Verifique o arquivo .env ou as variáveis da Vercel.");
  }
} catch (error) {
  console.error("Erro crítico ao inicializar Firebase:", error);
}

// Funções de Autenticação
export const loginWithGoogle = async () => {
  if (!auth) throw new Error("Firebase não configurado (Falta API Key).");
  try {
    // Usar Redirect é melhor para mobile que Popup
    await signInWithRedirect(auth, googleProvider);
    // O código para aqui pois a página recarrega
  } catch (error) {
    console.error("Erro ao iniciar login:", error);
    throw error;
  }
};

// Nova função para checar erros após o redirecionamento
export const checkRedirectResult = async () => {
    if (!auth) return null;
    try {
        const result = await getRedirectResult(auth);
        return result?.user;
    } catch (error: any) {
        console.error("Erro detalhado do Login:", error);
        throw error;
    }
}

export const logoutUser = async () => {
  if (!auth) return;
  await signOut(auth);
};

// Funções de Banco de Dados (Firestore)
export const saveUserDataToCloud = async (userId: string, user: UserProfile, gameState: GameState) => {
  if (!db) return;
  try {
    await setDoc(doc(db, "users", userId), {
      userProfile: user,
      gameState: gameState,
      lastUpdated: Date.now()
    });
    console.log("Dados salvos na nuvem!");
  } catch (error) {
    console.error("Erro ao salvar na nuvem:", error);
  }
};

export const loadUserDataFromCloud = async (userId: string) => {
  if (!db) return null;
  try {
    const docRef = doc(db, "users", userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as { userProfile: UserProfile, gameState: GameState };
    } else {
      return null;
    }
  } catch (error) {
    console.error("Erro ao carregar da nuvem:", error);
    return null;
  }
};

export { auth };