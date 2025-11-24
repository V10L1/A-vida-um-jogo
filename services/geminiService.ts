import { GoogleGenAI } from "@google/genai";
import { UserProfile, GameState } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateRpgFlavorText = async (
  user: UserProfile,
  gameState: GameState,
  latestActivity?: string
): Promise<string> => {
  if (!process.env.API_KEY) return "Aventureiro, continue sua jornada!";

  try {
    const prompt = `
      Atue como um narrador de RPG de fantasia épica.
      O usuário subiu de nível ou completou uma atividade.
      
      Dados do Jogador:
      Nome: ${user.name}
      Nível: ${gameState.level}
      XP Total: ${gameState.totalXp}
      Última Atividade: ${latestActivity || "Geral"}
      
      Gere uma mensagem curta, motivacional e em estilo RPG (máximo 2 frases) parabenizando o usuário pelo progresso. 
      Use termos como "Mana", "Vigor", "Inteligência" dependendo da atividade.
      Não use formatação markdown, apenas texto puro.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "Sua lenda cresce a cada passo!";
  } catch (error) {
    console.error("Erro ao gerar texto com Gemini:", error);
    return "Sua força aumenta a cada dia!";
  }
};

export const generateClassTitle = async (gameState: GameState): Promise<string> => {
    if (!process.env.API_KEY) return "Aventureiro";

    try {
        const prompt = `
          Analise o perfil de um jogador de RPG baseado em fitness/vida real.
          Nível: ${gameState.level}
          XP Total: ${gameState.totalXp}
          
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