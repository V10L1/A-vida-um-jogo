
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
            contextNote = "O usuário é novo. Dê as boas vindas ao caminho da evolução.";
        } else if (hoursSinceLastActivity > 48) {
            contextNote = `O usuário não registra nada há ${Math.floor(hoursSinceLastActivity / 24)} dias. O tom deve ser de alerta realista: "Seus músculos estão atrofiando", "Sua técnica está enferrujando", "Seu conhecimento está desvanecendo", "A inércia está vencendo".`;
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
                if (currentClass.includes("Mago")) {
                     contextNote = `A atividade (${activityName}) expande o Conhecimento e Foco mental do Mago. Elogie a mente afiada.`;
                } else {
                     contextNote = `A atividade (${activityName}) é fundamental para a classe ${currentClass}. Elogie a especialização.`;
                }
            } else {
                contextNote = `A atividade (${activityName}) é versátil para a classe (${currentClass}). Elogie o equilíbrio.`;
            }
        }
    }

    const prompt = `
      Atue como um Mestre de RPG da Vida Real (Narrador).
      
      Evento: ${trigger === 'login' ? 'Login do Jogador' : trigger === 'level_up' ? 'Subiu de Nível' : 'Atividade Completada'}
      ${activityName ? `Atividade: ${activityName}` : ''}
      
      Perfil:
      Nome: ${user.name}
      Classe: ${gameState.classTitle}
      Nível: ${gameState.level}
      
      Contexto Específico: ${contextNote}
      
      Diretrizes de Tom Obrigatórias:
      1. Substitua totalmente "Mana" por "Conhecimento", "Foco" ou "Capacidade Mental". Magos da vida real usam o cérebro.
      2. Substitua monstros fantásticos por desafios reais: "Inércia", "Preguiça", "Limites", "Fraqueza", "Atrofia".
      3. Seja motivador mas realista. Se o jogador não treina, avise que seus atributos vão cair.
      4. Use termos de RPG (XP, Nível, Guilda, Quest) mas aplicados à realidade (ex: "Sua Stamina aumentou", "Seu Conhecimento expandiu").
      
      Gere uma mensagem curta (máximo 2 frases) para o jogador.
      Não use Markdown. Apenas texto puro.
    `;

    // FIX: Update model to gemini-3-flash-preview as per the latest guidelines for text tasks.
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
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
          
          Crie um Título de Classe criativo e realista (ex: "Erudito de Ferro", "Mestre do Movimento", "Sábio da Vitalidade").
          Apenas o título, nada mais. Máximo 4 palavras.
        `;
    
        // FIX: Update model to gemini-3-flash-preview as per the latest guidelines for text tasks.
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
        });
    
        return response.text?.trim() || "Aventureiro";
      } catch (error) {
        return "Guerreiro";
      }
}
