// @ts-ignore
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithRedirect, 
  signOut, 
  getRedirectResult,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  runTransaction 
} from "firebase/firestore";
import { GameState, UserProfile, Guild, GuildMember, ChatMessage } from "./types";

// Configuração do Firebase usando variáveis de ambiente com limpeza de espaços (.trim)
// Isso previne erros comuns de copiar/colar na Vercel
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY ? process.env.FIREBASE_API_KEY.trim() : "",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN ? process.env.FIREBASE_AUTH_DOMAIN.trim() : "",
  projectId: process.env.FIREBASE_PROJECT_ID ? process.env.FIREBASE_PROJECT_ID.trim() : "",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET ? process.env.FIREBASE_STORAGE_BUCKET.trim() : "",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID ? process.env.FIREBASE_MESSAGING_SENDER_ID.trim() : "",
  appId: process.env.FIREBASE_APP_ID ? process.env.FIREBASE_APP_ID.trim() : ""
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

// --- Google Auth ---
export const loginWithGoogle = async () => {
  if (!auth) throw new Error("Firebase não configurado (Falta API Key). Verifique as variáveis de ambiente.");
  try {
    await signInWithRedirect(auth, googleProvider);
  } catch (error) {
    console.error("Erro ao iniciar login Google:", error);
    throw error;
  }
};

// --- Email/Password Auth ---
export const registerWithEmail = async (email: string, pass: string) => {
  if (!auth) throw new Error("Firebase não configurado.");
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    return userCredential.user;
  } catch (error: any) {
    console.error("Erro ao registrar:", error);
    throw error;
  }
};

export const loginWithEmail = async (email: string, pass: string) => {
  if (!auth) throw new Error("Firebase não configurado.");
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, pass);
    return userCredential.user;
  } catch (error: any) {
    console.error("Erro ao logar com email:", error);
    throw error;
  }
};

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
export const saveUserDataToCloud = async (userId: string, user: UserProfile, gameState: GameState): Promise<boolean> => {
  if (!db) return false;
  try {
    await setDoc(doc(db, "users", userId), {
      userProfile: user,
      gameState: gameState,
      lastUpdated: Date.now()
    });
    console.log("Dados salvos na nuvem!");
    return true;
  } catch (error) {
    console.error("Erro ao salvar na nuvem:", error);
    return false;
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

// --- Guild Functions ---

export const createGuild = async (
  guildName: string, 
  creatorUid: string, 
  creatorName: string, 
  creatorAvatar: string | undefined, 
  classTitle: string, 
  level: number
): Promise<string | null> => {
  if (!db) return null;
  try {
    const newGuildRef = doc(collection(db, "guilds")); // Auto-ID
    const member: GuildMember = {
        uid: creatorUid,
        name: creatorName,
        level: level,
        role: 'leader',
        avatar: creatorAvatar,
        classTitle: classTitle
    };

    const initialBoss = {
        name: "Golem de Sedentarismo",
        maxHp: 1000,
        currentHp: 1000,
        level: 1,
        image: "🗿"
    };

    const newGuild: Guild = {
        id: newGuildRef.id,
        name: guildName,
        description: "Uma guilda de guerreiros focados.",
        level: 1,
        xp: 0,
        members: { [creatorUid]: member },
        boss: initialBoss
    };

    await setDoc(newGuildRef, newGuild);
    return newGuildRef.id;
  } catch (error) {
    console.error("Erro ao criar guilda:", error);
    return null;
  }
};

export const joinGuild = async (
  guildId: string,
  uid: string,
  name: string,
  avatar: string | undefined,
  classTitle: string,
  level: number
): Promise<boolean> => {
  if (!db) return false;
  try {
    const guildRef = doc(db, "guilds", guildId);
    await runTransaction(db, async (transaction) => {
        const guildDoc = await transaction.get(guildRef);
        if (!guildDoc.exists()) {
            throw "Guild does not exist!";
        }
        
        const guildData = guildDoc.data() as Guild;
        const member: GuildMember = {
            uid,
            name,
            level,
            role: 'member',
            avatar,
            classTitle
        };
        
        // Add member to map
        const updatedMembers = { ...guildData.members, [uid]: member };
        transaction.update(guildRef, { members: updatedMembers });
    });
    return true;
  } catch (error) {
    console.error("Erro ao entrar na guilda:", error);
    return false;
  }
};

export const sendMessage = async (
    guildId: string, 
    senderId: string, 
    senderName: string, 
    text: string
) => {
    if (!db) return;
    try {
        const messagesRef = collection(db, "guilds", guildId, "messages");
        const newMessage: Omit<ChatMessage, 'id'> = {
            senderId,
            senderName,
            text,
            timestamp: Date.now(),
            type: 'text'
        };
        await addDoc(messagesRef, newMessage);
    } catch (e) {
        console.error("Error sending message", e);
    }
};

export const subscribeToGuild = (
    guildId: string, 
    callback: (guild: Guild | null, messages: ChatMessage[] | null) => void
) => {
    if (!db) return () => {};

    let cachedGuild: Guild | null = null;
    let cachedMessages: ChatMessage[] | null = null;

    const guildRef = doc(db, "guilds", guildId);
    const messagesRef = collection(db, "guilds", guildId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"), limit(50));

    const unsubGuild = onSnapshot(guildRef, (docSnap) => {
        if (docSnap.exists()) {
            cachedGuild = { id: docSnap.id, ...docSnap.data() } as Guild;
        } else {
            cachedGuild = null;
        }
        callback(cachedGuild, cachedMessages);
    });

    const unsubMessages = onSnapshot(q, (querySnap) => {
        cachedMessages = querySnap.docs.map(d => ({ 
            id: d.id,
            ...d.data() 
        } as ChatMessage));
        callback(cachedGuild, cachedMessages);
    });

    return () => {
        unsubGuild();
        unsubMessages();
    };
};

export const attackBoss = async (guildId: string, damage: number, attackerName: string) => {
    if (!db) return;
    const guildRef = doc(db, "guilds", guildId);

    try {
        await runTransaction(db, async (transaction) => {
            const guildDoc = await transaction.get(guildRef);
            if (!guildDoc.exists()) throw "Guild not found";
            
            const guild = guildDoc.data() as Guild;
            if (!guild.boss) return;

            let newHp = guild.boss.currentHp - damage;
            let bossDefeated = false;
            const newBoss = { ...guild.boss };

            if (newHp <= 0) {
                bossDefeated = true;
                // Boss Defeated: Level Up Logic
                newBoss.level += 1;
                newBoss.maxHp = Math.floor(newBoss.maxHp * 1.5);
                newBoss.currentHp = newBoss.maxHp;
            } else {
                newBoss.currentHp = newHp;
            }
            
            transaction.update(guildRef, { boss: newBoss });

            if (bossDefeated) {
                 const messagesRef = collection(db, "guilds", guildId, "messages");
                 const victoryMsg = {
                    senderId: "system",
                    senderName: "Sistema",
                    text: `⚔️ O Chefe ${guild.boss.name} foi derrotado por ${attackerName}! Novo desafio: Nível ${newBoss.level}!`,
                    timestamp: Date.now(),
                    type: 'system'
                 };
                 // Use a new doc ref for the message
                 const msgDoc = doc(messagesRef);
                 transaction.set(msgDoc, victoryMsg);
            }
        });
    } catch (e) {
        console.error("Error attacking boss", e);
    }
};

export { auth };