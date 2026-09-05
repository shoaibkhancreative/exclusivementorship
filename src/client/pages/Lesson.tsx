import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type LessonDetail } from "../lib/api";
import { Button, LoadingScreen } from "../components/ui";

export default function Lesson() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLesson(null);
    setSubmitted(false);
    setSelectedFileName(null);
    setError(null);

    api
      .get<LessonDetail>(`/lessons/${id}`)
      .then((data) => {
        setLesson(data);
        setSubmitted(data.assignmentSubmitted);
        // Fire-and-forget: mark the video as viewed once the lesson loads.
        api.post(`/lessons/${id}/complete-video`).catch(() => {});
      })
      .catch((err) => {
        if (err instanceof ApiError && (err.code === "payment_required" || err.code === "locked")) {
          navigate(err.code === "payment_required" ? "/unlock" : "/learn", { replace: true });
        } else {
          setError("This lesson couldn't be loaded.");
        }
      });
  }, [id, navigate]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setSelectedFileName(file ? file.name : null);
  }

  async function handleSubmitAssignment() {
    if (!lesson) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.post<{ nextLessonNumber: number; showPremiumGate: boolean }>(
        `/lessons/${id}/submit-assignment`,
        { fileName: selectedFileName }
      );
      setSubmitted(true);
      setSelectedFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      setTimeout(() => {
        if (result.showPremiumGate) {
          navigate("/unlock");
        } else {
          navigate(`/lesson/${result.nextLessonNumber}`);
        }
      }, 900);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return <div className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-red-400">{error}</div>;
  }
  if (!lesson) return <LoadingScreen />;

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-4 text-xs uppercase tracking-wide text-zinc-500">
        {lesson.chapterName} · Lesson {String(lesson.lessonNumber).padStart(2, "0")}
      </div>
      <h1 className="mb-4 text-xl font-semibold text-zinc-50">{lesson.title}</h1>

      <div className="mb-5 aspect-video overflow-hidden rounded-xl border border-base-700 bg-black">
        <iframe
          className="h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${lesson.youtubeVideoId}?rel=0&modestbranding=1`}
          title={lesson.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>

      {lesson.description && <p className="mb-8 text-sm leading-relaxed text-zinc-400">{lesson.description}</p>}

      {lesson.assignmentTitle && (
        <div className="rounded-xl border border-base-700 bg-base-900 p-5">
          <h2 className="mb-1 text-sm font-semibold text-zinc-100">{lesson.assignmentTitle}</h2>
          {lesson.assignmentInstruction && (
            <p className="mb-4 text-sm text-zinc-400">{lesson.assignmentInstruction}</p>
          )}

          {submitted ? (
            <p className="text-sm text-accent-400">Assignment submitted. Your next lesson is now unlocked.</p>
          ) : (
            <div className="space-y-3">
              <label className="focus-ring flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-base-600 px-4 py-3 text-sm text-zinc-400 hover:border-accent-500">
                <span>{selectedFileName ?? "Upload Assignment (PDF, PNG, JPG, DOCX)"}</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.docx"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button onClick={handleSubmitAssignment} disabled={submitting} className="w-full">
                {submitting ? "Submitting…" : "Submit Assignment"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
