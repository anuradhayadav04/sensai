"use client";

import { useState } from "react";
import { analyzeResume, getResumeScores } from "@/actions/resume";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CheckCircle, XCircle, AlertCircle } from "lucide-react";

export default function ResumeAnalyzerPage() {
  const [resumeText, setResumeText]       = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [result, setResult]               = useState(null);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState(null);

  const handleAnalyze = async () => {
    if (!resumeText.trim() || !jobDescription.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await analyzeResume(resumeText, jobDescription);
      setResult(data);
    } catch (e) {
      setError(e.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 75) return "text-green-500";
    if (score >= 50) return "text-yellow-500";
    return "text-red-500";
  };

  const getScoreLabel = (score) => {
    if (score >= 75) return "Strong Match";
    if (score >= 50) return "Moderate Match";
    return "Weak Match";
  };

  const getProgressColor = (score) => {
    if (score >= 75) return "bg-green-500";
    if (score >= 50) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold gradient-title">Resume Analyzer</h1>
        <p className="text-muted-foreground mt-1">
          Paste your resume and a job description to get an ATS score, skill gap
          analysis, and AI recommendations.
        </p>
      </div>

      {/* Input Section */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Your Resume</label>
          <Textarea
            placeholder="Paste your resume text here..."
            className="min-h-[260px] resize-none"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {resumeText.length} characters
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Job Description</label>
          <Textarea
            placeholder="Paste the job description here..."
            className="min-h-[260px] resize-none"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {jobDescription.length} characters
          </p>
        </div>
      </div>

      <Button
        onClick={handleAnalyze}
        disabled={loading || !resumeText.trim() || !jobDescription.trim()}
        className="w-full md:w-auto"
        size="lg"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Analyzing...
          </>
        ) : (
          "Analyze Resume"
        )}
      </Button>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-500 bg-red-50 dark:bg-red-950 p-4 rounded-lg">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">

          {/* Score Cards Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Overall Score */}
            <Card className="col-span-2 md:col-span-1">
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-muted-foreground mb-1">Overall Score</p>
                <p className={`text-5xl font-bold ${getScoreColor(result.overallScore)}`}>
                  {result.overallScore}
                </p>
                <p className="text-xs text-muted-foreground mt-1">out of 100</p>
                <Badge
                  className="mt-2"
                  variant={result.overallScore >= 75 ? "default" : result.overallScore >= 50 ? "secondary" : "destructive"}
                >
                  {getScoreLabel(result.overallScore)}
                </Badge>
              </CardContent>
            </Card>

            {/* TF-IDF Score */}
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-muted-foreground mb-1">ML Score</p>
                <p className={`text-4xl font-bold ${getScoreColor(result.tfidfScore)}`}>
                  {Math.round(result.tfidfScore)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">TF-IDF similarity</p>
              </CardContent>
            </Card>

            {/* Matched Skills */}
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-muted-foreground mb-1">Matched</p>
                <p className="text-4xl font-bold text-green-500">
                  {result.matchedSkills.length}
                </p>
                <p className="text-xs text-muted-foreground mt-1">skills found</p>
              </CardContent>
            </Card>

            {/* Missing Skills */}
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-muted-foreground mb-1">Missing</p>
                <p className="text-4xl font-bold text-red-500">
                  {result.missingSkills.length}
                </p>
                <p className="text-xs text-muted-foreground mt-1">skills to add</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs for detailed results */}
          <Tabs defaultValue="skills">
            <TabsList className="grid grid-cols-3 w-full md:w-auto">
              <TabsTrigger value="skills">Skill Gap</TabsTrigger>
              <TabsTrigger value="sections">Sections</TabsTrigger>
              <TabsTrigger value="tips">Recommendations</TabsTrigger>
            </TabsList>

            {/* Skill Gap Tab */}
            <TabsContent value="skills">
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Matched Skills ({result.matchedSkills.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {result.matchedSkills.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No matching skills found.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {result.matchedSkills.map((skill) => (
                          <Badge
                            key={skill}
                            variant="outline"
                            className="border-green-500 text-green-600 dark:text-green-400"
                          >
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-500" />
                      Missing Skills ({result.missingSkills.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {result.missingSkills.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Great! No critical skills missing.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {result.missingSkills.map((skill) => (
                          <Badge
                            key={skill}
                            variant="outline"
                            className="border-red-400 text-red-500 dark:text-red-400"
                          >
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Section Scores Tab */}
            <TabsContent value="sections">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Section-by-Section Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {result.sectionScores &&
                    Object.entries(result.sectionScores).map(([section, score]) => (
                      <div key={section}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="capitalize font-medium">{section}</span>
                          <span className={getScoreColor(score)}>{Math.round(score)}%</span>
                        </div>
                        <div className="w-full bg-secondary rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${getProgressColor(score)}`}
                            style={{ width: `${Math.min(score, 100)}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {score >= 75
                            ? "Well aligned with the job description"
                            : score >= 50
                            ? "Partially matches — consider expanding this section"
                            : "Needs improvement — add more relevant content here"}
                        </p>
                      </div>
                    ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Recommendations Tab */}
            <TabsContent value="tips">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">AI Recommendations</CardTitle>
                </CardHeader>
                <CardContent>
                  {result.recommendations && result.recommendations.length > 0 ? (
                    <ul className="space-y-3">
                      {result.recommendations.map((rec, i) => (
                        <li key={i} className="flex gap-3 text-sm">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                            {i + 1}
                          </span>
                          <span className="text-muted-foreground leading-relaxed">{rec}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No recommendations generated.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}