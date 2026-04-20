from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import re

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000",
    "https://sensai.vercel.app","*" ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

COMMON_SKILLS = [
    "python","javascript","typescript","react","nextjs","nodejs","sql","postgresql",
    "mongodb","docker","kubernetes","aws","azure","gcp","git","linux","java","c++",
    "machine learning","deep learning","tensorflow","pytorch","scikit-learn","pandas",
    "numpy","data analysis","data science","nlp","computer vision","api","rest","graphql",
    "html","css","tailwind","figma","agile","scrum","devops","ci/cd","testing","redux",
    "express","fastapi","flask","django","spring","kotlin","swift","flutter","firebase",
    "redis","elasticsearch","kafka","spark","hadoop","tableau","power bi","excel",
    "communication","leadership","teamwork","problem solving","project management",
]

class AnalyzeRequest(BaseModel):
    resume_text: str
    job_description: str

def extract_skills(text: str) -> list[str]:
    text_lower = text.lower()
    found = []
    for skill in COMMON_SKILLS:
        pattern = r'\b' + re.escape(skill) + r'\b'
        if re.search(pattern, text_lower):
            found.append(skill)
    return found

def score_section(text: str, keywords: list[str]) -> float:
    text_lower = text.lower()
    hits = sum(1 for kw in keywords if kw in text_lower)
    return round(min(hits / max(len(keywords), 1) * 100, 100), 1)

def extract_sections(text: str) -> dict:
    text_lower = text.lower()
    experience_kw = ["experience","worked","developed","built","managed","led","created",
                     "implemented","designed","architected","deployed","maintained"]
    skills_kw     = ["python","javascript","react","sql","aws","docker","java","typescript",
                     "nodejs","machine learning","api","git","linux"]
    education_kw  = ["bachelor","master","phd","degree","university","college","graduated",
                     "computer science","engineering","gpa","certification","certified"]
    return {
        "experience": score_section(text_lower, experience_kw),
        "skills":     score_section(text_lower, skills_kw),
        "education":  score_section(text_lower, education_kw),
    }

@app.get("/")
def root():
    return {"status": "SensAI ML Service running"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    # TF-IDF cosine similarity score
    vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2))
    try:
        tfidf_matrix = vectorizer.fit_transform([req.resume_text, req.job_description])
        similarity   = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])[0][0]
        tfidf_score  = round(float(similarity) * 100, 1)
    except Exception:
        tfidf_score = 0.0

    resume_skills = set(extract_skills(req.resume_text))
    job_skills    = set(extract_skills(req.job_description))

    matched_skills = sorted(resume_skills & job_skills)
    missing_skills = sorted(job_skills - resume_skills)
    section_scores = extract_sections(req.resume_text)

    return {
        "tfidf_score":    tfidf_score,
        "matched_skills": matched_skills,
        "missing_skills": missing_skills,
        "section_scores": section_scores,
    }

# This should be at the very bottom, NO indentation
if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)