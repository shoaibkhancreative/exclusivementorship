import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { Button, Card } from "../../components/ui";

interface SettingsResponse {
  enrollmentPrice: number;
  referencePrice: number;
  discountPercent: number;
  freeLessonCount: number;
  introVideoEmbedUrl: string | null;
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsResponse | null>(null);

  const [enrollmentPrice, setEnrollmentPrice] = useState("");
  const [referencePrice, setReferencePrice] = useState("");
  const [priceError, setPriceError] = useState<string | null>(null);
  const [priceSuccess, setPriceSuccess] = useState<string | null>(null);
  const [savingPrice, setSavingPrice] = useState(false);

  const [freeLessonCount, setFreeLessonCount] = useState("");
  const [introVideoEmbedUrl, setIntroVideoEmbedUrl] = useState("");
  const [courseError, setCourseError] = useState<string | null>(null);
  const [courseSuccess, setCourseSuccess] = useState<string | null>(null);
  const [savingCourse, setSavingCourse] = useState(false);

  async function load() {
    const res = await api.get<SettingsResponse>("/admin/settings");
    setData(res);
    setEnrollmentPrice(String(res.enrollmentPrice));
    setReferencePrice(String(res.referencePrice));
    setFreeLessonCount(String(res.freeLessonCount));
    setIntroVideoEmbedUrl(res.introVideoEmbedUrl ?? "");
  }

  useEffect(() => {
    load().catch(() => setPriceError("Couldn't load current settings."));
  }, []);

  async function handlePriceSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPriceError(null);
    setPriceSuccess(null);
    setSavingPrice(true);
    try {
      const res = await api.post<SettingsResponse & { ok: true }>("/admin/settings", {
        enrollmentPrice: Number(enrollmentPrice),
        referencePrice: Number(referencePrice)
      });
      setData(res);
      setPriceSuccess("Saved.");
    } catch (err) {
      setPriceError(err instanceof ApiError ? err.message : "Couldn't save settings.");
    } finally {
      setSavingPrice(false);
    }
  }

  async function handleCourseSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCourseError(null);
    setCourseSuccess(null);
    setSavingCourse(true);
    try {
      const res = await api.post<SettingsResponse & { ok: true }>("/admin/settings", {
        freeLessonCount: Number(freeLessonCount),
        introVideoEmbedUrl
      });
      setData(res);
      setCourseSuccess("Saved.");
    } catch (err) {
      setCourseError(err instanceof ApiError ? err.message : "Couldn't save settings.");
    } finally {
      setSavingCourse(false);
    }
  }

  return (
    <div className="page-enter flex flex-col gap-6">
      <div>
        <h1 className="mb-4 text-xl text-zinc-100">Price &amp; Discount</h1>
        <Card className="max-w-md">
          {data && (
            <p className="mb-4 text-sm text-zinc-400">
              Live: ${data.enrollmentPrice} enrollment vs ${data.referencePrice} reference —{" "}
              <span className="text-accent-300">{data.discountPercent}% off</span>.
            </p>
          )}
          <form onSubmit={handlePriceSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="enrollment-price" className="mb-1 block text-xs text-zinc-400">
                Enrollment price (USDT)
              </label>
              <input
                id="enrollment-price"
                type="number"
                min="0.01"
                step="0.01"
                value={enrollmentPrice}
                onChange={(e) => setEnrollmentPrice(e.target.value)}
                required
                className="focus-ring w-full rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-zinc-100 outline-none"
              />
            </div>
            <div>
              <label htmlFor="reference-price" className="mb-1 block text-xs text-zinc-400">
                Reference price (USDT) — shown as the "before discount" price
              </label>
              <input
                id="reference-price"
                type="number"
                min="0.01"
                step="0.01"
                value={referencePrice}
                onChange={(e) => setReferencePrice(e.target.value)}
                required
                className="focus-ring w-full rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-zinc-100 outline-none"
              />
            </div>
            {priceError && <p className="text-sm text-red-400">{priceError}</p>}
            {priceSuccess && <p className="text-sm text-accent-300">{priceSuccess}</p>}
            <Button type="submit" disabled={savingPrice} className="self-start">
              {savingPrice ? "Saving…" : "Save price"}
            </Button>
          </form>
        </Card>
      </div>

      <div>
        <h1 className="mb-4 text-xl text-zinc-100">Course</h1>
        <Card className="max-w-md">
          <p className="mb-4 text-sm text-zinc-400">
            How many classes (from Class 1, in order) anyone can watch for free before enrollment is required, and
            the homepage intro video. Both take effect immediately, site-wide — no code changes or redeploy needed.
          </p>
          <form onSubmit={handleCourseSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="free-lesson-count" className="mb-1 block text-xs text-zinc-400">
                Free classes
              </label>
              <input
                id="free-lesson-count"
                type="number"
                min="0"
                step="1"
                value={freeLessonCount}
                onChange={(e) => setFreeLessonCount(e.target.value)}
                required
                className="focus-ring w-full rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-zinc-100 outline-none"
              />
            </div>
            <div>
              <label htmlFor="intro-video-url" className="mb-1 block text-xs text-zinc-400">
                Homepage intro video — embed URL
              </label>
              <input
                id="intro-video-url"
                type="url"
                placeholder="https://www.youtube-nocookie.com/embed/XXXXXXXXXXX"
                value={introVideoEmbedUrl}
                onChange={(e) => setIntroVideoEmbedUrl(e.target.value)}
                className="focus-ring w-full rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-zinc-100 outline-none"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Paste a ready-to-embed iframe URL (YouTube "Embed" share link, or a Bunny.net stream embed URL).
                Leave blank to show a placeholder.
              </p>
            </div>
            {courseError && <p className="text-sm text-red-400">{courseError}</p>}
            {courseSuccess && <p className="text-sm text-accent-300">{courseSuccess}</p>}
            <Button type="submit" disabled={savingCourse} className="self-start">
              {savingCourse ? "Saving…" : "Save course settings"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
