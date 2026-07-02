export interface ClassItem {
  id: number;
  title: string;
  subtitle: string;
  duration?: string;
}

export interface Chapter {
  id: number;
  slug: string;
  title: string;
  classes: number;
  price: number;
  tagline: string;
  thumbnail: string;
  gradient: string;
  hooks: string[];
  classList: ClassItem[];
}

export const chapters: Chapter[] = [
  {
    id: 1,
    slug: "architecture-of-markets",
    title: "The Architecture of Markets",
    classes: 5,
    price: 5,
    tagline: "Market কেন যেভাবে move করে — foundation।",
    thumbnail: "/images/ch1.jpg",
    gradient: "from-blue-500/20 to-cyan-500/5",
    hooks: ["Real market participants", "Liquidity mechanics", "Why 90% traders lose"],
    classList: [
      { id: 1, title: "Market Participants Decoded", subtitle: "Who actually moves the market", duration: "18 min" },
      { id: 2, title: "The Liquidity Concept", subtitle: "Where money truly flows", duration: "22 min" },
      { id: 3, title: "Order Flow Foundations", subtitle: "Reading intent behind price", duration: "25 min" },
      { id: 4, title: "Retail vs Institutional Logic", subtitle: "The invisible war on charts", duration: "20 min" },
      { id: 5, title: "Why 90% Traders Fail", subtitle: "The mathematical trap explained", duration: "24 min" }
    ]
  },
  {
    id: 2,
    slug: "smart-money-basics",
    title: "Smart Money Basics",
    classes: 9,
    price: 9,
    tagline: "Institutional traders কীভাবে চিন্তা করে।",
    thumbnail: "/images/ch2.jpg",
    gradient: "from-purple-500/20 to-pink-500/5",
    hooks: ["Order flow reading", "Smart money footprints", "Retail traps"],
    classList: [
      { id: 1, title: "Smart Money Mindset", subtitle: "How institutions think differently", duration: "20 min" },
      { id: 2, title: "Footprint Analysis", subtitle: "Detecting big player activity", duration: "24 min" },
      { id: 3, title: "Order Blocks Introduction", subtitle: "The core smart money zone", duration: "26 min" },
      { id: 4, title: "Fair Value Gaps (FVG)", subtitle: "Price inefficiency explained", duration: "22 min" },
      { id: 5, title: "Liquidity Sweeps", subtitle: "How retail gets trapped", duration: "28 min" },
      { id: 6, title: "Break of Structure", subtitle: "Trend confirmation logic", duration: "23 min" },
      { id: 7, title: "Change of Character", subtitle: "Reversal detection framework", duration: "25 min" },
      { id: 8, title: "Retail Trap Patterns", subtitle: "Common manipulation setups", duration: "27 min" },
      { id: 9, title: "Building Your Smart Money Eye", subtitle: "Practical chart reading drills", duration: "30 min" }
    ]
  },
  {
    id: 3,
    slug: "structure-time-concepts",
    title: "Structure & Time Based Concepts",
    classes: 12,
    price: 12,
    tagline: "Market structure এবং time-based edges।",
    thumbnail: "/images/ch3.jpg",
    gradient: "from-emerald-500/20 to-teal-500/5",
    hooks: ["Multi-timeframe analysis", "Killzones", "Time-of-day bias"],
    classList: [
      { id: 1, title: "Market Structure Deep Dive", subtitle: "HH, HL, LH, LL demystified", duration: "22 min" },
      { id: 2, title: "Multi-Timeframe Framework", subtitle: "Aligning HTF with LTF", duration: "26 min" },
      { id: 3, title: "Killzone Introduction", subtitle: "The 3 windows that matter", duration: "20 min" },
      { id: 4, title: "London Killzone", subtitle: "Highest probability session", duration: "24 min" },
      { id: 5, title: "New York Killzone", subtitle: "Reversals and continuations", duration: "25 min" },
      { id: 6, title: "Asian Range Concept", subtitle: "Setting up the daily play", duration: "22 min" },
      { id: 7, title: "Time-of-Day Bias", subtitle: "When to trade, when to wait", duration: "23 min" },
      { id: 8, title: "Weekly Open Reference", subtitle: "Institutional bias anchors", duration: "24 min" },
      { id: 9, title: "Monthly & Quarterly Levels", subtitle: "Macro liquidity zones", duration: "26 min" },
      { id: 10, title: "Session Overlaps", subtitle: "Volatility windows explained", duration: "21 min" },
      { id: 11, title: "News Time Analysis", subtitle: "How to handle high-impact events", duration: "25 min" },
      { id: 12, title: "Time-Based Confluences", subtitle: "Combining time with structure", duration: "28 min" }
    ]
  },
  {
    id: 4,
    slug: "institutional-framework",
    title: "Institutional Framework",
    classes: 15,
    price: 15,
    tagline: "Complete institutional trading framework।",
    thumbnail: "/images/ch4.jpg",
    gradient: "from-orange-500/20 to-red-500/5",
    hooks: ["Advanced order blocks", "FVG & IPDA", "Weekly bias models"],
    classList: [
      { id: 1, title: "Advanced Order Blocks", subtitle: "Institutional entry zones", duration: "28 min" },
      { id: 2, title: "Breaker Blocks", subtitle: "Failed OBs as reversal signals", duration: "26 min" },
      { id: 3, title: "Mitigation Blocks", subtitle: "Refined OB variations", duration: "24 min" },
      { id: 4, title: "FVG Advanced Concepts", subtitle: "BPR, IFVG, and premium FVGs", duration: "27 min" },
      { id: 5, title: "IPDA Concept", subtitle: "Interbank Price Delivery Algorithm", duration: "30 min" },
      { id: 6, title: "PD Arrays", subtitle: "Premium & discount arrays", duration: "26 min" },
      { id: 7, title: "Weekly Bias Model", subtitle: "Institutional weekly playbook", duration: "28 min" },
      { id: 8, title: "Daily Bias Framework", subtitle: "Building daily narrative", duration: "25 min" },
      { id: 9, title: "Liquidity Pools Mapping", subtitle: "Where stops actually sit", duration: "24 min" },
      { id: 10, title: "SMT Divergence", subtitle: "Inter-market correlation edge", duration: "26 min" },
      { id: 11, title: "Optimal Trade Entry (OTE)", subtitle: "The 62-79% sweet spot", duration: "27 min" },
      { id: 12, title: "Turtle Soup Setups", subtitle: "Classic institutional reversal", duration: "23 min" },
      { id: 13, title: "Judas Swing", subtitle: "First hour manipulation model", duration: "25 min" },
      { id: 14, title: "Silver Bullet Setup", subtitle: "The 1-hour precision play", duration: "28 min" },
      { id: 15, title: "Framework Integration", subtitle: "Combining all IPDA tools", duration: "32 min" }
    ]
  },
  {
    id: 5,
    slug: "professional-mindset",
    title: "Professional Trader Mindset",
    classes: 17,
    price: 17,
    tagline: "যা ৯৫% traders কখনো শেখে না।",
    thumbnail: "/images/ch5.jpg",
    gradient: "from-yellow-500/20 to-amber-500/5",
    hooks: ["Emotional discipline", "Risk psychology", "Consistency systems"],
    classList: [
      { id: 1, title: "The Professional Identity", subtitle: "Trader vs gambler mindset", duration: "22 min" },
      { id: 2, title: "Fear & Greed Cycles", subtitle: "Understanding your own bias", duration: "24 min" },
      { id: 3, title: "The FOMO Trap", subtitle: "Recognizing and neutralizing it", duration: "20 min" },
      { id: 4, title: "Revenge Trading", subtitle: "The account killer explained", duration: "23 min" },
      { id: 5, title: "Loss Acceptance", subtitle: "Why losing is part of winning", duration: "25 min" },
      { id: 6, title: "Position Sizing Psychology", subtitle: "Sleep-well risk framework", duration: "26 min" },
      { id: 7, title: "Journaling System", subtitle: "The compound growth tool", duration: "24 min" },
      { id: 8, title: "Emotional Detachment", subtitle: "Trading without ego", duration: "22 min" },
      { id: 9, title: "Discipline Rituals", subtitle: "Daily routines of pros", duration: "23 min" },
      { id: 10, title: "The Waiting Game", subtitle: "Patience as an edge", duration: "21 min" },
      { id: 11, title: "Drawdown Management", subtitle: "Surviving losing streaks", duration: "26 min" },
      { id: 12, title: "Confidence Building", subtitle: "Data-driven self-belief", duration: "22 min" },
      { id: 13, title: "Handling Big Wins", subtitle: "The euphoria danger", duration: "20 min" },
      { id: 14, title: "Screen Time Management", subtitle: "Avoiding decision fatigue", duration: "21 min" },
      { id: 15, title: "Mental Reset Protocols", subtitle: "Bouncing back fast", duration: "23 min" },
      { id: 16, title: "Long-term Vision", subtitle: "Trading as a career", duration: "24 min" },
      { id: 17, title: "Mindset Integration", subtitle: "Building the pro habit stack", duration: "28 min" }
    ]
  },
  {
    id: 6,
    slug: "high-probability-strategies",
    title: "High-Probability Strategies",
    classes: 19,
    price: 19,
    tagline: "Backtested, real edge strategies।",
    thumbnail: "/images/ch6.jpg",
    gradient: "from-rose-500/20 to-fuchsia-500/5",
    hooks: ["Sniper entries", "Confluence stacking", "Setup filtration"],
    classList: [
      { id: 1, title: "Sniper Entry Framework", subtitle: "Precision over frequency", duration: "26 min" },
      { id: 2, title: "Confluence Stacking Method", subtitle: "The 3+ factor rule", duration: "28 min" },
      { id: 3, title: "Setup Filtration System", subtitle: "Quality over quantity", duration: "24 min" },
      { id: 4, title: "London Open Strategy", subtitle: "Classic first-move play", duration: "27 min" },
      { id: 5, title: "NY Open Reversal", subtitle: "Fade the London extreme", duration: "26 min" },
      { id: 6, title: "Asian Range Breakout", subtitle: "Momentum continuation setup", duration: "24 min" },
      { id: 7, title: "Weekly Range Extremes", subtitle: "Mean reversion at HTF", duration: "25 min" },
      { id: 8, title: "Daily Bias Playbook", subtitle: "Directional day-trading", duration: "27 min" },
      { id: 9, title: "OTE Sniper Setup", subtitle: "The gold-standard entry", duration: "28 min" },
      { id: 10, title: "Silver Bullet Execution", subtitle: "Live playbook walkthrough", duration: "30 min" },
      { id: 11, title: "Judas Swing Setup", subtitle: "Fading the false move", duration: "26 min" },
      { id: 12, title: "Turtle Soup Play", subtitle: "Stop-hunt reversal", duration: "24 min" },
      { id: 13, title: "SMT Divergence Trade", subtitle: "Correlation confirmation setup", duration: "27 min" },
      { id: 14, title: "News Fade Strategy", subtitle: "Post-news reversal edge", duration: "25 min" },
      { id: 15, title: "Range Compression Break", subtitle: "Volatility expansion play", duration: "24 min" },
      { id: 16, title: "Multi-Session Continuation", subtitle: "Trending day framework", duration: "26 min" },
      { id: 17, title: "Reversal Confirmation Model", subtitle: "Catching the turn safely", duration: "28 min" },
      { id: 18, title: "Scaling & Partial Exits", subtitle: "Maximizing per-trade R", duration: "25 min" },
      { id: 19, title: "Strategy Integration", subtitle: "Your personal playbook", duration: "30 min" }
    ]
  },
  {
    id: 7,
    slug: "personal-trading-plan",
    title: "Our Personal Trading Plan (Inc. Prop)",
    classes: 22,
    price: 22,
    tagline: "আমাদের exact plan — including prop firm approach।",
    thumbnail: "/images/ch7.jpg",
    gradient: "from-indigo-500/20 to-violet-500/5",
    hooks: ["Full trading plan", "Prop firm strategies", "Daily routine blueprint"],
    classList: [
      { id: 1, title: "The Master Plan Overview", subtitle: "Our complete blueprint", duration: "28 min" },
      { id: 2, title: "Daily Preparation Routine", subtitle: "How we start every session", duration: "22 min" },
      { id: 3, title: "Pre-Market Analysis", subtitle: "Setting daily bias in 15 mins", duration: "24 min" },
      { id: 4, title: "Watchlist Building", subtitle: "Filtering the best pairs", duration: "23 min" },
      { id: 5, title: "Entry Criteria Checklist", subtitle: "Non-negotiable rules", duration: "25 min" },
      { id: 6, title: "Risk Management Rules", subtitle: "Our exact position sizing", duration: "26 min" },
      { id: 7, title: "Stop Loss Placement", subtitle: "Structural vs fixed", duration: "24 min" },
      { id: 8, title: "Take Profit Framework", subtitle: "Partials and runners", duration: "25 min" },
      { id: 9, title: "Trade Journaling Template", subtitle: "Our exact tracking system", duration: "23 min" },
      { id: 10, title: "Weekly Review Ritual", subtitle: "The 30-min improvement loop", duration: "22 min" },
      { id: 11, title: "Monthly Performance Review", subtitle: "Metrics that matter", duration: "24 min" },
      { id: 12, title: "Prop Firm Introduction", subtitle: "Why prop is the shortcut", duration: "26 min" },
      { id: 13, title: "Choosing the Right Prop", subtitle: "Firm comparison framework", duration: "24 min" },
      { id: 14, title: "Passing the Challenge", subtitle: "Our exact challenge strategy", duration: "28 min" },
      { id: 15, title: "Verification Phase Play", subtitle: "Conservative-mode execution", duration: "26 min" },
      { id: 16, title: "Funded Account Management", subtitle: "Protecting the capital", duration: "27 min" },
      { id: 17, title: "Scaling Prop Accounts", subtitle: "Multiple funded strategy", duration: "25 min" },
      { id: 18, title: "Payout Optimization", subtitle: "Maximizing withdrawals", duration: "24 min" },
      { id: 19, title: "Combining Personal + Prop", subtitle: "The dual capital model", duration: "26 min" },
      { id: 20, title: "Long-Term Career Plan", subtitle: "5-year trading roadmap", duration: "28 min" },
      { id: 21, title: "Tax & Business Setup", subtitle: "Treating trading as business", duration: "24 min" },
      { id: 22, title: "The Full Integration", subtitle: "Everything working together", duration: "32 min" }
    ]
  }
];

export const pricing = {
  tier1Total: 99,
  tier2Bundle: 79,
  savings: 20,
  prioritySupport: 8,
  totalClasses: 99
};
