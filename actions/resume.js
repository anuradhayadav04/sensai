"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { revalidatePath } from "next/cache";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // ✅ Changed from gemini-2.0-flash

// ✅ Retry helper with exponential backoff
async function generateWithRetry(prompt, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await model.generateContent(prompt);
      return result;
    } catch (error) {
      const isRateLimit =
        error?.status === 429 || error?.message?.includes("429");

      if (isRateLimit && i < retries - 1) {
        const delay = Math.pow(2, i) * 2000; // 2s, 4s, 8s
        console.log(
          `Rate limited. Retrying in ${delay}ms... (attempt ${i + 1}/${retries})`
        );
        await new Promise((res) => setTimeout(res, delay));
      } else {
        throw error;
      }
    }
  }
}

// ── EXISTING FUNCTIONS ───────────────────────────────────────────────────

export async function saveResume(content) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) throw new Error("User not found");

  try {
    const resume = await db.resume.upsert({
      where: { userId: user.id },
      update: { content },
      create: { userId: user.id, content },
    });

    revalidatePath("/resume");
    return resume;
  } catch (error) {
    console.error("Error saving resume:", error);
    throw new Error("Failed to save resume");
  }
}

export async function getResume() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) throw new Error("User not found");

  return await db.resume.findUnique({
    where: { userId: user.id },
  });
}

export async function improveWithAI({ current, type }) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
    include: { industryInsight: true },
  });

  if (!user) throw new Error("User not found");

  const prompt = `
    As an expert resume writer, improve the following ${type} description for a ${user.industry} professional.
    Make it more impactful, quantifiable, and aligned with industry standards.
    Current content: "${current}"

    Requirements:
    1. Use action verbs
    2. Include metrics and results where possible
    3. Highlight relevant technical skills
    4. Keep it concise but detailed
    5. Focus on achievements over responsibilities
    6. Use industry-specific keywords
    
    Format the response as a single paragraph without any additional text or explanations.
  `;

  try {
    const result = await generateWithRetry(prompt); // ✅ Using retry wrapper
    const improvedContent = result.response.text().trim();
    return improvedContent;
  } catch (error) {
    console.error("Error improving content:", error);

    // ✅ Friendly rate limit error
    if (error?.status === 429 || error?.message?.includes("429")) {
      throw new Error(
        "AI service is busy. Please wait a moment and try again."
      );
    }

    throw new Error("Failed to improve content");
  }
}

// ── ML FUNCTIONS ─────────────────────────────────────────────────────────

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

async function callMLService(resumeText, jobDescription) {
  try {
    const res = await fetch(`${ML_SERVICE_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resume_text: resumeText,
        job_description: jobDescription,
      }),
    });
    if (!res.ok) throw new Error(`ML service responded with ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error("ML service error:", error);
    // Fallback so Gemini result still works if Python service is down
    return {
      tfidf_score: 0,
      matched_skills: [],
      missing_skills: [],
      section_scores: { experience: 0, skills: 0, education: 0 },
    };
  }
}

async function callGemini(resumeText, jobDescription) {
  const prompt = `
    You are an expert ATS (Applicant Tracking System) and career coach.
    Analyze this resume against the job description and return ONLY a valid JSON object.
    No markdown, no explanation, just raw JSON.

    RESUME:
    ${resumeText}

    JOB DESCRIPTION:
    ${jobDescription}

    Return exactly this JSON structure:
    {
      "overallScore": <number 0-100>,
      "matchedSkills": ["skill1", "skill2"],
      "missingSkills": ["skill3", "skill4"],
      "recommendations": [
        "Specific actionable suggestion 1",
        "Specific actionable suggestion 2",
        "Specific actionable suggestion 3"
      ]
    }
  `;

  try {
    const result = await generateWithRetry(prompt); // ✅ Using retry wrapper
    const text = result.response.text().trim();
    const cleaned = text.replace(/```json|```/g, "").trim();

    // ✅ Safe JSON parse
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseError) {
      console.error("Failed to parse Gemini JSON:", parseError);
      throw new Error("AI returned invalid response format. Please try again.");
    }

    return parsed;
  } catch (error) {
    console.error("Gemini error:", error);

    // ✅ Friendly rate limit error
    if (error?.status === 429 || error?.message?.includes("429")) {
      throw new Error(
        "AI service is busy due to rate limits. Please wait a minute and try again."
      );
    }

    throw new Error("Failed to analyze resume with AI");
  }
}

export async function analyzeResume(resumeText, jobDescription) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });
  if (!user) throw new Error("User not found");

  // Call both services in parallel
  const [mlResult, geminiResult] = await Promise.all([
    callMLService(resumeText, jobDescription),
    callGemini(resumeText, jobDescription),
  ]);