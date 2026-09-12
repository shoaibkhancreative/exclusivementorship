import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { Button, Card } from "../../components/ui";
import { ImageUrlPreview } from "../../components/ImageUrlPreview";
import { CoinIcon, BookIcon, GearIcon } from "../components/icons";

interface SettingsResponse {
  enrollmentPrice: number;
  referencePrice: number;
  discountPercent: number;
  freeLessonCount: number;
  introVideoEmbedUrl: string | null;
  siteLogoUrl: string | null;
  siteFaviconUrl: string | null;
}

function SectionHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-base-800 text-zinc-400">{icon}</span>
      <h1 className="text-lg text-zinc-100">{title}</h1>
    </div>
  );
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

  const [siteLogoUrl, setSiteLogoUrl] = useState("");
  const [siteFaviconUrl, setSiteFaviconUrl] = useState("");
  const [siteError, setSiteError] = useState<string | null>(null);
  const [siteSuccess, setSiteSuccess] = useState<string | null>(null);
  const [savingSite, setSavingSite] = useState(false);

  async function load() {
    const res = await api.get<SettingsResponse>("/admin/settings");
    setData(res);
    setEnrollmentPrice(String(res.enrollmentPrice));
    setReferencePrice(String(res.referencePrice));
    setFreeLessonCount(String(res.freeLessonCount));
    setIntroVideoEmbedUrl(res.introVideoEmbedUrl ?? "");
    setSiteLogoUrl(res.siteLogoUrl ?? "");
    setSiteFaviconUrl(res.siteFaviconUrl ?? "");
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

  async function handleSiteSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSiteError(null);
    setSiteSuccess(null);
    setSavingSite(true);
    try {
      const res = await api.post<SettingsResponse & { ok: true }>("/admin/settings", {
        siteLogoUrl,
        siteFaviconUrl
      });
      setData(res);
      setSiteSuccess("Saved.");
    } catch (err) {
      setSiteError(err instanceof ApiError ? err.message : "Couldn't save settings.");
    } finally {
      setSavingSite(false);
    }
  }

  return (
    <div className="page-enter grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div>
        <SectionHeading icon={<CoinIcon />} title="Price & Discount" />
        <Card>
          {data && (
            <div className="mb-4 flex items-baseline gap-2 rounded-lg border border-base-700/60 bg-base-800/50 px-3 py-2.5">
              <span className="text-lg font-semibold text-zinc-100">${data.enrollmentPrice}</span>
              <span className="text-sm text-zinc-500 line-through">${data.referencePrice}</span>
              <span className="ml-auto rounded-full bg-accent-500/15 px-2 py-0.5 text-xs font-medium text-accent-300">
                {data.discountPercent}% off
              </span>
            </div>
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
        <SectionHeading icon={<BookIcon />} title="Course" />
        <Card>
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

      <div>
        <SectionHeading icon={<GearIcon />} title="Site" />
        <Card>
          <p className="mb-4 text-sm text-zinc-400">
            Logo/favicon (optional — paste a URL, no upload needed). Brand name and other page text are edited on the
            Content page; the support chat's copy is in Content → Support chat.
          </p>
          <form onSubmit={handleSiteSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="site-logo-url" className="mb-1 block text-xs text-zinc-400">
                Logo URL (optional — replaces the text brand name in the nav)
              </label>
              <input
                id="site-logo-url"
                type="url"
                placeholder="https://…/logo.svg"
                value={siteLogoUrl}
                onChange={(e) => setSiteLogoUrl(e.target.value)}
                className="focus-ring w-full rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-zinc-100 outline-none"
              />
              <ImageUrlPreview url={siteLogoUrl} className="h-10 w-32" />
            </div>
            <div>
              <label htmlFor="site-favicon-url" className="mb-1 block text-xs text-zinc-400">
                Favicon URL (optional)
              </label>
              <input
                id="site-favicon-url"
                type="url"
                placeholder="https://…/favicon.svg"
                value={siteFaviconUrl}
                onChange={(e) => setSiteFaviconUrl(e.target.value)}
                className="focus-ring w-full rounded-lg border border-base-700 bg-base-800 px-3 py-2 text-sm text-zinc-100 outline-none"
              />
              <ImageUrlPreview url={siteFaviconUrl} className="h-10 w-10" />
            </div>
            {siteError && <p className="text-sm text-red-400">{siteError}</p>}
            {siteSuccess && <p className="text-sm text-accent-300">{siteSuccess}</p>}
            <Button type="submit" disabled={savingSite} className="self-start">
              {savingSite ? "Saving…" : "Save site settings"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
