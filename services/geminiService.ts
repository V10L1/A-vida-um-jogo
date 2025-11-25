import { GoogleGenAI } from "@google/genai";
import { UserProfile, GameState, ACTIVITIES } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export type NarratorTrigger = 'login' | 'activity' | 'level_up';

export const generateRpgFlavorText = async (
  user: UserProfile,
  gameState: GameState,
  trigger: NarratorTrigger,
  activityName?: string
): Promise<string> => {
  if (!process.env.API_KEY) return "Aventureiro, continue sua jornada!";

  try {
    // Análise de Histórico para Contexto
    const now = Date.now();
    const lastLog = gameState.logs.length > 0 ? gameState.logs[0] : null;
    const hoursSinceLastActivity = lastLog ? (now - lastLog.timestamp) / (1000 * 60 * 60) : 0;
    
    let contextNote = "";

    if (trigger === 'login') {
        if (!lastLog) {
            contextNote = "O usuário é novo. Dê as boas vindas épicas.";
        } else if (hoursSinceLastActivity > 48) {
            contextNote = `O usuário não registra nada há ${Math.floor(hoursSinceLastActivity / 24)} dias. O tom deve ser de alerta, como se a armadura estivesse enferrujando ou os monstros se aproximando. Cobrança sutil.`;
        } else if (hoursSinceLastActivity < 24) {
            contextNote = "O usuário treinou recentemente (hoje ou ontem). O tom deve ser de reconhecimento pela disciplina e constância.";
        }
    } else if (trigger === 'activity' && activityName) {
        // Verificar sinergia com a classe
        const currentClass = gameState.classTitle;
        const act = ACTIVITIES.find(a => a.label === activityName);
        
        if (act) {
            let isClassSynergy = false;
            if (currentClass.includes("Mago") && act.category === 'intellect') isClassSynergy = true;
            if (currentClass.includes("Tanque") && (act.id === 'gym' || act.primaryAttribute === 'STR')) isClassSynergy = true;
            if (currentClass.includes("Corredor") && (act.id === 'run' || act.primaryAttribute === 'VIG')) isClassSynergy = true;
            
            if (isClassSynergy) {
                contextNote = `A atividade (${activityName}) é perfeita para a classe do usuário (${currentClass}). Elogie o foco na especialização.`;
            } else {
                contextNote = `A atividade (${activityName}) é diferente do foco habitual da classe (${currentClass}). Elogie a versatilidade.`;
            }
        }
    }

    const prompt = `
      Atue como um Mestre de RPG sábio e motivador (Narrador).
      
      Evento: ${trigger === 'login' ? 'Login do Jogador' : trigger === 'level_up' ? 'Subiu de Nível' : 'Atividade Completada'}
      ${activityName ? `Atividade: ${activityName}` : ''}
      
      Perfil:
      Nome: ${user.name}
      Classe: ${gameState.classTitle}
      Nível: ${gameState.level}
      
      Contexto Específico: ${contextNote}
      
      Gere uma mensagem curta (máximo 2 frases) para o jogador.
      Use metáforas de RPG (Mana, Stamina, XP, Dragões, Guildas, Equipamento).
      Se for login após muito tempo, seja levemente severo ("Onde você estava?").
      Se for login constante, seja orgulhoso.
      Não use Markdown. Apenas texto puro.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text?.trim() || "Sua lenda cresce a cada dia!";
  } catch (error) {
    console.error("Erro ao gerar texto com Gemini:", error);
    return "O destino aguarda seus próximos passos.";
  }
};

export const generateClassTitle = async (gameState: GameState): Promise<string> => {
    if (!process.env.API_KEY) return "Aventureiro";

    try {
        const prompt = `
          Analise o perfil de um jogador de RPG baseado em fitness/vida real.
          Nível: ${gameState.level}
          XP Total: ${gameState.totalXp}
          Atributo Principal: ${Object.entries(gameState.attributes).sort((a,b) => b[1] - a[1])[0][0]}
          
          Crie um Título de Classe criativo (ex: "Iniciado de Ferro", "Mestre do Movimento", "Sábio da Vitalidade").
          Apenas o título, nada mais. Máximo 4 palavras.
        `;
    
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
    
        return response.text?.trim() || "Aventureiro";
      } catch (error) {
        return "Guerreiro";
      }
}