// Festival and moment calendar (SG-04), India-first. Fixed dates are exact; lunar festivals
// follow the Hindu and Islamic calendars and can differ by a day by region or moon sighting,
// so they are marked approximate. 2026 dates follow the Government of India holiday lists;
// 2027 dates follow published panchang calendars. Spaces add their own dates on top.
import { addDays, isoDate, type LocalDate } from "@/lib/analytics/time";

export type Region = "pan-india" | "north" | "south" | "east" | "west" | "global";
export const REGIONS: Record<Region, string> = {
  "pan-india": "All India",
  north: "North India",
  south: "South India",
  east: "East India",
  west: "West India",
  global: "Global",
};

export interface Moment {
  id: string;
  name: string;
  date: string;
  region: Region;
  kind: "festival" | "national" | "day" | "shopping" | "custom";
  approximate?: boolean;
  /** A campaign angle to start from. */
  idea?: string;
  /** Start teasers this many days before. */
  leadDays?: number;
  note?: string;
}

type Seed = Omit<Moment, "id" | "date"> & { dates: Partial<Record<number, string>> };

const LUNAR: Seed[] = [
  { name: "Lohri", region: "north", kind: "festival", dates: { 2026: "01-13", 2027: "01-13" }, idea: "Bonfire-night specials and a winter warm-up offer.", leadDays: 5 },
  { name: "Makar Sankranti & Pongal", region: "pan-india", kind: "festival", dates: { 2026: "01-14", 2027: "01-15" }, idea: "Harvest-season greetings; til-gud or Pongal specials.", leadDays: 5 },
  { name: "Vasant Panchami", region: "north", kind: "festival", dates: { 2026: "01-23", 2027: "02-11" }, idea: "Yellow-themed post or a spring launch.", leadDays: 3 },
  { name: "Maha Shivaratri", region: "pan-india", kind: "festival", dates: { 2026: "02-15", 2027: "03-06" }, idea: "Respectful greeting post; skip hard selling.", leadDays: 2 },
  { name: "Holi", region: "pan-india", kind: "festival", dates: { 2026: "03-04", 2027: "03-22" }, idea: "Colour-themed reel, a Holi combo or gift box.", leadDays: 10 },
  { name: "Ugadi & Gudi Padwa", region: "west", kind: "festival", dates: { 2026: "03-19", 2027: "04-07" }, idea: "New-year greetings for Maharashtra, Karnataka, Telangana and Andhra.", leadDays: 4 },
  { name: "Eid al-Fitr", region: "pan-india", kind: "festival", dates: { 2026: "03-20", 2027: "03-10" }, idea: "Eid greetings, iftar or festive specials.", leadDays: 7 },
  { name: "Ram Navami", region: "north", kind: "festival", dates: { 2026: "03-27", 2027: "04-15" }, idea: "Greeting post.", leadDays: 2 },
  { name: "Baisakhi", region: "north", kind: "festival", dates: { 2026: "04-14", 2027: "04-14" }, idea: "Harvest celebration; Punjab-flavoured specials.", leadDays: 5 },
  { name: "Akshaya Tritiya", region: "pan-india", kind: "festival", dates: { 2026: "04-19", 2027: "05-09" }, idea: "An auspicious day to buy: launches, gold or new-beginning offers.", leadDays: 7 },
  { name: "Eid al-Adha", region: "pan-india", kind: "festival", dates: { 2026: "05-27", 2027: "05-17" }, idea: "Festive greetings and family feast ideas.", leadDays: 5 },
  { name: "Onam", region: "south", kind: "festival", dates: { 2026: "08-25" }, idea: "Onasadya, pookalam and Kerala-themed content.", leadDays: 10 },
  { name: "Raksha Bandhan", region: "pan-india", kind: "festival", dates: { 2026: "08-28", 2027: "08-17" }, idea: "Sibling stories, gift hampers, “tag your sibling”.", leadDays: 10 },
  { name: "Janmashtami", region: "pan-india", kind: "festival", dates: { 2026: "09-04", 2027: "08-25" }, idea: "Dahi handi energy; kids in costume UGC.", leadDays: 4 },
  { name: "Ganesh Chaturthi", region: "west", kind: "festival", dates: { 2026: "09-14", 2027: "09-04" }, idea: "Modak specials, eco-friendly celebration content.", leadDays: 7 },
  { name: "Navratri", region: "pan-india", kind: "festival", dates: { 2026: "10-11", 2027: "09-30" }, idea: "Nine nights from this day: nine colours, a daily series.", leadDays: 7 },
  { name: "Durga Puja", region: "east", kind: "festival", dates: { 2026: "10-18" }, idea: "Saptami to Dashami: pandal-hopping guides and festive looks.", leadDays: 10 },
  { name: "Dussehra", region: "pan-india", kind: "festival", dates: { 2026: "10-20", 2027: "10-09" }, idea: "Good over evil: before-and-after or a “burn the old” offer.", leadDays: 5 },
  { name: "Karwa Chauth", region: "north", kind: "festival", dates: { 2026: "10-29", 2027: "10-18" }, idea: "Couple stories, gifting and beauty content.", leadDays: 7 },
  { name: "Dhanteras", region: "pan-india", kind: "shopping", dates: { 2026: "11-06", 2027: "10-27" }, idea: "The biggest buying day: launch offers here.", leadDays: 10 },
  { name: "Diwali", region: "pan-india", kind: "festival", dates: { 2026: "11-08", 2027: "10-29" }, idea: "Gift guides, hampers, behind-the-scenes of festive prep.", leadDays: 21 },
  { name: "Bhai Dooj", region: "north", kind: "festival", dates: { 2026: "11-11", 2027: "10-31" }, idea: "Sibling gifting, a follow-up to Diwali.", leadDays: 3 },
  { name: "Chhath Puja", region: "east", kind: "festival", dates: { 2026: "11-15", 2027: "11-04" }, idea: "Respectful greetings for Bihar and eastern UP audiences.", leadDays: 3 },
  { name: "Guru Nanak Jayanti", region: "north", kind: "festival", dates: { 2026: "11-24" }, idea: "Langar and seva stories; greeting post.", leadDays: 2 },
];

const FIXED: (Omit<Moment, "id" | "date"> & { md: string })[] = [
  { name: "New Year’s Day", md: "01-01", region: "global", kind: "day", idea: "Year-in-review reel or new-year resolutions.", leadDays: 7 },
  { name: "Republic Day", md: "01-26", region: "pan-india", kind: "national", idea: "Tricolour creative; long-weekend offers.", leadDays: 3 },
  { name: "Valentine’s Day", md: "02-14", region: "global", kind: "day", idea: "Date-night specials, couple UGC, gifting.", leadDays: 10 },
  { name: "Women’s Day", md: "03-08", region: "global", kind: "day", idea: "Spotlight the women on your team or among your customers.", leadDays: 5 },
  { name: "Earth Day", md: "04-22", region: "global", kind: "day", idea: "Show one real sustainability step you take.", leadDays: 3 },
  { name: "International Yoga Day", md: "06-21", region: "global", kind: "day", idea: "Wellness tips that fit your brand.", leadDays: 3 },
  { name: "Doctors’ Day", md: "07-01", region: "pan-india", kind: "day", idea: "Thank-you post; offers for healthcare workers.", leadDays: 2 },
  { name: "Independence Day", md: "08-15", region: "pan-india", kind: "national", idea: "Made-in-India story, freedom-sale offers.", leadDays: 5 },
  { name: "Teachers’ Day", md: "09-05", region: "pan-india", kind: "day", idea: "Thank a teacher; student offers.", leadDays: 3 },
  { name: "International Coffee Day", md: "10-01", region: "global", kind: "day", idea: "Coffee facts, brew tips, a coffee-day offer.", leadDays: 5 },
  { name: "Gandhi Jayanti", md: "10-02", region: "pan-india", kind: "national", idea: "Simple living, khadi or local-maker stories.", leadDays: 2 },
  { name: "World Food Day", md: "10-16", region: "global", kind: "day", idea: "Food waste, local produce or a signature dish story.", leadDays: 3 },
  { name: "Halloween", md: "10-31", region: "global", kind: "day", idea: "Spooky specials for younger audiences in metros.", leadDays: 5 },
  { name: "Children’s Day", md: "11-14", region: "pan-india", kind: "day", idea: "Kids’ menu, nostalgia posts, family offers.", leadDays: 3 },
  { name: "Christmas", md: "12-25", region: "global", kind: "festival", idea: "Plum cake, gifting, Secret Santa content.", leadDays: 14 },
  { name: "New Year’s Eve", md: "12-31", region: "global", kind: "day", idea: "Party plans, countdown content, year-end thank-you.", leadDays: 10 },
];

/** Moments whose date depends on the weekday (Mother’s Day, Black Friday…). */
function floating(year: number): Moment[] {
  const nth = (month: number, weekday: number, n: number) => {
    // weekday: 0 = Monday … 6 = Sunday
    const first = addDays({ year, month, day: 1 }, 0);
    const offset = (weekday - first.weekday + 7) % 7;
    return isoDate(addDays(first, offset + 7 * (n - 1)));
  };
  const thanksgiving = nth(11, 3, 4);
  const blackFriday = isoDate(addDays({ year, month: 11, day: Number(thanksgiving.slice(8)) }, 1));
  return [
    { id: `mothers-day-${year}`, name: "Mother’s Day", date: nth(5, 6, 2), region: "global", kind: "day", idea: "Stories of mothers, gifting, a “bring your mother” offer.", leadDays: 10 },
    { id: `fathers-day-${year}`, name: "Father’s Day", date: nth(6, 6, 3), region: "global", kind: "day", idea: "Dad stories and gifting.", leadDays: 7 },
    { id: `friendship-day-${year}`, name: "Friendship Day", date: nth(8, 6, 1), region: "pan-india", kind: "day", idea: "“Tag your best friend” contest, bring-a-friend offer.", leadDays: 5 },
    { id: `black-friday-${year}`, name: "Black Friday", date: blackFriday, region: "global", kind: "shopping", idea: "Biggest discount of the year for online shoppers.", leadDays: 10 },
  ];
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export function momentsForYear(year: number): Moment[] {
  const lunar = LUNAR.filter((m) => m.dates[year]).map(({ dates, ...m }) => ({ ...m, id: `${slug(m.name)}-${year}`, date: `${year}-${dates[year]}`, approximate: true }));
  const fixed = FIXED.map(({ md, ...m }) => ({ ...m, id: `${slug(m.name)}-${year}`, date: `${year}-${md}` }));
  return [...lunar, ...fixed, ...floating(year)].sort((a, b) => a.date.localeCompare(b.date));
}

/** Years the built-in calendar covers; later years show custom dates only. */
export const COVERED_YEARS = [2026, 2027];

/** Moments from `from` for `days` days, for the chosen regions (All India and Global always), plus custom ones. */
export function upcomingMoments(from: LocalDate, days: number, opts: { regions?: Region[]; custom?: Moment[] } = {}) {
  const start = isoDate(from);
  const end = isoDate(addDays(from, days));
  const wanted = new Set<Region>(["pan-india", "global", ...(opts.regions ?? ["north", "south", "east", "west"])]);
  const builtIn = [from.year, from.year + 1].flatMap(momentsForYear);
  return [...builtIn.filter((m) => wanted.has(m.region)), ...(opts.custom ?? [])]
    .filter((m) => m.date >= start && m.date < end)
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}
