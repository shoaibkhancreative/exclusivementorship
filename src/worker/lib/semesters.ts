// Semester (chapter) metadata for the public course outline.
//
// This is the ONE place the 6-semester roadmap structure/taglines live.
// Per-class content (title, per-class tagline, thumbnail, etc.) still lives
// entirely in the `lessons` table (see seed/seed.sql) — this file only adds
// the semester-level number + name + tagline used to group and label those
// classes in the outline UI. `chapterName` must match the `chapter_name`
// value stored on each lesson row exactly, since that's how classes are
// grouped into semesters when rendering.
//
// Do not duplicate this list anywhere else (e.g. hardcoded in a client
// component) — it's sent to the client as part of GET /api/lessons and
// consumed from there.

export interface SemesterMeta {
  number: number;
  chapterName: string;
  name: string;
  tagline: string;
}

export const SEMESTERS: SemesterMeta[] = [
  {
    number: 1,
    chapterName: "Foundation",
    name: "Foundation",
    tagline: "Build the foundation before you learn to execute."
  },
  {
    number: 2,
    chapterName: "Technical Edge",
    name: "Technical Edge",
    tagline: "Learn to read price through liquidity, structure and delivery."
  },
  {
    number: 3,
    chapterName: "Fundamental Edge",
    name: "Fundamental Edge",
    tagline: "Understand the forces moving the market beyond the chart."
  },
  {
    number: 4,
    chapterName: "System Building",
    name: "System Building",
    tagline: "Turn market knowledge into a repeatable trading framework."
  },
  {
    number: 5,
    chapterName: "Validation & Psychology",
    name: "Validation & Psychology",
    tagline: "A strategy is only useful when you can trust and execute it consistently."
  },
  {
    number: 6,
    chapterName: "Execution & Prop Trading",
    name: "Execution & Prop Trading",
    tagline: "Turn your framework into precise execution in the real market."
  }
];
