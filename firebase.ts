
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
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  runTransaction,
  where,
  getDocs,
  or,
  increment,
  arrayUnion
} from "firebase/firestore";
import { GameState, UserProfile, Guild, GuildMember, ChatMessage, PublicProfile, Duel, Territory, TerritoryPlayerStats, TerritoryEnemyTemplate } from "./types";

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY ? process.env.FIREBASE_API_KEY.trim() : "",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN ? process.env.FIREBASE_AUTH_DOMAIN.trim() : "",
  projectId: process.env.FIREBASE_PROJECT_ID ? process.env.FIREBASE_PROJECT_ID.trim() : "",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET ? process.env.FIREBASE_STORAGE_BUCKET.trim() : "",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID ? process.env.FIREBASE_MESSAGING_SENDER_ID.trim() : "",
  appId: process.env.FIREBASE_APP_ID ? process.env.FIREBASE_APP_ID.trim() : ""
};

let app;
let auth: any;
let db: any;
let googleProvider: any;
export let isFirebaseReady = false;

try {
  if (firebaseConfig.apiKey && firebaseConfig.apiKey.length > 10) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    googleProvider = new GoogleAuthProvider();
    isFirebaseReady = true;
    console.log("Firebase inicializado com sucesso.");
  } else {
    console.warn("Chaves do Firebase ausentes ou inválidas.");
    isFirebaseReady = false;
  }
} catch (error) {
  console.error("Erro crítico ao inicializar Firebase:", error);
  isFirebaseReady = false;
}

export const loginWithGoogle = async () => {
  if (!isFirebaseReady || !auth) throw new Error("Firebase não conectado. Verifique API Key.");
  try {
    await signInWithRedirect(auth, googleProvider);
  } catch (error: any) {
    console.error("Erro ao iniciar login Google:", error);
    if (error.code === 'auth/unauthorized-domain') {
        throw new Error("Domínio não autorizado no Firebase. Adicione este site em Authentication > Settings > Authorized Domains.");
    }
    throw error;
  }
};

export const registerWithEmail = async (email: string, pass: string) => {
  if (!isFirebaseReady || !auth) throw new Error("Firebase não conectado.");
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    return userCredential.user;
  } catch (error: any) {
    console.error("Erro ao registrar:", error);
    if (error.code === 'auth/operation-not-allowed') {
        throw new Error("Login por E-mail/Senha não ativado. Vá no Firebase Console > Authentication > Sign-in method e ative 'Email/Password'.");
    } else if (error.code === 'auth/email-already-in-use') {
        throw new Error("Este e-mail já está cadastrado.");
    } else if (error.code === 'auth/weak-password') {
        throw new Error("A senha é muito fraca (mínimo 6 caracteres).");
    }
    throw error;
  }
};

export const loginWithEmail = async (email: string, pass: string) => {
  if (!isFirebaseReady || !auth) throw new Error("Firebase não conectado.");
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, pass);
    return userCredential.user;
  } catch (error: any) {
    console.error("Erro ao logar com email:", error);
    if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
        throw new Error("E-mail ou senha incorretos.");
    } else if (error.code === 'auth/user-not-found') {
        throw new Error("Usuário não encontrado.");
    }
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

export const saveUserDataToCloud = async (userId: string, user: UserProfile, gameState: GameState): Promise<boolean> => {
  if (!db) return false;
  try {
    await setDoc(doc(db, "users", userId), {
      userProfile: user,
      gameState: gameState,
      lastUpdated: Date.now()
    });
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

export const createGuild = async (guildName: string, creatorUid: string, creatorName: string, creatorAvatar: string | undefined, classTitle: string, level: number): Promise<string | null> => {
  if (!db) return null;
  try {
    const newGuildRef = doc(collection(db, "guilds")); 
    const member: GuildMember = { uid: creatorUid, name: creatorName, level: level, role: 'leader', avatar: creatorAvatar, classTitle: classTitle };
    const initialBoss = { name: "Golem de Sedentarismo", maxHp: 1000, currentHp: 1000, level: 1, image: "🗿" };
    const newGuild: Guild = { id: newGuildRef.id, name: guildName, description: "Uma guilda de guerreiros focados.", level: 1, xp: 0, members: { [creatorUid]: member }, boss: initialBoss };
    await setDoc(newGuildRef, newGuild);
    return newGuildRef.id;
  } catch (error) { return null; }
};

export const joinGuild = async (guildId: string, uid: string, name: string, avatar: string | undefined, classTitle: string, level: number): Promise<boolean> => {
  if (!db) return false;
  try {
    const guildRef = doc(db, "guilds", guildId);
    await runTransaction(db, async (transaction) => {
        const guildDoc = await transaction.get(guildRef);
        if (!guildDoc.exists()) throw "Guild does not exist!";
        const guildData = guildDoc.data() as Guild;
        const member: GuildMember = { uid, name, level, role: 'member', avatar, classTitle };
        const updatedMembers = { ...guildData.members, [uid]: member };
        transaction.update(guildRef, { members: updatedMembers });
    });
    return true;
  } catch (error) { return false; }
};

export const sendMessage = async (guildId: string, senderId: string, senderName: string, text: string) => {
    if (!db) return;
    try {
        const messagesRef = collection(db, "guilds", guildId, "messages");
        const newMessage: Omit<ChatMessage, 'id'> = { senderId, senderName, text, timestamp: Date.now(), type: 'text' };
        await addDoc(messagesRef, newMessage);
    } catch (e) { console.error("Error sending message", e); }
};

export const subscribeToGuild = (guildId: string, callback: (guild: Guild | null, messages: ChatMessage[] | null) => void) => {
    if (!db) return () => {};
    let cachedGuild: Guild | null = null; let cachedMessages: ChatMessage[] | null = null;
    const guildRef = doc(db, "guilds", guildId);
    const messagesRef = collection(db, "guilds", guildId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"), limit(50));
    const unsubGuild = onSnapshot(guildRef, (docSnap) => { if (docSnap.exists()) { cachedGuild = { id: docSnap.id, ...docSnap.data() } as Guild; } else { cachedGuild = null; } callback(cachedGuild, cachedMessages); });
    const unsubMessages = onSnapshot(q, (querySnap) => { cachedMessages = querySnap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)); callback(cachedGuild, cachedMessages); });
    return () => { unsubGuild(); unsubMessages(); };
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
            if (newHp <= 0) { bossDefeated = true; newBoss.level += 1; newBoss.maxHp = Math.floor(newBoss.maxHp * 1.5); newBoss.currentHp = newBoss.maxHp; } else { newBoss.currentHp = newHp; }
            transaction.update(guildRef, { boss: newBoss });
            if (bossDefeated) {
                 const messagesRef = collection(db, "guilds", guildId, "messages");
                 const victoryMsg = { senderId: "system", senderName: "Sistema", text: `⚔️ O Chefe ${guild.boss.name} foi derrotado por ${attackerName}! Novo desafio: Nível ${newBoss.level}!`, timestamp: Date.now(), type: 'system' };
                 const msgDoc = doc(messagesRef);
                 transaction.set(msgDoc, victoryMsg);
            }
        });
    } catch (e) { console.error("Error attacking boss", e); }
};

export const getGlobalRanking = async (classFilter?: string): Promise<PublicProfile[]> => {
    if (!db) return [];
    try {
        const usersRef = collection(db, "users");
        let q = query(usersRef, orderBy("gameState.totalXp", "desc"), limit(50));
        const snapshot = await getDocs(q);
        const profiles: PublicProfile[] = snapshot.docs.map(doc => { const data = doc.data(); const p = data.userProfile as UserProfile; const g = data.gameState as GameState; return { uid: doc.id, name: p.name, level: g.level, classTitle: g.classTitle || "NPC", totalXp: g.totalXp, avatarImage: p.avatarImage, attributes: g.attributes }; });
        if (classFilter && classFilter !== 'Todos') { return profiles.filter(p => p.classTitle === classFilter); }
        return profiles;
    } catch (e) { return []; }
};

export const createDuel = async (challengerId: string, challengerName: string, opponentId: string, opponentName: string, activityId: string, targetAmount: number) => {
    if (!db) return;
    try {
        const duelsRef = collection(db, "duels");
        const newDuel: Omit<Duel, 'id'> = { challengerId, challengerName, opponentId, opponentName, activityId, targetAmount, challengerProgress: 0, opponentProgress: 0, status: 'pending', createdAt: Date.now() };
        await addDoc(duelsRef, newDuel);
    } catch (e) { alert("Erro ao criar desafio."); }
};

export const acceptDuel = async (duelId: string) => { if (!db) return; try { const duelRef = doc(db, "duels", duelId); await updateDoc(duelRef, { status: 'active' }); } catch (e) { console.error(e); } };
export const cancelDuel = async (duelId: string) => { if (!db) return; try { await deleteDoc(doc(db, "duels", duelId)); } catch (e) { console.error(e); } };
export const fetchActiveDuels = (userId: string, callback: (duels: Duel[]) => void) => { if (!db) return () => {}; const duelsRef = collection(db, "duels"); const q = query(duelsRef, or(where("challengerId", "==", userId), where("opponentId", "==", userId))); return onSnapshot(q, (snap) => { const duels = snap.docs.map(d => ({ id: d.id, ...d.data() } as Duel)); callback(duels); }); };
export const updateDuelProgress = async (userId: string, activityId: string, amount: number) => {
    if (!db) return;
    try {
        const duelsRef = collection(db, "duels");
        const q = query(duelsRef, where("status", "==", "active"), where("activityId", "==", activityId));
        const snap = await getDocs(q);
        snap.forEach(async (d) => {
            const duel = d.data() as Duel;
            const duelRef = doc(db, "duels", d.id);
            if (duel.challengerId === userId || duel.opponentId === userId) {
                 const isChallenger = duel.challengerId === userId;
                 const newProgress = isChallenger ? duel.challengerProgress + amount : duel.opponentProgress + amount;
                 const updateData: any = {};
                 if (isChallenger) updateData.challengerProgress = newProgress; else updateData.opponentProgress = newProgress;
                 if (newProgress >= duel.targetAmount) { updateData.status = 'finished'; updateData.winnerId = userId; }
                 await updateDoc(duelRef, updateData);
            }
        });
    } catch (e) { console.error("Error updating duel progress", e); }
};

// --- TERRITORY & ADMIN FUNCTIONS UPDATED ---

export const createTerritory = async (name: string, lat: number, lng: number, radius: number) => {
    if (!db) return;
    try {
        await addDoc(collection(db, "territories"), {
            name, lat, lng, radius,
            ownerKillCount: 0,
            enemies: [] // Starts empty
        });
    } catch (e) { console.error("Error creating territory", e); }
};

export const addEnemyToTerritory = async (territoryId: string, enemy: TerritoryEnemyTemplate) => {
    if (!db) return;
    try {
        const tRef = doc(db, "territories", territoryId);
        await updateDoc(tRef, {
            enemies: arrayUnion(enemy)
        });
    } catch (e) { console.error(e); }
};

export const deleteTerritory = async (id: string) => {
    if (!db) return;
    try { await deleteDoc(doc(db, "territories", id)); } catch (e) { console.error(e); }
};

export const subscribeToTerritories = (callback: (list: Territory[]) => void) => {
    if (!db) return () => {};
    const q = query(collection(db, "territories"));
    return onSnapshot(q, (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Territory));
        callback(list);
    });
};

export const getUserTerritoryStats = async (territoryId: string, userId: string): Promise<TerritoryPlayerStats> => {
    if (!db) return { totalKills: 0, enemyProgress: {} };
    try {
        const statsRef = doc(db, "territories", territoryId, "user_progress", userId);
        const snap = await getDoc(statsRef);
        if (snap.exists()) {
            return snap.data() as TerritoryPlayerStats;
        }
    } catch(e) { console.error(e); }
    return { totalKills: 0, enemyProgress: {} };
};

export const attackTerritoryTarget = async (territoryId: string, enemyId: string, amount: number, userId: string, userName: string, userAvatar: string | undefined) => {
    if (!db) return;
    const tRef = doc(db, "territories", territoryId);
    const statsRef = doc(db, "territories", territoryId, "user_progress", userId);

    try {
        await runTransaction(db, async (transaction) => {
            const tDoc = await transaction.get(tRef);
            if (!tDoc.exists()) throw "Territory not found";
            const territory = tDoc.data() as Territory;
            
            const enemyTemplate = territory.enemies.find((e: any) => e.id === enemyId);
            if (!enemyTemplate) throw "Enemy not found in territory";

            const statsDoc = await transaction.get(statsRef);
            let stats = statsDoc.exists() ? (statsDoc.data() as TerritoryPlayerStats) : { totalKills: 0, enemyProgress: {} };

            if (!stats.enemyProgress[enemyId]) {
                stats.enemyProgress[enemyId] = {
                    level: 1,
                    currentProgress: 0,
                    currentTarget: enemyTemplate.baseTarget
                };
            }

            const enemyProgress = stats.enemyProgress[enemyId];
            enemyProgress.currentProgress += amount;
            let enemyDefeated = false;

            if (enemyProgress.currentProgress >= enemyProgress.currentTarget) {
                enemyDefeated = true;
                // Level Up Logic for specific enemy
                enemyProgress.level += 1;
                enemyProgress.currentTarget = Math.floor(enemyProgress.currentTarget * 1.2);
                enemyProgress.currentProgress = 0;
                stats.totalKills += 1;
            }

            // Save stats
            transaction.set(statsRef, stats);

            // Check ownership
            if (stats.totalKills > territory.ownerKillCount) {
                transaction.update(tRef, { 
                    ownerId: userId, 
                    ownerName: userName, 
                    ownerAvatar: userAvatar || '',
                    ownerKillCount: stats.totalKills 
                });
            }
        });
        return true;
    } catch (e) {
        console.error("Error attacking territory", e);
        return false;
    }
};

export const banUser = async (uid: string) => {
    if (!db) return;
    if (!window.confirm("Tem certeza que deseja banir/excluir este usuário permanentemente?")) return;
    try { await deleteDoc(doc(db, "users", uid)); alert("Usuário excluído."); } catch(e) { console.error(e); }
};

export { auth };
