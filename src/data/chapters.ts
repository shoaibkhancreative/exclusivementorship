export interface Chapter {
  id: number;
  slug: string;
  title: string;
  classes: number;
  price: number;
  tagline: string;
  hooks: string[];
}

export const chapters: Chapter[] = [
  {
    id: 1,
    slug: "architecture-of-markets",
    title: "The Architecture of Markets",
    classes: 5,
    price: 5,
    tagline: "Market কেন যেভাবে move করে — foundation।",
    hooks: ["Real market participants", "Liquidity mechanics", "Why 90% traders lose"]
  },
  {
    id: 2,
    slug: "smart-money-basics",
    title: "Smart Money Basics",
    classes: 9,
    price: 9,
    tagline: "Institutional traders কীভাবে চিন্তা করে।",
    hooks: ["Order flow reading", "Smart money footprints", "Retail traps"]
  },
  {
    id: 3,
    slug: "structure-time-concepts",
    title: "Structure & Time Based Concepts",
    classes: 12,
    price: 12,
    tagline: "Market structure এবং time-based edges।",
    hooks: ["Multi-timeframe analysis", "Killzones", "Time-of-day bias"]
  },
  {
    id: 4,
    slug: "institutional-framework",
    title: "Institutional Framework",
    classes: 15,
    price: 15,
    tagline: "Complete institutional trading framework।",
    hooks: ["Advanced order blocks", "FVG & IPDA", "Weekly bias models"]
  },
  {
    id: 5,
    slug: "professional-mindset",
    title: "Professional Trader Mindset",
    classes: 17,
    price: 17,
    tagline: "যা ৯৫% traders কখনো শেখে না।",
    hooks: ["Emotional discipline", "Risk psychology", "Consistency systems"]
  },
  {
    id: 6,
    slug: "high-probability-strategies",
    title: "High-Probability Strategies",
    classes: 19,
    price: 19,
    tagline: "Backtested, real edge strategies।",
    hooks: ["Sniper entries", "Confluence stacking", "Setup filtration"]
  },
  {
    id: 7,
    slug: "personal-trading-plan",
    title: "Our Personal Trading Plan (Inc. Prop)",
    classes: 22,
    price: 22,
    tagline: "আমাদের exact plan — including prop firm approach।",
    hooks: ["Full trading plan", "Prop firm strategies", "Daily routine blueprint"]
  }
];

export const pricing = {
  tier1Total: 99,
  tier2Bundle: 79,
  savings: 20,
  prioritySupport: 8,
  totalClasses: 99
};
