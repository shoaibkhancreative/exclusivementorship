import { useEffect } from "react";

const SITE_NAME = "Exclusive Mentorship — Next Level Trader";
const SITE_URL = "https://exclusivementorship.xyz";

function setMetaTag(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href: string) {
  let el = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export function useDocumentMeta(options: { title: string; description?: string; path: string }) {
  const { title, description, path } = options;

  useEffect(() => {
    const fullTitle = title === SITE_NAME ? title : `${title} | Exclusive Mentorship`;
    document.title = fullTitle;
    setMetaTag("property", "og:title", fullTitle);

    if (description) {
      setMetaTag("name", "description", description);
      setMetaTag("property", "og:description", description);
    }

    const url = `${SITE_URL}${path}`;
    setCanonical(url);
    setMetaTag("property", "og:url", url);
  }, [title, description, path]);
}
