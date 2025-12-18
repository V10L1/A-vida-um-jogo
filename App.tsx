
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, ACTIVITIES, ActivityType, Gender, Attribute, ATTRIBUTE_LABELS, ActivityLog, Guild, ChatMessage, Quest, GameState } from './types';
import { getIcon } from './components/Icons';
import { loginWithGoogle, logoutUser, createGuild, joinGuild, sendMessage, subscribeToGuild, attackBoss, registerWithEmail, loginWithEmail, saveUserDataToCloud } from './firebase';
import { ProgressBar, Modal, RadarChart } from './components/UIElements';
import { useGameState } from './hooks/useGameState';
import { useTimer } from './hooks/useTimer';
import { calculateBmiBonus, calculateXpForNextLevel } from './logic/gameLogic';

const ACTIVITY_CATEGORIES = [
  { id: 'common', label: 'Atividades Comuns', types: ['health'], color: 'text-yellow-400', icon: 'Star' },
  { id: 'physical', label: 'Treino Físico', types: ['fitness'], color: 'text-blue-400', icon: 'Dumbbell' },
  { id: 'combat', label: 'Treino Combate', types: ['combat'], color: 'text-red-400', icon: 'Swords' },
  { id: 'intellect', label: 'Atividades Intelectuais', types: ['intellect'], color: 'text-purple-400', icon: 'Brain' },
  { id: 'social', label: 'Bom-feitor', types: ['social'], color: 'text-emerald-400', icon: 'Heart' },
  { id: 'bad_habit', label: 'Hábitos Nocivos', types: ['bad_habit'], color: 'text-slate-400', icon: 'TriangleAlert' }
];

export default function App() {
  // Fix: Cast useGameState to any to bypass inference issues causing "unknown" type errors in destructuring
  const { user, setUser, gameState, setGameState, currentUser, isSyncing, isOnline, narratorText, loadingAi, showLevelUp, addLog } = useGameState() as any;
  const { timerTimeLeft, isResting, startTimer, stopTimer, addTime } = useTimer();

  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isQuestModalOpen, setIsQuestModalOpen] = useState(false);
  const [isGuildModalOpen, setIsGuildModalOpen] = useState(false);
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  
  const [selectedActivity, setSelectedActivity] = useState<ActivityType | null>(null);
  const [inputAmount, setInputAmount] = useState('');
  const [gymExercise, setGymExercise] = useState('');
  const [gymWeight, setGymWeight] = useState('');
  const [gymReps, setGymReps] = useState('');
  const [gymRestTime, setGymRestTime] = useState('02:00');
  const [runDistance, setRunDistance] = useState('');
  const [runDuration, setRunDuration] = useState('');
  const [targetTool, setTargetTool] = useState('');
  const [targetDistance, setTargetDistance] = useState('');
  const [targetHits, setTargetHits] = useState({ center: 0, c1: 0, c2: 0, c3: 0, outer: 0 });
  
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  
  const [guildInputId, setGuildInputId] = useState('');
  const [guildCreateName, setGuildCreateName] = useState('');
  const [currentGuild, setCurrentGuild] = useState<Guild | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');

  const xpNeeded = calculateXpForNextLevel(gameState.level);

  // Guild Subscription
  useEffect(() => {
    if (gameState.guildId && isOnline) {
      const unsub = subscribeToGuild(gameState.guildId, (guild, msgs) => {
        if (guild) setCurrentGuild(guild);
        if (msgs) setChatMessages(msgs);
      });
      return () => unsub();
    }
  }, [gameState.guildId, isOnline]);

  const handleLogActivity = () => {
    if (!selectedActivity || !user) return;
    if (selectedActivity.id === 'gym' && timerTimeLeft > 0) {
        alert("Aguarde o cronômetro zerar ou cancele o descanso.");
        return;
    }

    let amount = Number(inputAmount) || 1;
    let xpGained = Math.floor(amount * selectedActivity.xpPerUnit);
    let details: any = undefined;
    const newAttrs = { ...gameState.attributes };

    if (selectedActivity.id === 'gym') {
        const reps = Number(gymReps) || 0;
        const weight = Number(gymWeight) || 10;
        xpGained = Math.floor((weight * reps) / 5) + 5;
        details = { exercise: gymExercise, weight, reps };
        const attrPoints = Math.ceil(xpGained / 5);
        if (reps <= 6) { newAttrs.STR += attrPoints; newAttrs.END += Math.ceil(attrPoints * 0.5); }
        else if (reps >= 7 && reps <= 9) { newAttrs.STR += Math.ceil(attrPoints * 0.7); newAttrs.END += Math.ceil(attrPoints * 0.7); }
        else { newAttrs.END += attrPoints; newAttrs.STR += Math.ceil(attrPoints * 0.5); }
        const [m, s] = gymRestTime.split(':').map(Number);
        if (m*60+s > 0) startTimer(m*60+s);
    } else if (selectedActivity.id === 'run') {
        const dist = Number(runDistance) || 0;
        const [mStr, sStr] = runDuration.split(':');
        const m = Number(mStr) || 0;
        const s = Number(sStr) || 0;
        const totalMinutes = m + (s/60);
        const pace = dist > 0 ? totalMinutes / dist : 0;
        let mult = pace <= 3.75 ? 1.5 : pace <= 4.5 ? 1.2 : 1;
        xpGained = Math.floor(dist * 30 * mult);
        details = { distance: dist, duration: runDuration, pace: dist > 0 ? `${Math.floor(pace)}:${Math.round((pace-Math.floor(pace))*60).toString().padStart(2, '0')}/km` : '0:00/km' };
        newAttrs.VIG += Math.ceil(dist * mult);
    } else if (['shooting', 'archery', 'knife_throw'].includes(selectedActivity.id)) {
        details = { weapon: targetTool, distance: Number(targetDistance), hits: { ...targetHits } };
        if (selectedActivity.primaryAttribute) newAttrs[selectedActivity.primaryAttribute] += 5;
    } else {
        if (selectedActivity.primaryAttribute) newAttrs[selectedActivity.primaryAttribute] += Math.ceil(amount);
    }

    addLog({
      id: Date.now().toString(),
      activityId: selectedActivity.id,
      amount, xpGained, timestamp: Date.now(), details
    }, newAttrs);

    if (selectedActivity.id !== 'gym') setIsActivityModalOpen(false);
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const weight = Number(formData.get('weight'));
    const height = Number(formData.get('height'));
    try {
        const firebaseUser = await registerWithEmail(authEmail, authPassword);
        const newUser: UserProfile = {
            name: formData.get('name') as string,
            dob: formData.get('dob') as string,
            weight, height,
            gender: formData.get('gender') as Gender,
            profession: formData.get('profession') as string
        };
        const bmiBonus = calculateBmiBonus(weight, height);
        const initialAttrs = { STR: 0, END: bmiBonus, VIG: 0, AGI: 0, DEX: 0, INT: 0, CHA: 0, DRV: 0 };
        setUser(newUser);
        // Fix: Explicitly type prev as GameState to avoid unknown property errors
        setGameState((prev: GameState) => ({ ...prev, attributes: initialAttrs }));
        await saveUserDataToCloud(firebaseUser.uid, newUser, { ...gameState, attributes: initialAttrs });
    } catch (e: any) { alert(e.message); }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
        <div className="w-full max-w-md bg-slate-900/80 p-6 rounded-2xl shadow-xl border border-slate-800 backdrop-blur-sm">
            <div className="flex border-b border-slate-700 mb-6">
                <button onClick={() => setAuthView('login')} className={`flex-1 pb-2 font-bold ${authView === 'login' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500'}`}>LOGIN</button>
                <button onClick={() => setAuthView('register')} className={`flex-1 pb-2 font-bold ${authView === 'register' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500'}`}>NOVA JORNADA</button>
            </div>
            {authView === 'login' ? (
                <form onSubmit={(e) => { e.preventDefault(); loginWithEmail(authEmail, authPassword); }} className="space-y-4">
                    <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white" placeholder="E-mail" />
                    <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white" placeholder="Senha" />
                    <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl">Entrar</button>
                    <button type="button" onClick={loginWithGoogle} className="w-full bg-slate-800 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2">{getIcon("User", "w-4 h-4")} Google</button>
                </form>
            ) : (
                <form onSubmit={handleRegister} className="space-y-4">
                    <input name="name" placeholder="Nome Herói" required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2" />
                    <div className="grid grid-cols-2 gap-2">
                        <input type="number" name="weight" placeholder="Peso" step="0.1" required className="bg-slate-950 border border-slate-700 p-2 rounded" />
                        <input type="number" name="height" placeholder="Altura" required className="bg-slate-950 border border-slate-700 p-2 rounded" />
                    </div>
                    <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded p-2" placeholder="E-mail" />
                    <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded p-2" placeholder="Senha" />
                    <input type="password" value={authConfirmPassword} onChange={e => setAuthConfirmPassword(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded p-2" placeholder="Confirmar Senha" />
                    <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl">Criar Personagem</button>
                </form>
            )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-24 md:pb-6 relative overflow-hidden">
      {showLevelUp && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md animate-fade-in text-center">
          <h2 className="text-6xl font-black text-yellow-400">LEVEL UP! {gameState.level}</h2>
        </div>
      )}

      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40 p-4" onClick={() => setIsProfileModalOpen(true)}>
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full border-2 border-slate-700 bg-slate-800 overflow-hidden">
              <img src={user.avatarImage || `https://api.dicebear.com/9.x/micah/svg?seed=${user.name}`} className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="font-bold">{user.name}</h1>
              <span className="text-xs text-blue-400 font-bold uppercase">{gameState.classTitle}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-yellow-400 leading-none">{gameState.level}</div>
            <div className="text-[10px] text-slate-500 uppercase">Nível</div>
          </div>
        </div>
        <div className="max-w-2xl mx-auto mt-4">
          <ProgressBar current={gameState.currentXp} max={xpNeeded} color="bg-gradient-to-r from-blue-500 to-indigo-400" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-6">
        <div className="bg-slate-800/40 border border-slate-700 p-4 rounded-xl flex gap-3 italic text-sm">
          {getIcon("Brain", "w-6 h-6 text-blue-400")} "{narratorText}"
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {ACTIVITY_CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => { setSelectedActivity(ACTIVITIES.find(a => cat.types.includes(a.category)) || null); setIsActivityModalOpen(true); }} className="p-4 bg-slate-800/60 rounded-xl border border-slate-700 flex flex-col items-center gap-2">
              <div className={cat.color}>{getIcon(cat.icon)}</div>
              <span className="text-xs font-bold uppercase">{cat.label}</span>
            </button>
          ))}
        </div>

        <div className="flex justify-between items-center text-slate-400 px-2">
            <button onClick={() => setIsQuestModalOpen(true)} className="flex items-center gap-2 text-xs font-bold bg-slate-800 p-2 rounded-lg border border-slate-700">{getIcon("Scroll", "w-4 h-4")} QUESTS</button>
            <button onClick={() => setIsGuildModalOpen(true)} className="flex items-center gap-2 text-xs font-bold bg-slate-800 p-2 rounded-lg border border-slate-700">{getIcon("Shield", "w-4 h-4")} CLÃ</button>
            <button onClick={logoutUser} className="flex items-center gap-2 text-xs font-bold bg-red-900/20 text-red-400 p-2 rounded-lg border border-red-900/50">{getIcon("LogOut", "w-4 h-4")} SAIR</button>
        </div>
      </main>

      <Modal isOpen={isActivityModalOpen} onClose={() => setIsActivityModalOpen(false)} title={selectedActivity?.label || 'Registrar'}>
        {selectedActivity?.id === 'gym' && isResting ? (
             <div className="text-center py-6 space-y-6">
                 <div className="text-6xl font-black tabular-nums">{Math.floor(timerTimeLeft/60)}:{(timerTimeLeft%60).toString().padStart(2, '0')}</div>
                 <div className="flex gap-4 justify-center">
                     <button onClick={stopTimer} className="bg-red-900/50 text-red-200 px-6 py-2 rounded-xl font-bold">PULAR</button>
                     <button onClick={() => addTime(30)} className="bg-blue-900/50 text-blue-200 px-6 py-2 rounded-xl font-bold">+30s</button>
                 </div>
             </div>
        ) : (
          <div className="space-y-4">
            {selectedActivity?.id === 'gym' ? (
                <div className="space-y-4">
                    <input value={gymExercise} onChange={e => setGymExercise(e.target.value)} placeholder="Exercício" className="w-full bg-slate-950 border border-slate-700 p-3 rounded-lg" />
                    <div className="grid grid-cols-2 gap-2">
                        <input type="number" value={gymWeight} onChange={e => setGymWeight(e.target.value)} placeholder="Carga (kg)" className="bg-slate-950 border border-slate-700 p-3 rounded-lg" />
                        <input type="number" value={gymReps} onChange={e => setGymReps(e.target.value)} placeholder="Reps" className="bg-slate-950 border border-slate-700 p-3 rounded-lg" />
                    </div>
                </div>
            ) : selectedActivity?.id === 'run' ? (
                <div className="space-y-4">
                  <input type="number" value={runDistance} onChange={e => setRunDistance(e.target.value)} className="w-full bg-slate-950 border border-slate-700 p-4 text-center rounded-lg" placeholder="Distância (km)" />
                  <input type="text" value={runDuration} onChange={e => setRunDuration(e.target.value)} className="w-full bg-slate-950 border border-slate-700 p-4 text-center rounded-lg" placeholder="Tempo (MM:SS)" />
                </div>
            ) : (
                <input type="number" value={inputAmount} onChange={e => setInputAmount(e.target.value)} className="w-full bg-slate-950 border border-slate-700 p-4 text-2xl text-center rounded-lg" placeholder="Quantidade" />
            )}
            <button onClick={handleLogActivity} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl">CONFIRMAR</button>
          </div>
        )}
      </Modal>

      <Modal isOpen={isQuestModalOpen} onClose={() => setIsQuestModalOpen(false)} title="Mural de Missões">
          <div className="space-y-4">
              {gameState.quests.map(q => {
                  const act = ACTIVITIES.find(a => a.id === q.activityId);
                  return (
                      <div key={q.id} className="bg-slate-800 p-3 rounded-lg border border-slate-700">
                          <div className="flex justify-between items-center mb-1">
                              <span className="text-xs font-bold uppercase text-blue-400">{q.type === 'daily' ? 'Diária' : 'Semanal'}</span>
                              <span className="text-xs font-bold text-yellow-500">+{q.xpReward} XP</span>
                          </div>
                          <div className="text-sm font-bold">{act?.label}</div>
                          <div className="flex items-center gap-2 mt-2">
                              <div className="flex-1 bg-slate-950 rounded-full h-2 overflow-hidden">
                                  <div className="bg-emerald-500 h-full transition-all" style={{ width: `${(q.currentAmount / q.targetAmount) * 100}%` }}></div>
                              </div>
                              <span className="text-[10px] text-slate-400 whitespace-nowrap">{q.currentAmount} / {q.targetAmount} {act?.unit}</span>
                          </div>
                      </div>
                  );
              })}
          </div>
      </Modal>

      <Modal isOpen={isGuildModalOpen} onClose={() => setIsGuildModalOpen(false)} title="Santuário do Clã">
          {!gameState.guildId ? (
              <div className="space-y-4">
                  <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-4">
                      <h4 className="font-bold text-center">Fundar Novo Clã</h4>
                      <input value={guildCreateName} onChange={e => setGuildCreateName(e.target.value)} placeholder="Nome do Clã" className="w-full bg-slate-950 border border-slate-700 p-3 rounded-lg" />
                      <button onClick={async () => {
                          const gid = await createGuild(guildCreateName, currentUser!.uid, user!.name, user!.avatarImage, gameState.classTitle, gameState.level);
                          // Fix: Explicitly type p as GameState and ensure it isn't unknown
                          if (gid) setGameState((p: GameState) => ({ ...p, guildId: gid }));
                      }} className="w-full bg-emerald-600 font-bold py-3 rounded-xl">CRIAR CLÃ</button>
                  </div>
                  <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-4">
                      <h4 className="font-bold text-center">Entrar em Clã</h4>
                      <input value={guildInputId} onChange={e => setGuildInputId(e.target.value)} placeholder="ID do Clã" className="w-full bg-slate-950 border border-slate-700 p-3 rounded-lg" />
                      <button onClick={async () => {
                          const success = await joinGuild(guildInputId, currentUser!.uid, user!.name, user!.avatarImage, gameState.classTitle, gameState.level);
                          // Fix: Explicitly type p as GameState and ensure it isn't unknown
                          if (success) setGameState((p: GameState) => ({ ...p, guildId: guildInputId }));
                      }} className="w-full bg-blue-600 font-bold py-3 rounded-xl">ENTRAR</button>
                  </div>
              </div>
          ) : (
              <div className="space-y-4">
                  <div className="text-center">
                      <h2 className="text-xl font-bold text-blue-400">{currentGuild?.name}</h2>
                      <p className="text-[10px] text-slate-500 uppercase">ID: {gameState.guildId}</p>
                  </div>
                  <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold uppercase">Membros</span>
                        <span className="text-xs text-slate-400">{Object.keys(currentGuild?.members || {}).length}</span>
                      </div>
                      <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                          {Object.values(currentGuild?.members || {}).map(m => (
                              <div key={m.uid} className="flex items-center gap-2 bg-slate-950 p-2 rounded-lg">
                                  <div className="w-6 h-6 bg-slate-800 rounded-full border border-slate-700"></div>
                                  <div className="flex-1 text-xs font-bold">{m.name}</div>
                                  <div className="text-[10px] text-blue-400">LVL {m.level}</div>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          )}
      </Modal>

      <Modal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} title="Ficha do Herói" large>
          <div className="space-y-6">
              <div className="flex justify-center"><RadarChart attributes={gameState.attributes} /></div>
              <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="bg-slate-800 p-3 rounded-lg">
                      <div className="text-xs text-slate-500 uppercase">XP Total</div>
                      <div className="text-xl font-bold">{gameState.totalXp.toLocaleString()}</div>
                  </div>
                  <div className="bg-slate-800 p-3 rounded-lg">
                      <div className="text-xs text-slate-500 uppercase">Atributos</div>
                      <div className="text-xl font-bold">{(Object.values(gameState.attributes) as number[]).reduce((a: number, b: number) => a + b, 0)}</div>
                  </div>
              </div>
          </div>
      </Modal>
    </div>
  );
}
