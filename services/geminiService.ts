import { GoogleGenerativeAI } from "@google/generative-ai";
import { Trade } from "../types";

// Access the key using Vite's required prefix
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || "");

export const analyzePsychology = async (trades: Trade[]): Promise<string> => {
  try {
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash", 
        systemInstruction: "Act as a world-class trading psychologist. Analyze these trades for emotional leakage or behavioral patterns. Be direct but encouraging."
    });

    const recentTrades = trades.slice(0, 10);
    const tradeSummary = recentTrades.map(t => 
      `Symbol: ${t.symbol}, PnL: ${t.pnl}, Pre-Emotion: ${t.emotionPre}, Post-Emotion: ${t.emotionPost}, Notes: ${t.notes}`
    ).join('\n');

    const prompt = `Analyze these trades:\n${tradeSummary}\n\nProvide 3 bullet points and 1 actionable piece of advice.`;

    const result = await model.generateContent(prompt);
    return result.response.text() || "Could not generate analysis.";
  } catch (error) {
    console.error("Gemini Analysis Error", error);
    return "Unable to analyze trades. Check your API key in .env.local.";
  }
};

export const getCoachResponse = async (userMessage: string, context?: string): Promise<string> => {
  try {
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash", 
        systemInstruction: "You are a calm, rational trading psychology coach focusing on discipline and risk. Keep answers under 100 words."
    });

    const contents = context ? `Context: ${context}\n\nUser: ${userMessage}` : userMessage;
    const result = await model.generateContent(contents);
    return result.response.text() || "I'm listening, but I can't respond right now.";
  } catch (error) {
    console.error("Gemini Coach Error", error);
    return "Coach is offline (Check your API Key).";
  }
};

export const generateDailyAffirmation = async (): Promise<string> => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent("Give me a single, powerful, one-sentence stoic affirmation for a day trader focusing on discipline and process over outcome.");
    return result.response.text() || "Focus on the process, not the profit.";
  } catch (error) {
    return "Focus on the process, not the profit.";
  }
};