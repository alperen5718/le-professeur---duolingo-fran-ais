import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Lesson } from "../types";
import { SYSTEM_INSTRUCTION, GEMINI_MODEL_FLASH } from "../constants";

// Ensure API Key is present (handled by environment in real app, assumed safe here per instructions)
const apiKey = process.env.API_KEY || ''; 
const ai = new GoogleGenAI({ apiKey });

export const generateLesson = async (topic: string, level: string, weakAreas: string[] = []): Promise<Lesson | null> => {
  try {
    let weakAreasPrompt = "";
    if (weakAreas.length > 0) {
      // Remove duplicates and take last 5
      const recentWeaknesses = [...new Set(weakAreas)].slice(-5);
      weakAreasPrompt = `
      ÖNEMLİ SRS GÜNCELLEMESİ: Kullanıcının şu konularda/kelimelerde eksikleri var: ${recentWeaknesses.join(", ")}.
      Lütfen bu derste, ana konuya ek olarak, bu eksik konuları tekrar ettiren en az 2 ek alıştırma sıkıştır.
      `;
    }

    const prompt = `Oluştur: level=${level}; topic="${topic}"; duration=10-15 dakika.
    ${weakAreasPrompt}
    
    İÇERİK GEREKSİNİMLERİ:
    - **Vocabulary:** En az 10-12 yeni kelime/kalıp.
    - **Dialogs:** 2 adet kısa diyalog (bağlam oluşturmak için).
    - **Exercises:** Toplam 8-12 alıştırma.
    - **Mini-Game:** 1 adet timed_match oyunu (tüm kelimeleri kapsasın).
    
    AKIŞ MANTIĞI:
    1. Önce 'listen_and_select' ile kelimeyi tanıt.
    2. Sonra 'multiple_choice' veya 'matching' ile anlamı pekiştir.
    3. Daha sonra 'say_aloud' ile kullanıcının o kelimeyi telaffuz etmesini iste (Voice Interaction).
    4. En son 'translate' veya 'fill_gap' ile yazma/tamamlama yaptır.
    
    Bu akış, kullanıcının kelimeyi duymasını, tanımasını ve sonra konuşmasını sağlar.
    SADECE JSON döndür.`;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_FLASH,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    if (!text) return null;
    
    // Clean up any potential markdown formatting strictly
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText) as Lesson;
  } catch (error) {
    console.error("Error generating lesson:", error);
    return null;
  }
};

export const generateRemedialContent = async (exercisePrompt: string, wrongAnswer: string, correctAnswer: string): Promise<string> => {
  try {
    const prompt = `
    Kullanıcı Fransızca öğrenirken şu soruda 2 kez hata yaptı ve takıldı. Ona yardım etmelisin.
    
    Soru/Bağlam: "${exercisePrompt}"
    Kullanıcının Yanlış Cevabı: "${wrongAnswer}"
    Doğru Cevap: "${correctAnswer}"

    Görevin:
    Kullanıcıya hatasının nedenini (dilbilgisi, kelime anlamı vb.) açıklayan ve doğru cevabın mantığını öğreten ÇOK KISA (maksimum 2 cümle) bir "Mini Ders" metni oluştur.
    Ton: Motive edici, net ve Türkçe olsun.
    
    Örnek Çıktı: "Dikkat et, 'le' eril kelimeler için kullanılır ama 'pomme' dişildir, bu yüzden 'la pomme' demelisin."
    `;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL_FLASH,
      contents: prompt,
    });

    return response.text || "Bu kuralı tekrar gözden geçirelim. Doğru cevabı incele ve tekrar dene.";
  } catch (error) {
    console.error("Error generating remedial content:", error);
    return "Bu konuda biraz daha pratik yapmalısın. İpucu: Cümlenin öznesine ve yüklemine dikkat et.";
  }
};

export const evaluatePronunciation = async (target: string, userTranscript: string): Promise<{ score: number; feedback: string }> => {
  try {
    const prompt = `Target French text: "${target}"
    User said (transcribed): "${userTranscript}"
    
    Görevin:
    1. Kullanıcının telaffuzunu ASR çıktısına göre değerlendir (0-100 puan).
    2. Türkçe olarak, çok kısa ve yapıcı bir geri bildirim ver. Hata varsa spesifik fonem hatasını belirt (ör: /r/ sesi, nazal sesler).
    3. JSON formatında döndür: { "score": number, "feedback": "string" }`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL_FLASH,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response");
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText);

  } catch (error) {
    console.error("Error evaluating pronunciation:", error);
    // Fallback - ensure we operate on strings even if inputs are malformed
    const safeTarget = String(target || "");
    const safeTranscript = String(userTranscript || "");
    const similarity = calculateSimilarity(safeTarget, safeTranscript);
    return {
      score: similarity,
      feedback: similarity > 80 ? "Harika telaffuz!" : "Biraz daha çalışabiliriz, tekrar dene."
    };
  }
};

export const getChatResponse = async (message: string): Promise<string> => {
  try {
    const prompt = `You are a helpful, encouraging French language tutor (Le Professeur) for a Turkish speaker.
    User asks: "${message}"
    
    Respond in Turkish. Keep it short, helpful, and friendly. 
    If explaining grammar, use simple terms.
    If the user asks for a translation, provide it.
    `;
    
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL_FLASH,
      contents: prompt,
    });
    
    return response.text || "Üzgünüm, şu an cevap veremiyorum.";
  } catch (error) {
    console.error("Chatbot error:", error);
    return "Bağlantı hatası oluştu.";
  }
};

// Simple Levenshtein distance for fallback
const calculateSimilarity = (s1: string, s2: string) => {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;
  return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength.toString()) * 100;
};

const editDistance = (s1: string, s2: string) => {
  // Explicit casting to string and lower case to prevent crashes
  s1 = String(s1 || "").toLowerCase();
  s2 = String(s2 || "").toLowerCase();
  const costs = new Array();
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i == 0) costs[j] = j;
      else {
        if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) != s2.charAt(j - 1)) newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
};