
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
  deleteDoc, // Imported deleteDoc
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  runTransaction,
  where,
  getDocs,
  or
} from "firebase/firestore";
import { GameState, UserProfile, Guild, GuildMember, ChatMessage, PublicProfile, Duel } from "./types";

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

// --- RANKING, PROFILE & PVP FUNCTIONS ---

export const getGlobalRanking = async (classFilter?: string): Promise<PublicProfile[]> => {
    if (!db) return [];
    try {
        const usersRef = collection(db, "users");
        let q = query(usersRef, orderBy("gameState.totalXp", "desc"), limit(50));
        
        const snapshot = await getDocs(q);
        const profiles: PublicProfile[] = snapshot.docs.map(doc => {
            const data = doc.data();
            const p = data.userProfile as UserProfile;
            const g = data.gameState as GameState;
            return {
                uid: doc.id,
                name: p.name,
                level: g.level,
                classTitle: g.classTitle || "NPC",
                totalXp: g.totalXp,
                avatarImage: p.avatarImage,
                attributes: g.attributes
            };
        });

        if (classFilter && classFilter !== 'Todos') {
            return profiles.filter(p => p.classTitle === classFilter);
        }
        return profiles;
    } catch (e) {
        console.error("Error fetching ranking", e);
        return [];
    }
};

export const createDuel = async (challengerId: string, challengerName: string, opponentId: string, opponentName: string, activityId: string, targetAmount: number) => {
    if (!db) return;
    try {
        const duelsRef = collection(db, "duels");
        const newDuel: Omit<Duel, 'id'> = {
            challengerId,
            challengerName,
            opponentId,
            opponentName,
            activityId,
            targetAmount,
            challengerProgress: 0,
            opponentProgress: 0,
            status: 'pending',
            createdAt: Date.now()
        };
        await addDoc(duelsRef, newDuel);
    } catch (e) {
        console.error("Error creating duel", e);
        alert("Erro ao criar desafio.");
    }
};

export const acceptDuel = async (duelId: string) => {
    if (!db) return;
    try {
        const duelRef = doc(db, "duels", duelId);
        await updateDoc(duelRef, { status: 'active' });
    } catch (e) { console.error(e); }
};

export const cancelDuel = async (duelId: string) => {
    if (!db) return;
    try {
        await deleteDoc(doc(db, "duels", duelId));
    } catch (e) { console.error("Error cancelling duel", e); }
};

export const fetchActiveDuels = (userId: string, callback: (duels: Duel[]) => void) => {
    if (!db) return () => {};
    
    const duelsRef = collection(db, "duels");
    const q = query(
        duelsRef, 
        or(
            where("challengerId", "==", userId),
            where("opponentId", "==", userId)
        )
    );

    return onSnapshot(q, (snap) => {
        const duels = snap.docs.map(d => ({ id: d.id, ...d.data() } as Duel));
        callback(duels);
    });
};

export const updateDuelProgress = async (userId: string, activityId: string, amount: number) => {
    if (!db) return;
    try {
        const duelsRef = collection(db, "duels");
        const q = query(
            duelsRef, 
            where("status", "==", "active"),
            where("activityId", "==", activityId)
        );
        const snap = await getDocs(q);
        
        snap.forEach(async (d) => {
            const duel = d.data() as Duel;
            const duelRef = doc(db, "duels", d.id);
            
            if (duel.challengerId === userId || duel.opponentId === userId) {
                 const isChallenger = duel.challengerId === userId;
                 const newProgress = isChallenger ? duel.challengerProgress + amount : duel.opponentProgress + amount;
                 
                 const updateData: any = {};
                 if (isChallenger) updateData.challengerProgress = newProgress;
                 else updateData.opponentProgress = newProgress;

                 if (newProgress >= duel.targetAmount) {
                     updateData.status = 'finished';
                     updateData.winnerId = userId;
                 }
                 
                 await updateDoc(duelRef, updateData);
            }
        });
    } catch (e) {
        console.error("Error updating duel progress", e);
    }
};

export { auth };
