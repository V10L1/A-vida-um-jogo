
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, ACTIVITIES, ActivityType, Gender, Attribute, ATTRIBUTE_LABELS, ActivityLog, Guild, GuildMember, ChatMessage, Quest, GameState } from './types';
import { getIcon } from './components/Icons';
import { loginWithGoogle, logoutUser, createGuild, joinGuild, sendMessage, subscribeToGuild, attackBoss, registerWithEmail, loginWithEmail, saveUserDataToCloud, checkRedirectResult } from './firebase';
import { ProgressBar, Modal, RadarChart } from './components/UIElements';
import { useGameState } from './hooks/useGameState';
import { useTimer } from './hooks/useTimer';
import { calculateBmiBonus, calculateXpForNextLevel } from './logic/gameLogic';

const ACTIVITY_CATEGORIES = [
  { id: 'common', label: 'Saúde & Hábitos', types: ['health'], color: 'text-yellow-400', icon: 'Star' },
  { id: 'physical', label: 'Treino Físico', types: ['fitness'], color: 'text-blue-400', icon: 'Dumbbell' },
  { id: 'combat', label: 'Treino Combate', types: ['combat'], color: 'text-red-400', icon: 'Swords' },
  { id: 'intellect', label: 'Mente & Estudo', types: ['intellect'], color: 'text-purple-400', icon: 'Brain' },
  { id: 'social', label: 'Social & Carisma', types: ['social'], color: 'text-emerald-400', icon: 'Heart' },
  { id: 'bad_habit', label: 'Vícios', types: ['bad_habit'], color: 'text-slate-400', icon: 'TriangleAlert' }
];

export default function App() {
  const { user, setUser, gameState, setGameState, currentUser, isSyncing, isOnline, narratorText, loadingAi, showLevelUp, addLog } = useGameState() as any;
  const { timerTimeLeft, isResting, startTimer, stopTimer, addTime } = useTimer();

  // UI States
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isQuestModalOpen, setIsQuestModalOpen] = useState(false);
  const [isGuildModalOpen, setIsGuildModalOpen] = useState(false);
  const [currentCategory, setCurrentCategory] = useState<string | null>(null);
  const [guildTab, setGuildTab] = useState<'info' | 'chat' | 'raid'>('info');
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  
  // Activity Inputs
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
  const [bedTime, setBedTime] = useState('22:00');
  const [wakeTime, setWakeTime] = useState('06:00');

  // Auth/Guild States
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [guildInputId, setGuildInputId] = useState('');
  const [guildCreateName, setGuildCreateName] = useState('');
  const [currentGuild, setCurrentGuild] = useState<Guild | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const xpNeeded = calculateXpForNextLevel(gameState.level);

  // Verificar redirecionamento do Google no carregamento
  useEffect(() => {
    checkRedirectResult().then(u => {
      if (u) {
          console.log("Login via Google detectado com sucesso!");
      }
    });
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Guild Realtime Subscription
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
    
    let amount = Number(inputAmount) || 1;
    let xpGained = Math.floor(amount * selectedActivity.xpPerUnit);
    let details: any = undefined;
    const newAttrs = { ...gameState.attributes };

    if (selectedActivity.id === 'gym') {
        const reps = Number(gymReps) || 0;
        const weight = Number(gymWeight) || 10;
        xpGained = Math.floor((weight * reps) / 5) + 5;
        details = { exercise: gymExercise, weight, reps };
        const attrPoints = Math.ceil(xpGained / 10);
        if (reps <= 6) { newAttrs.STR += attrPoints; newAttrs.END += Math.ceil(attrPoints * 0.5); }
        else if (reps >= 7 && reps <= 9) { newAttrs.STR += Math.ceil(attrPoints * 0.7); newAttrs.END += Math.ceil(attrPoints * 0.7); }
        else { newAttrs.END += attrPoints; newAttrs.STR += Math.ceil(attrPoints * 0.5); }
        const [m, s] = gymRestTime.split(':').map(Number);
        if (m*60+s > 0) startTimer(m*60+s);
    } else if (selectedActivity.id === 'run' || selectedActivity.id === 'bike') {
        const dist = Number(runDistance) || 0;
        const [mStr, sStr] = runDuration.split(':');
        const m = Number(mStr) || 0;
        const s = Number(sStr) || 0;
        const totalMinutes = m + (s/60);
        const pace = dist > 0 ? totalMinutes / dist : 0;
        let mult = pace <= 4 ? 1.5 : pace <= 5.5 ? 1.2 : 1;
        xpGained = Math.floor(dist * (selectedActivity.id === 'run' ? 30 : 15) * mult);
        details = { distance: dist, duration: runDuration, pace: dist > 0 ? `${Math.floor(pace)}:${Math.round((pace-Math.floor(pace))*60).toString().padStart(2, '0')}/km` : '0:00/km' };
        newAttrs.VIG += Math.ceil(dist * (selectedActivity.id === 'run' ? 1 : 0.5));
    } else if (['shooting', 'archery', 'knife_throw'].includes(selectedActivity.id)) {
        const hitsCount = targetHits.center * 10 + targetHits.c1 * 7 + targetHits.c2 * 5 + targetHits.c3 * 3 + targetHits.outer * 1;
        xpGained = hitsCount * 2;
        details = { weapon: targetTool, distance: Number(targetDistance), hits: { ...targetHits } };
        newAttrs.DEX += Math.ceil(hitsCount / 20);
    } else if (selectedActivity.id === 'sleep') {
        xpGained = 50;
        details = { bedTime, wakeTime };
        newAttrs.END += 1;
    } else {
        if (selectedActivity.primaryAttribute) newAttrs[selectedActivity.primaryAttribute] += Math.ceil(amount / 5);
    }

    addLog({
      id: Date.now().toString(),
      activityId: selectedActivity.id,
      amount: amount || 1, 
      xpGained, 
      timestamp: Date.now(), 
      details
    }, newAttrs);

    if (selectedActivity.id !== 'gym') {
      setIsActivityModalOpen(false);
      setSelectedActivity(null);
      setInputAmount('');
      setRunDistance('');
      setRunDuration('');
    }
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const weight = Number(formData.get('weight'));
    const height = Number(formData.get('height'));
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (password !== confirmPassword) {
        alert("As senhas não coincidem!");
        return;
    }

    try {
        const firebaseUser = await registerWithEmail(authEmail, password);
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
        setGameState((prev: GameState) => ({ ...prev, attributes: initialAttrs }));
        await saveUserDataToCloud(firebaseUser.user.uid, newUser, { ...gameState, attributes: initialAttrs });
    } catch (e: any) { alert(e.message); }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black">
        <div className="w-full max-w-md bg-slate-900/40 p-1 rounded-3xl shadow-2xl border border-white/5 backdrop-blur-xl animate-fade-in-up">
            <div className="p-6">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-black text-white tracking-tighter italic uppercase">Life<span className="text-blue-500">RPG</span></h1>
                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">Sua vida. Sua lenda. Seu jogo.</p>
                </div>

                <div className="flex bg-slate-950/50 p-1 rounded-2xl mb-8 border border-white/5">
                    <button onClick={() => setAuthView('login')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${authView === 'login' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>ENTRAR</button>
                    <button onClick={() => setAuthView('register')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${authView === 'register' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>CRIAR HERÓI</button>
                </div>

                {authView === 'login' ? (
                    <form onSubmit={(e) => { e.preventDefault(); loginWithEmail(authEmail, authPassword); }} className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-[9px] text-slate-500 font-black uppercase ml-2 tracking-widest">E-mail</label>
                            <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required className="w-full bg-slate-950 border border-white/5 rounded-2xl p-4 text-white focus:border-blue-500 outline-none transition-all shadow-inner" placeholder="heroi@liferpg.com" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] text-slate-500 font-black uppercase ml-2 tracking-widest">Senha</label>
                            <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required className="w-full bg-slate-950 border border-white/5 rounded-2xl p-4 text-white focus:border-blue-500 outline-none transition-all shadow-inner" placeholder="••••••••" />
                        </div>
                        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-2xl shadow-xl transition-all uppercase tracking-widest text-sm active:scale-95 border-b-4 border-blue-800">ACESSAR PORTAL</button>
                        
                        <div className="relative py-4">
                            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5"></div></div>
                            <div className="relative flex justify-center text-[8px] uppercase font-black tracking-widest"><span className="bg-[#0b101b] px-3 text-slate-600">Ou use sua conta</span></div>
                        </div>

                        <button type="button" onClick={loginWithGoogle} className="w-full bg-white/5 hover:bg-white/10 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-3 transition-all border border-white/10">
                            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" />
                            <span className="text-[10px] uppercase tracking-widest">Entrar com Google</span>
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleRegister} className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                        <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-1">
                                <label className="text-[9px] text-slate-500 font-black uppercase ml-2 tracking-widest">Codinome do Herói</label>
                                <input name="name" required className="w-full bg-slate-950 border border-white/5 rounded-2xl p-4 text-white outline-none focus:border-blue-500 shadow-inner" placeholder="Ex: Arthur Morgan" />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[9px] text-slate-500 font-black uppercase ml-2 tracking-widest">Peso (kg)</label>
                                    <input type="number" name="weight" step="0.1" required className="w-full bg-slate-950 border border-white/5 rounded-2xl p-4 text-white outline-none focus:border-blue-500 shadow-inner" placeholder="00.0" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] text-slate-500 font-black uppercase ml-2 tracking-widest">Altura (cm)</label>
                                    <input type="number" name="height" required className="w-full bg-slate-950 border border-white/5 rounded-2xl p-4 text-white outline-none focus:border-blue-500 shadow-inner" placeholder="180" />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] text-slate-500 font-black uppercase ml-2 tracking-widest">Nascimento</label>
                                <input type="date" name="dob" required className="w-full bg-slate-950 border border-white/5 rounded-2xl p-4 text-white outline-none focus:border-blue-500 shadow-inner" />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] text-slate-500 font-black uppercase ml-2 tracking-widest">Gênero</label>
                                <select name="gender" className="w-full bg-slate-950 border border-white/5 rounded-2xl p-4 text-white outline-none focus:border-blue-500 shadow-inner appearance-none">
                                    <option value="Masculino">Masculino</option>
                                    <option value="Feminino">Feminino</option>
                                    <option value="Outros">Outros</option>
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] text-slate-500 font-black uppercase ml-2 tracking-widest">Profissão / Arquétipo</label>
                                <input name="profession" required className="w-full bg-slate-950 border border-white/5 rounded-2xl p-4 text-white outline-none focus:border-blue-500 shadow-inner" placeholder="Ex: Desenvolvedor de Software" />
                            </div>

                            <div className="space-y-1 border-t border-white/5 pt-4">
                                <label className="text-[9px] text-slate-500 font-black uppercase ml-2 tracking-widest">E-mail de Login</label>
                                <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required className="w-full bg-slate-950 border border-white/5 rounded-2xl p-4 text-white focus:border-blue-500 outline-none shadow-inner" placeholder="heroi@liferpg.com" />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[9px] text-slate-500 font-black uppercase ml-2 tracking-widest">Senha</label>
                                    <input type="password" name="password" required className="w-full bg-slate-950 border border-white/5 rounded-2xl p-4 text-white focus:border-blue-500 outline-none shadow-inner" placeholder="••••••••" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] text-slate-500 font-black uppercase ml-2 tracking-widest">Confirmar</label>
                                    <input type="password" name="confirmPassword" required className="w-full bg-slate-950 border border-white/5 rounded-2xl p-4 text-white focus:border-blue-500 outline-none shadow-inner" placeholder="••••••••" />
                                </div>
                            </div>

                            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-2xl shadow-xl transition-all uppercase tracking-widest text-sm mt-4 active:scale-95 border-b-4 border-blue-800">INICIAR JORNADA</button>
                        </div>
                    </form>
                )}
            </div>
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
            <div className="w-12 h-12 rounded-full border-2 border-blue-500 bg-slate-800 overflow-hidden shadow-[0_0_15px_rgba(59,130,246,0.5)]">
              <img src={user.avatarImage || `https://api.dicebear.com/9.x/micah/svg?seed=${user.name}`} className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="font-bold">{user.name}</h1>
              <span className="text-[10px] bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{gameState.classTitle}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-yellow-400 leading-none">{gameState.level}</div>
            <div className="text-[10px] text-slate-500 uppercase">Nível</div>
          </div>
        </div>
        <div className="max-w-2xl mx-auto mt-4 px-2">
          <ProgressBar current={gameState.currentXp} max={xpNeeded} color="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-6">
        <div className="bg-slate-800/40 border border-slate-700 p-4 rounded-xl flex gap-3 items-start shadow-lg">
          <div className="p-2 bg-blue-500/10 rounded-lg">{getIcon("Brain", "w-6 h-6 text-blue-400")}</div>
          <div className="flex-1">
            <p className="text-sm italic text-slate-300 leading-relaxed">"{narratorText}"</p>
            {loadingAi && <div className="text-[10px] text-blue-400 animate-pulse mt-1 uppercase font-bold">O Narrador está observando...</div>}
          </div>
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {ACTIVITY_CATEGORIES.map(cat => (
            <button key={cat.id} 
              onClick={() => { 
                setCurrentCategory(cat.id);
                setSelectedActivity(null); 
                setIsActivityModalOpen(true); 
              }} 
              className="p-5 bg-slate-800/60 rounded-2xl border border-slate-700 flex flex-col items-center gap-2 hover:bg-slate-800 transition-all group active:scale-95 shadow-lg"
            >
              <div className={`${cat.color} group-hover:scale-110 transition-transform`}>{getIcon(cat.icon, "w-8 h-8")}</div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-white transition-colors text-center">{cat.label}</span>
            </button>
          ))}
        </div>

        {/* Utility Buttons */}
        <div className="flex justify-between items-center text-slate-400 px-2">
            <button onClick={() => setIsQuestModalOpen(true)} className="flex items-center gap-2 text-xs font-bold bg-slate-800 p-3 rounded-xl border border-slate-700 hover:border-blue-500 transition-all active:scale-95 shadow-md">
                {getIcon("Scroll", "w-4 h-4")} MISSÕES
            </button>
            <button onClick={() => setIsGuildModalOpen(true)} className="flex items-center gap-2 text-xs font-bold bg-slate-800 p-3 rounded-xl border border-slate-700 hover:border-blue-500 transition-all active:scale-95 shadow-md">
                {getIcon("Shield", "w-4 h-4")} CLÃ
            </button>
            <button onClick={logoutUser} className="flex items-center gap-2 text-xs font-bold bg-red-900/20 text-red-400 p-3 rounded-xl border border-red-900/50 hover:bg-red-900/40 transition-all active:scale-95 shadow-md">
                {getIcon("LogOut", "w-4 h-4")} SAIR
            </button>
        </div>
      </main>

      {/* Activity Registration Modal */}
      <Modal isOpen={isActivityModalOpen} onClose={() => setIsActivityModalOpen(false)} title={selectedActivity ? selectedActivity.label : "Selecione a Atividade"}>
        {!selectedActivity ? (
            <div className="grid grid-cols-1 gap-2 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {ACTIVITIES
                  .filter(act => !currentCategory || ACTIVITY_CATEGORIES.find(c => c.id === currentCategory)?.types.includes(act.category))
                  .map(act => (
                    <button key={act.id} onClick={() => setSelectedActivity(act)} className="flex items-center gap-4 p-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition-colors group">
                        <div className="text-blue-400 group-hover:scale-110 transition-transform">{getIcon(act.icon, "w-6 h-6")}</div>
                        <div className="text-left flex-1">
                            <div className="text-sm font-bold">{act.label}</div>
                            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">+{act.xpPerUnit} XP por {act.unit}</div>
                        </div>
                        {getIcon("ChevronRight", "w-4 h-4 text-slate-600")}
                    </button>
                ))}
            </div>
        ) : isResting ? (
             <div className="text-center py-6 space-y-6">
                 <div className="text-xs text-slate-400 uppercase font-black tracking-widest">Tempo de Descanso</div>
                 <div className="text-7xl font-black tabular-nums text-blue-400 drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]">
                    {Math.floor(timerTimeLeft/60)}:{(timerTimeLeft%60).toString().padStart(2, '0')}
                 </div>
                 <div className="flex gap-4 justify-center">
                     <button onClick={stopTimer} className="bg-red-900/30 text-red-400 border border-red-900/50 px-6 py-2 rounded-xl font-bold hover:bg-red-900/50 transition-colors">PULAR</button>
                     <button onClick={() => addTime(30)} className="bg-blue-900/30 text-blue-400 border border-blue-900/50 px-6 py-2 rounded-xl font-bold hover:bg-blue-900/50 transition-colors">+30s</button>
                 </div>
             </div>
        ) : (
          <div className="space-y-4">
            <button onClick={() => setSelectedActivity(null)} className="text-[10px] text-blue-400 font-bold uppercase mb-2 flex items-center gap-1 group">
                <span className="group-hover:-translate-x-1 transition-transform">←</span> Voltar para lista
            </button>
            
            {selectedActivity.id === 'gym' ? (
                <div className="space-y-3">
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 ml-2 font-bold uppercase">Nome do Exercício</label>
                        <input value={gymExercise} onChange={e => setGymExercise(e.target.value)} placeholder="Ex: Supino Reto" className="w-full bg-slate-950 border border-slate-700 p-3 rounded-xl focus:border-blue-500 outline-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-[10px] text-slate-500 ml-2 font-bold uppercase">Carga (kg)</label>
                            <input type="number" value={gymWeight} onChange={e => setGymWeight(e.target.value)} className="w-full bg-slate-950 border border-slate-700 p-3 rounded-xl focus:border-blue-500 outline-none" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] text-slate-500 ml-2 font-bold uppercase">Reps</label>
                            <input type="number" value={gymReps} onChange={e => setGymReps(e.target.value)} className="w-full bg-slate-950 border border-slate-700 p-3 rounded-xl focus:border-blue-500 outline-none" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 ml-2 font-bold uppercase">Tempo de Descanso</label>
                        <select value={gymRestTime} onChange={e => setGymRestTime(e.target.value)} className="w-full bg-slate-950 border border-slate-700 p-3 rounded-xl focus:border-blue-500 outline-none appearance-none">
                            <option value="00:45">45 segundos</option>
                            <option value="01:00">1 minuto</option>
                            <option value="01:30">1:30 min</option>
                            <option value="02:00">2 minutos</option>
                            <option value="03:00">3 minutos</option>
                        </select>
                    </div>
                </div>
            ) : selectedActivity.id === 'run' || selectedActivity.id === 'bike' ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 ml-2 font-bold uppercase">Distância total (km)</label>
                      <input type="number" value={runDistance} onChange={e => setRunDistance(e.target.value)} className="w-full bg-slate-950 border border-slate-700 p-4 text-center text-xl rounded-xl font-black" />
                  </div>
                  <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 ml-2 font-bold uppercase">Tempo Total (MM:SS)</label>
                      <input type="text" value={runDuration} onChange={e => setRunDuration(e.target.value)} className="w-full bg-slate-950 border border-slate-700 p-4 text-center text-xl rounded-xl font-black" placeholder="25:30" />
                  </div>
                </div>
            ) : ['shooting', 'archery', 'knife_throw'].includes(selectedActivity.id) ? (
                <div className="space-y-3">
                  <input value={targetTool} onChange={e => setTargetTool(e.target.value)} placeholder="Armamento Utilizado" className="w-full bg-slate-950 border border-slate-700 p-3 rounded-xl" />
                  <input type="number" value={targetDistance} onChange={e => setTargetDistance(e.target.value)} placeholder="Distância do Alvo (m)" className="w-full bg-slate-950 border border-slate-700 p-3 rounded-xl" />
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase font-black mb-4 text-center tracking-widest">Grade de Acertos</div>
                    <div className="grid grid-cols-5 gap-2">
                        {['center', 'c1', 'c2', 'c3', 'outer'].map(k => (
                            <div key={k} className="flex flex-col items-center gap-1">
                                <span className="text-[9px] text-slate-500 uppercase font-black">{k === 'center' ? 'Centro' : k.toUpperCase()}</span>
                                <input type="number" value={(targetHits as any)[k]} onChange={e => setTargetHits({...targetHits, [k]: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 p-2 text-center rounded-lg text-sm font-bold" />
                            </div>
                        ))}
                    </div>
                  </div>
                </div>
            ) : selectedActivity.id === 'sleep' ? (
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1 text-center">
                        <label className="text-[10px] text-slate-500 font-bold uppercase">Dormiu às</label>
                        <input type="time" value={bedTime} onChange={e => setBedTime(e.target.value)} className="w-full bg-slate-950 border border-slate-700 p-4 rounded-xl text-center font-black" />
                    </div>
                    <div className="space-y-1 text-center">
                        <label className="text-[10px] text-slate-500 font-bold uppercase">Acordou às</label>
                        <input type="time" value={wakeTime} onChange={e => setWakeTime(e.target.value)} className="w-full bg-slate-950 border border-slate-700 p-4 rounded-xl text-center font-black" />
                    </div>
                </div>
            ) : (
                <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 ml-2 font-bold uppercase">Quantidade ({selectedActivity.unit})</label>
                    <input type="number" value={inputAmount} onChange={e => setInputAmount(e.target.value)} className="w-full bg-slate-950 border border-slate-700 p-5 text-4xl text-center font-black rounded-2xl" placeholder="0" />
                </div>
            )}
            
            <button 
              onClick={handleLogActivity} 
              disabled={timerTimeLeft > 0 && selectedActivity.id === 'gym'}
              className={`w-full font-black py-5 rounded-2xl flex items-center justify-center gap-2 shadow-xl transition-all uppercase tracking-widest ${timerTimeLeft > 0 && selectedActivity.id === 'gym' ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white active:scale-95'}`}
            >
                {timerTimeLeft > 0 && selectedActivity.id === 'gym' ? `AGUARDE (${Math.floor(timerTimeLeft/60)}:${(timerTimeLeft%60).toString().padStart(2, '0')})` : 'REGISTRAR FEITO'}
            </button>
          </div>
        )}
      </Modal>

      {/* Quest Modal */}
      <Modal isOpen={isQuestModalOpen} onClose={() => setIsQuestModalOpen(false)} title="Mural de Missões">
          <div className="space-y-4">
              {gameState.quests.length === 0 && <p className="text-center text-slate-500 py-10 italic">Nenhuma missão no momento...</p>}
              {gameState.quests.map(q => {
                  const act = ACTIVITIES.find(a => a.id === q.activityId);
                  const progress = Math.min(100, (q.currentAmount / q.targetAmount) * 100);
                  const isDone = q.currentAmount >= q.targetAmount;
                  return (
                      <div key={q.id} className={`bg-slate-800 p-4 rounded-2xl border ${isDone ? 'border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.1)]' : 'border-slate-700'}`}>
                          <div className="flex justify-between items-center mb-1">
                              <div className="flex items-center gap-2">
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${q.type === 'daily' ? 'bg-blue-900/50 text-blue-400' : 'bg-purple-900/50 text-purple-400'}`}>
                                    {q.type === 'daily' ? 'Diária' : 'Semanal'}
                                </span>
                                {isDone && <span className="text-emerald-400">{getIcon("CheckCircle", "w-3 h-3")}</span>}
                              </div>
                              <span className="text-[10px] font-bold text-yellow-500">+{q.xpReward} XP</span>
                          </div>
                          <div className="text-sm font-bold text-slate-200">{act?.label}</div>
                          <div className="flex items-center gap-2 mt-2">
                              <div className="flex-1 bg-slate-950 rounded-full h-1.5 overflow-hidden shadow-inner">
                                  <div className={`h-full transition-all duration-500 ${isDone ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${progress}%` }}></div>
                              </div>
                              <span className="text-[10px] text-slate-400 whitespace-nowrap font-mono">{q.currentAmount} / {q.targetAmount}</span>
                          </div>
                      </div>
                  );
              })}
          </div>
      </Modal>

      {/* Guild Modal with Tabs */}
      <Modal isOpen={isGuildModalOpen} onClose={() => setIsGuildModalOpen(false)} title="Santuário do Clã" large>
          {!gameState.guildId ? (
              <div className="space-y-6">
                  <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 space-y-4 shadow-xl">
                      <div className="flex flex-col items-center gap-2 mb-2">
                        <div className="p-3 bg-emerald-500/10 rounded-full text-emerald-400">{getIcon("Shield", "w-8 h-8")}</div>
                        <h4 className="font-bold text-lg">Fundar Novo Clã</h4>
                      </div>
                      <input value={guildCreateName} onChange={e => setGuildCreateName(e.target.value)} placeholder="Nome da sua Guilda" className="w-full bg-slate-950 border border-slate-700 p-4 rounded-xl focus:border-emerald-500 outline-none font-bold" />
                      <button onClick={async () => {
                          const gid = await createGuild(guildCreateName, currentUser!.uid, user!.name, user!.avatarImage, gameState.classTitle, gameState.level);
                          if (gid) setGameState((p: GameState) => ({ ...p, guildId: gid }));
                      }} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-xl transition-all shadow-lg uppercase tracking-widest">CRIAR CLÃ</button>
                  </div>
                  <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 space-y-4 shadow-xl">
                      <div className="flex flex-col items-center gap-2 mb-2">
                        <div className="p-3 bg-blue-500/10 rounded-full text-blue-400">{getIcon("Users", "w-8 h-8")}</div>
                        <h4 className="font-bold text-lg">Entrar em Clã</h4>
                      </div>
                      <input value={guildInputId} onChange={e => setGuildInputId(e.target.value)} placeholder="ID do Clã" className="w-full bg-slate-950 border border-slate-700 p-4 rounded-xl focus:border-blue-500 outline-none font-bold" />
                      <button onClick={async () => {
                          const success = await joinGuild(guildInputId, currentUser!.uid, user!.name, user!.avatarImage, gameState.classTitle, gameState.level);
                          if (success) setGameState((p: GameState) => ({ ...p, guildId: guildInputId }));
                      }} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl transition-all shadow-lg uppercase tracking-widest">BUSCAR E ENTRAR</button>
                  </div>
              </div>
          ) : (
              <div className="flex flex-col h-[70vh]">
                  <div className="flex border-b border-slate-700 mb-4 bg-slate-900/50 sticky top-0 rounded-t-xl overflow-hidden">
                      <button onClick={() => setGuildTab('info')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-tighter ${guildTab === 'info' ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-800/50' : 'text-slate-500'}`}>MEMBROS</button>
                      <button onClick={() => setGuildTab('chat')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-tighter ${guildTab === 'chat' ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-800/50' : 'text-slate-500'}`}>CHAT</button>
                      <button onClick={() => setGuildTab('raid')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-tighter ${guildTab === 'raid' ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-800/50' : 'text-slate-500'}`}>RAID (BOSS)</button>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar p-2">
                      {guildTab === 'info' && (
                          <div className="space-y-4">
                              <div className="text-center bg-slate-800/50 p-5 rounded-3xl border border-slate-700 shadow-inner">
                                  <h2 className="text-2xl font-black text-blue-400 uppercase italic tracking-wider leading-none">{currentGuild?.name}</h2>
                                  <div className="text-[10px] text-slate-500 font-mono mt-2 select-all cursor-pointer bg-slate-950 p-1 rounded inline-block" onClick={() => { navigator.clipboard.writeText(gameState.guildId!); alert("ID Copiado!"); }}>
                                    ID: {gameState.guildId}
                                  </div>
                              </div>
                              <div className="grid grid-cols-1 gap-2">
                                  {Object.values(currentGuild?.members || {}).map((m: GuildMember) => (
                                      <div key={m.uid} className="flex items-center gap-3 bg-slate-800/80 p-3 rounded-2xl border border-slate-700 shadow-sm">
                                          <div className="w-12 h-12 bg-slate-900 rounded-full border border-blue-900/50 flex items-center justify-center overflow-hidden">
                                            <img src={m.avatar || `https://api.dicebear.com/9.x/micah/svg?seed=${m.name}`} className="w-full h-full object-cover" />
                                          </div>
                                          <div className="flex-1">
                                            <div className="text-sm font-black uppercase flex items-center gap-2">
                                                {m.name} {m.role === 'leader' && <span title="Líder" className="text-yellow-500">👑</span>}
                                            </div>
                                            <div className="text-[9px] text-blue-400 font-bold uppercase tracking-widest">{m.classTitle}</div>
                                          </div>
                                          <div className="text-right">
                                            <div className="text-xs font-black text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">LVL {m.level}</div>
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      )}

                      {guildTab === 'chat' && (
                          <div className="flex flex-col h-full">
                              <div className="flex-1 space-y-3 mb-4 min-h-0 overflow-y-auto">
                                  {chatMessages.length === 0 && <p className="text-center text-slate-600 text-[10px] py-20 font-bold uppercase tracking-widest">Nenhuma mensagem ainda.</p>}
                                  {chatMessages.map(msg => (
                                      <div key={msg.id} className={`flex flex-col ${msg.type === 'system' ? 'items-center' : msg.senderId === currentUser?.uid ? 'items-end' : 'items-start'}`}>
                                          {msg.type === 'system' ? (
                                              <div className="bg-slate-800/50 text-[10px] text-slate-400 px-4 py-1 rounded-full italic border border-slate-700/50 my-1">{msg.text}</div>
                                          ) : (
                                              <div className="max-w-[85%]">
                                                  {msg.senderId !== currentUser?.uid && <span className="text-[9px] text-slate-500 ml-2 font-black uppercase">{msg.senderName}</span>}
                                                  <div className={`p-3 rounded-2xl text-xs font-medium shadow-sm ${msg.senderId === currentUser?.uid ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700'}`}>
                                                      {msg.text}
                                                  </div>
                                              </div>
                                          )}
                                      </div>
                                  ))}
                                  <div ref={chatEndRef} />
                              </div>
                              <div className="flex gap-2 sticky bottom-0 bg-slate-900 pt-3 border-t border-slate-800">
                                  <input 
                                    value={chatInput} 
                                    onChange={e => setChatInput(e.target.value)} 
                                    onKeyDown={e => { if(e.key === 'Enter') { sendMessage(gameState.guildId!, currentUser!.uid, user.name, chatInput); setChatInput(''); } }}
                                    placeholder="Mensagem..." 
                                    className="flex-1 bg-slate-950 border border-slate-700 p-4 rounded-2xl text-sm outline-none focus:border-blue-500 shadow-inner" 
                                  />
                                  <button onClick={() => { sendMessage(gameState.guildId!, currentUser!.uid, user.name, chatInput); setChatInput(''); }} className="bg-blue-600 p-4 rounded-2xl hover:bg-blue-500 transition-all active:scale-95">
                                      {getIcon("Plus", "w-5 h-5 text-white")}
                                  </button>
                              </div>
                          </div>
                      )}

                      {guildTab === 'raid' && currentGuild?.boss && (
                          <div className="space-y-8 flex flex-col items-center py-6">
                              <div className="relative group flex flex-col items-center">
                                  <div className="text-9xl mb-4 animate-bounce group-active:scale-90 transition-transform select-none drop-shadow-[0_0_20px_rgba(239,68,68,0.3)]">{currentGuild.boss.image}</div>
                                  <div className="absolute inset-0 bg-red-500/10 rounded-full blur-3xl -z-10 animate-pulse"></div>
                                  <h3 className="text-2xl font-black text-red-500 uppercase tracking-widest text-center leading-none">{currentGuild.boss.name}</h3>
                                  <div className="text-[10px] font-black text-slate-500 uppercase mt-2 tracking-tighter">Inimigo Nível {currentGuild.boss.level}</div>
                              </div>
                              
                              <div className="w-full space-y-2 px-4">
                                  <div className="flex justify-between text-[10px] font-black uppercase text-red-500">
                                      <span>Energia Restante</span>
                                      <span>{currentGuild.boss.currentHp} / {currentGuild.boss.maxHp} HP</span>
                                  </div>
                                  <ProgressBar current={currentGuild.boss.currentHp} max={currentGuild.boss.maxHp} color="bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]" />
                              </div>

                              <div className="w-full px-4">
                                <button 
                                  onClick={() => {
                                      const damage = Math.ceil((Object.values(gameState.attributes) as number[]).reduce((a, b) => a + b, 0) / 2) + 10;
                                      attackBoss(gameState.guildId!, damage, user.name);
                                      if (navigator.vibrate) navigator.vibrate(50);
                                  }} 
                                  className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-6 rounded-3xl shadow-xl active:scale-95 transition-all text-xl tracking-widest uppercase border-b-8 border-red-800"
                                >
                                  ATACAR COM TUDO!
                                </button>
                              </div>
                              
                              <p className="text-[10px] text-slate-500 text-center italic max-w-xs">"Seu dano é proporcional à soma total de seus atributos atuais."</p>
                          </div>
                      )}
                  </div>
              </div>
          )}
      </Modal>

      {/* Profile Detail Modal */}
      <Modal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} title="Ficha do Herói" large>
          <div className="space-y-6">
              <div className="flex justify-center bg-slate-950/50 rounded-3xl p-6 border border-slate-800 shadow-inner">
                <RadarChart attributes={gameState.attributes} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                  <div className="bg-slate-800/60 p-4 rounded-3xl border border-slate-700 shadow-md">
                      <div className="text-[10px] text-slate-500 uppercase font-black tracking-tighter">XP Total</div>
                      <div className="text-xl font-black text-yellow-400 leading-none mt-1">{gameState.totalXp.toLocaleString()}</div>
                  </div>
                  <div className="bg-slate-800/60 p-4 rounded-3xl border border-slate-700 shadow-md">
                      <div className="text-[10px] text-slate-500 uppercase font-black tracking-tighter">Poder Total</div>
                      <div className="text-xl font-black text-blue-400 leading-none mt-1">{(Object.values(gameState.attributes) as number[]).reduce((a, b) => a + b, 0)}</div>
                  </div>
                  <div className="bg-slate-800/60 p-4 rounded-3xl border border-slate-700 shadow-md">
                      <div className="text-[10px] text-slate-500 uppercase font-black tracking-tighter">Ações</div>
                      <div className="text-xl font-black text-emerald-400 leading-none mt-1">{gameState.logs.length}</div>
                  </div>
                  <div className="bg-slate-800/60 p-4 rounded-3xl border border-slate-700 shadow-md">
                      <div className="text-[10px] text-slate-500 uppercase font-black tracking-tighter">Nível</div>
                      <div className="text-xl font-black text-purple-400 leading-none mt-1">{gameState.level}</div>
                  </div>
              </div>
              
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase text-slate-500 ml-4 tracking-widest">Memórias de Batalha</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar p-2">
                    {gameState.logs.length === 0 && <p className="text-center text-slate-600 text-[10px] py-4 uppercase font-bold">Sem registros ainda.</p>}
                    {gameState.logs.slice(0, 15).map(log => {
                        const act = ACTIVITIES.find(a => a.id === log.activityId);
                        return (
                            <div key={log.id} className="bg-slate-800/40 border border-slate-700 p-3 px-4 rounded-2xl flex justify-between items-center shadow-sm">
                                <div className="flex items-center gap-3">
                                    <div className="text-blue-500 bg-blue-500/10 p-1.5 rounded-lg">{getIcon(act?.icon || 'Star', "w-4 h-4")}</div>
                                    <div>
                                      <div className="text-xs font-black uppercase tracking-tight">{act?.label}</div>
                                      <div className="text-[9px] text-slate-500">{new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {log.amount} {act?.unit}</div>
                                    </div>
                                </div>
                                <div className="text-[10px] font-black text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full">+{log.xpGained} XP</div>
                            </div>
                        );
                    })}
                </div>
              </div>
          </div>
      </Modal>
    </div>
  );
}
