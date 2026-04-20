import { getResume } from "@/actions/resume";
import ResumeBuilder from "./_components/resume-builder";
import Link from "next/link";

export default async function ResumePage() {
  const resume = await getResume();

  return (
    <div className="container mx-auto py-6">
      
      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6 border-b">
        <Link
          href="/resume"
          className="px-4 py-2 font-medium border-b-2 border-primary text-primary"
        >
          Resume Builder
        </Link>
        <Link
          href="/resume-analyzer"
          className="px-4 py-2 font-medium text-muted-foreground hover:text-primary"
        >
          Resume Analyzer
        </Link>
      </div>

      <ResumeBuilder initialContent={resume?.content} />
    </div>
  );
}