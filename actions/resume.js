"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { generateWithGroq } from "@/lib/groq"; // ✅ replaced Gemini

// ── EXISTING FUNCTIONS ───────────────────────────────────────────────────

export async function saveResume(content) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({ where: { clerkUserId: userId } });
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

  const user = await db.user.findUnique({ where: { clerkUserId: userId } });
  if (!user) throw new Error("User not found");

  return await db.resume.findUnique({ where: { userId: user.id } });
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
    const improvedContent = await generateWithGroq(prompt); // ✅ direct string
    return improvedContent;
  } catch (error) {
    console.error("Error improving content:", error);
    if (error?.status === 429 || error?.message?.includes("429")) {
      throw new Error("AI service is busy. Please wait a moment and try again.");
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
    // Fallback if Python service is down
    return {
      tfidf_score: 0,
      matched_skills: [],
      missing_skills: [],
      section_scores: { experience: 0, skills: 0, education: 0 },
    };
  }
}

async function callAI(resumeText, jobDescription) {
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
    const text = await generateWithGroq(prompt); // ✅ replaced Gemini
    const cleaned = text.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseError) {
      console.error("Failed to parse AI JSON:", parseError);
      throw new Error("AI returned invalid response format. Please try again.");
    }

    return parsed;
  } catch (error) {
    console.error("AI error:", error);
    if (error?.status === 429 || error?.message?.includes("429")) {
      throw new Error("AI service is busy. Please wait a minute and try again.");
    }
    throw new Error("Failed to analyze resume with AI");
  }
}

export async function analyzeResume(resumeText, jobDescription) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({ where: { clerkUserId: userId } });
  if (!user) throw new Error("User not found");

  // Call both services in parallel
  const [mlResult, aiResult] = await Promise.all([
    callMLService(resumeText, jobDescription),
    callAI(resumeText, jobDescription),
  ]);

  // Blend: 60% TF-IDF (objective) + 40% AI (semantic)
  const blendedScore = Math.round(
    mlResult.tfidf_score * 0.6 + aiResult.overallScore * 0.4
  );

  // Merge and deduplicate skill lists
  const allMatched = [
    ...new Set([...mlResult.matched_skills, ...aiResult.matchedSkills]),
  ];
  const allMissing = [
    ...new Set([...mlResult.missing_skills, ...aiResult.missingSkills]),
  ];

  const saved = await db.resumeScore.create({
    data: {
      userId:          user.id,
      resumeText,
      jobDescription,
      overallScore:    blendedScore,
      tfidfScore:      mlResult.tfidf_score,
      sectionScores:   mlResult.section_scores,
      matchedSkills:   allMatched,
      missingSkills:   allMissing,
      recommendations: aiResult.recommendations,
    },
  });

  revalidatePath("/resume-analyzer");
  return saved;
}

export async function getResumeScores() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({ where: { clerkUserId: userId } });
  if (!user) throw new Error("User not found");

  return await db.resumeScore.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
}