import { GoogleGenAI } from "@google/genai";
import { UserProfile, GameState } from "../types";

// Initialize safely. If the key is empty (development/missing env), use a placeholder 
// to prevent the constructor from crashing the app load. We check validity later.
const apiKey = process.env.API_KEY || "missing_api_key_placeholder";
const ai = new GoogleGenAI({ apiKey });

// --- Offline/Fallback Data ---

const OFFLINE_MESSAGES = [
  "Sua determinação brilha mais forte que uma espada recém-forjada!",
  "A cada passo, sua lenda se espalha pelos reinos.",
  "Seus músculos queimam, mas sua vontade é de ferro!",
  "Os bardos cantarão sobre este feito em tavernas distantes.",
  "Você sente o poder fluindo através de suas veias.",
  "Nenhum dragão é páreo para sua disciplina constante.",
  "Sua resistência impressiona até os guerreiros mais antigos.",
  "Mais um dia, mais uma vitória para sua história.",
  "O caminho do herói é feito de constância, e você está trilhando-o.",
  "Sua vitalidade aumenta! Você se sente pronto para qualquer desafio."
];

const OFFLINE_TITLES = [
  "Iniciado de Ferro",
  "Guerreiro do Amanhã",
  "Andarilho da Força",
  "Mestre da Disciplina",
  "Guardião da Rotina",
  "Cavaleiro do Vigor",
  "Sábio da Vitalidade",
  "Campeão Renascido",
  "Titã em Ascensão",
  "Lenda Viva"
];

// --- Services ---

export const generateRpgFlavorText = async (
  user: UserProfile,
  gameState: GameState,
  latestActivity?: string
): Promise<string> => {
  // Check if the key is valid (not empty and not our placeholder)
  const hasValidKey = process.env.API_KEY && process.env.API_KEY.length > 10;

  if (!hasValidKey) {
    // Return a random offline message to keep the immersion
    return OFFLINE_MESSAGES[Math.floor(Math.random() * OFFLINE_MESSAGES.length)];
  }

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

    return response.text || OFFLINE_MESSAGES[0];
  } catch (error) {
    console.warn("Erro ao gerar texto com Gemini (usando offline):", error);
    return OFFLINE_MESSAGES[Math.floor(Math.random() * OFFLINE_MESSAGES.length)];
  }
};

export const generateClassTitle = async (gameState: GameState): Promise<string> => {
    // Check if the key is valid
    const hasValidKey = process.env.API_KEY && process.env.API_KEY.length > 10;

    if (!hasValidKey) {
       // Return a random offline title based on level roughly
       const index = Math.min(gameState.level - 1, OFFLINE_TITLES.length - 1);
       // Add some randomness so it's not always the same for a level
       const randomOffset = Math.floor(Math.random() * 3);
       const safeIndex = Math.max(0, Math.min(index + randomOffset, OFFLINE_TITLES.length - 1));
       return OFFLINE_TITLES[safeIndex];
    }

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