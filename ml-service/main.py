from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import re

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Skill keyword bank ──────────────────────────────────────────────────────
SKILL_KEYWORDS = {
    # Languages
    "python", "javascript", "typescript", "java", "c++", "c#", "go", "rust",
    "kotlin", "swift", "php", "ruby", "scala", "r",

    # Frontend
    "react", "nextjs", "vuejs", "angular", "html", "css", "tailwind",
    "bootstrap", "redux", "graphql",

    # Backend
    "nodejs", "express", "fastapi", "flask", "django", "spring", "laravel",
    "rest", "api", "microservices",

    # Databases
    "sql", "postgresql", "mysql", "mongodb", "redis", "firebase",
    "supabase", "prisma", "elasticsearch",

    # Cloud & DevOps
    "aws", "gcp", "azure", "docker", "kubernetes", "terraform", "ansible",
    "ci/cd", "jenkins", "github actions", "linux", "nginx",

    # ML / AI
    "machine learning", "deep learning", "nlp", "computer vision",
    "tensorflow", "pytorch", "scikit-learn", "pandas", "numpy",
    "huggingface", "langchain", "llm", "openai", "gemini",

    # Tools
    "git", "github", "jira", "figma", "postman", "vscode",

    # Soft skills
    "leadership", "communication", "teamwork", "problem solving",
    "agile", "scrum", "project management",
}


# ── Request / Response models ───────────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    resume_text: str
    job_description: str


class SectionScores(BaseModel):
    experience: float
    skills: float
    education: float


class AnalyzeResponse(BaseModel):
    tfidf_score: float
    matched_skills: list[str]
    missing_skills: list[str]
    section_scores: dict


# ── Helpers ─────────────────────────────────────────────────────────────────
def clean_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r"http\S+", " ", text)          # remove URLs
    text = re.sub(r"[^a-z0-9\s\+\#]", " ", text)  # keep alphanumeric + # +
    text = re.sub(r"\s+", " ", text).strip()
    return text


def extract_skills(text: str) -> set:
    text_lower = text.lower()
    found = set()
    for skill in SKILL_KEYWORDS:
        # whole-word match so "r" doesn't match inside "react"
        pattern = r"\b" + re.escape(skill) + r"\b"
        if re.search(pattern, text_lower):
            found.add(skill)
    return found


def section_score(resume: str, jd: str, keywords: list[str]) -> float:
    """
    Extract lines that contain any of the section keywords,
    then compute cosine similarity between those filtered chunks.
    """
    def filter_lines(text: str) -> str:
        lines = [
            line for line in text.split("\n")
            if any(kw in line.lower() for kw in keywords)
        ]
        return " ".join(lines) if lines else text[:400]

    r_chunk = clean_text(filter_lines(resume))
    j_chunk = clean_text(filter_lines(jd))

    if not r_chunk.strip() or not j_chunk.strip():
        return 0.0

    try:
        vec = TfidfVectorizer(stop_words="english")
        matrix = vec.fit_transform([r_chunk, j_chunk])
        score = cosine_similarity(matrix[0:1], matrix[1:2])[0][0]
        return round(float(score) * 100, 2)
    except Exception:
        return 0.0


# ── Routes ───────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    if not req.resume_text.strip():
        raise HTTPException(status_code=400, detail="resume_text is empty")
    if not req.job_description.strip():
        raise HTTPException(status_code=400, detail="job_description is empty")

    resume_clean = clean_text(req.resume_text)
    jd_clean     = clean_text(req.job_description)

    # 1. Overall TF-IDF cosine similarity ─────────────────────────────────
    try:
        vectorizer   = TfidfVectorizer(stop_words="english", ngram_range=(1, 2))
        tfidf_matrix = vectorizer.fit_transform([resume_clean, jd_clean])
        similarity   = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])[0][0]
        tfidf_score  = round(float(similarity) * 100, 2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TF-IDF error: {str(e)}")

    # 2. Skill gap analysis ───────────────────────────────────────────────
    resume_skills  = extract_skills(req.resume_text)
    jd_skills      = extract_skills(req.job_description)
    matched_skills = sorted(resume_skills & jd_skills)
    missing_skills = sorted(jd_skills - resume_skills)

    # 3. Section-level scores ─────────────────────────────────────────────
    section_scores = {
        "experience": section_score(
            req.resume_text, req.job_description,
            ["experience", "worked", "built", "developed", "led", "managed",
             "designed", "implemented", "achieved"]
        ),
        "skills": section_score(
            req.resume_text, req.job_description,
            ["skills", "technologies", "tools", "stack", "proficient",
             "knowledge", "expertise", "familiar"]
        ),
        "education": section_score(
            req.resume_text, req.job_description,
            ["education", "degree", "university", "college", "bachelor",
             "master", "phd", "certified", "certification"]
        ),
    }

    return AnalyzeResponse(
        tfidf_score=tfidf_score,
        matched_skills=matched_skills,
        missing_skills=missing_skills,
        section_scores=section_scores,
    )