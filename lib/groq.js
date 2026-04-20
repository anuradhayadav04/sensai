import Groq from "groq-sdk";
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function generateWithGroq(prompt, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 2048,
      });
      return result.choices[0].message.content.trim();
    } catch (error) {
      const isRateLimit = error?.status === 429 || error?.message?.includes("429");
      if (isRateLimit && i < retries - 1) {
        await new Promise((res) => setTimeout(res, Math.pow(2, i) * 2000));
      } else throw error;
    }
  }
}