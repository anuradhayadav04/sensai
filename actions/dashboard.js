"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { generateWithGroq } from "@/lib/groq"; // ✅ replaced Gemini

export const generateAIInsights = async (industry) => {
  const prompt = `
Analyze the current state of the ${industry} industry and return ONLY JSON in the following format:

{
  "salaryRanges": [
    { "role": "string", "min": number, "max": number, "median": number, "location": "string" }
  ],
  "growthRate": number,
  "demandLevel": "High" | "Medium" | "Low",
  "topSkills": ["skill1", "skill2"],
  "marketOutlook": "Positive" | "Neutral" | "Negative",
  "keyTrends": ["trend1", "trend2"],
  "recommendedSkills": ["skill1", "skill2"]
}

Rules:
- Return ONLY JSON
- No explanation
- No markdown
- Include at least 5 roles in salaryRanges
- Include at least 5 skills
- Include at least 5 trends
- Growth rate should be a percentage number
`;

  try {
    const text = await generateWithGroq(prompt); // ✅ direct string
    const cleanedText = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleanedText);
    return parsed;
  } catch (error) {
    console.error("AI generation error:", error.message);
    throw new Error("Failed to generate AI insights");
  }
};

export async function getIndustryInsights() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
    include: { industryInsight: true },
  });

  if (!user) throw new Error("User not found");

  // If insights not present → generate them
  if (!user.industryInsight) {
    const insights = await generateAIInsights(user.industry);

    const industryInsight = await db.industryInsight.create({
      data: {
        industry: user.industry,
        ...insights,
        nextUpdate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return industryInsight;
  }

  return user.industryInsight;
}