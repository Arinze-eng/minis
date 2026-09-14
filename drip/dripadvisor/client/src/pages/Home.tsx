import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  CloudSun,
  FileImage,
  Heart,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  ScanLine,
  Search,
  Shirt,
  Sparkles,
  SlidersHorizontal,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

type Tab = "overview" | "wardrobe" | "looks";
type GarmentCategory = "Tops" | "Bottoms" | "Outerwear" | "Shoes";

type Garment = {
  id: number;
  name: string;
  category: GarmentCategory;
  color: string;
  tone: string;
  art: "tee" | "trouser" | "jacket" | "shoe";
  status?: "new" | "analyzed";
};

const initialGarments: Garment[] = [
  { id: 1, name: "Boxy Oxford", category: "Tops", color: "Soft blue", tone: "blue", art: "tee", status: "analyzed" },
  { id: 2, name: "Pleated Trouser", category: "Bottoms", color: "Charcoal", tone: "charcoal", art: "trouser", status: "analyzed" },
  { id: 3, name: "Utility Overshirt", category: "Outerwear", color: "Olive", tone: "olive", art: "jacket", status: "analyzed" },
  { id: 4, name: "Retro Runner", category: "Shoes", color: "Cream / green", tone: "cream", art: "shoe", status: "analyzed" },
  { id: 5, name: "Merino Knit", category: "Tops", color: "Warm sand", tone: "sand", art: "tee", status: "analyzed" },
  { id: 6, name: "Straight Denim", category: "Bottoms", color: "Washed indigo", tone: "indigo", art: "trouser", status: "analyzed" },
  { id: 7, name: "Rain Shell", category: "Outerwear", color: "Ink black", tone: "black", art: "jacket", status: "analyzed" },
  { id: 8, name: "Canvas High", category: "Shoes", color: "Off white", tone: "white", art: "shoe", status: "analyzed" },
];

const lookCards = [
  {
    id: "look-01",
    label: "01 / Everyday polish",
    title: "Clean lines, zero overthinking.",
    note: "A soft contrast between the Oxford and charcoal trouser keeps this easy enough for a Monday but considered enough for plans after work.",
    items: [1, 2, 4],
    accent: "blue",
    score: "94% match",
  },
  {
    id: "look-02",
    label: "02 / Layered utility",
    title: "The jacket does the talking.",
    note: "The olive overshirt adds texture without competing with the tonal base. Built for a cool commute and a long day out.",
    items: [3, 5, 6, 8],
    accent: "olive",
    score: "88% match",
  },
];

function mapCategory(category: string): GarmentCategory {
  if (category === "bottom") return "Bottoms";
  if (category === "outerwear") return "Outerwear";
  if (category === "shoes") return "Shoes";
  return "Tops";
}

function mapTone(colors: string[]) {
  const color = colors.join(" ").toLowerCase();
  if (color.includes("blue") || color.includes("indigo")) return color.includes("indigo") ? "indigo" : "blue";
  if (color.includes("olive") || color.includes("green")) return "olive";
  if (color.includes("cream") || color.includes("white")) return "cream";
  if (color.includes("sand") || color.includes("beige") || color.includes("brown")) return "sand";
  if (color.includes("black") || color.includes("ink")) return "black";
  return "charcoal";
}

function mapArt(category: GarmentCategory): Garment["art"] {
  if (category === "Bottoms") return "trouser";
  if (category === "Outerwear") return "jacket";
  if (category === "Shoes") return "shoe";
  return "tee";
}

function GarmentArt({ garment, small = false }: { garment: Garment; small?: boolean }) {
  const size = small ? "h-16 w-16" : "h-28 w-full";
  const toneMap: Record<string, string> = {
    blue: "from-[#c9e3ec] via-[#dcebf0] to-[#8fbac8]",
    charcoal: "from-[#6c7074] via-[#313438] to-[#151719]",
    olive: "from-[#a3ac76] via-[#697352] to-[#343a2e]",
    cream: "from-[#ece7d8] via-[#d7d2bf] to-[#8c9f6d]",
    sand: "from-[#e8d7bf] via-[#c9ae8d] to-[#987758]",
    indigo: "from-[#6a82a0] via-[#3d5876] to-[#26364f]",
    black: "from-[#4b4e50] via-[#202224] to-[#090a0b]",
    white: "from-white via-[#eeeae0] to-[#bab9b1]",
  };
  const art = garment.art === "shoe" ? "rounded-[26px] rotate-[-8deg]" : garment.art === "trouser" ? "rounded-t-[28px] rounded-b-[12px]" : garment.art === "jacket" ? "rounded-[24px]" : "rounded-[22px] rounded-b-[30px]";
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${toneMap[garment.tone] ?? toneMap.charcoal} ${size}`}>
      <div className={`absolute inset-x-[18%] top-[13%] bottom-[12%] bg-white/10 ${art}`} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.45),transparent_34%)]" />
      {!small && <span className="absolute bottom-2 left-3 rounded-full bg-black/15 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/80">{garment.category.slice(0, -1)}</span>}
    </div>
  );
}

function SectionLabel({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#7f827c]">{eyebrow}</p>
        <h2 className="font-display text-2xl font-semibold tracking-[-0.04em] text-[#1f211f]">{title}</h2>
      </div>
      {action && <button onClick={onAction} className="group flex items-center gap-1 text-xs font-semibold text-[#777b73] transition-colors hover:text-[#1f211f]">{action}<ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></button>}
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("overview");
  const [garments, setGarments] = useState(initialGarments);
  const wardrobeQuery = trpc.wardrobe.list.useQuery();
  const outfitsQuery = trpc.outfits.list.useQuery();
  const [location, setLocation] = useState({ latitude: 51.5074, longitude: -0.1278 });
  const weatherQuery = trpc.weather.current.useQuery(location, { staleTime: 10 * 60 * 1000 });
  const integrationQuery = trpc.integrations.status.useQuery();
  const analyzeMutation = trpc.wardrobe.analyzeAndCreate.useMutation();
  const recommendMutation = trpc.outfits.recommend.useMutation();
  const feedbackMutation = trpc.outfits.feedback.useMutation();
  const previewMutation = trpc.outfits.generatePreview.useMutation();
  const tryOnMutation = trpc.outfits.tryOn.useMutation();
  const [activeCategory, setActiveCategory] = useState<GarmentCategory | "All">("All");
  const [wardrobeSearch, setWardrobeSearch] = useState("");
  const [prompt, setPrompt] = useState("Give me something polished for a cool office day");
  const [preferences, setPreferences] = useState("Prefer clean, comfortable outfits with understated colors and one considered detail.");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedLook, setSelectedLook] = useState("look-01");
  const [savedLooks, setSavedLooks] = useState<string[]>([]);
  const [liveLooks, setLiveLooks] = useState<typeof lookCards>(lookCards);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewConsent, setPreviewConsent] = useState(false);
  const [showTryOn, setShowTryOn] = useState(false);
  const [tryOnConsent, setTryOnConsent] = useState(false);
  const [tryOnUrl, setTryOnUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const personInputRef = useRef<HTMLInputElement>(null);
  const clothingInputRef = useRef<HTMLInputElement>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!wardrobeQuery.data?.length) return;
    setGarments(wardrobeQuery.data.map((item) => {
      const category = mapCategory(item.category);
      return {
        id: item.id,
        name: item.name,
        category,
        color: item.colors.join(" / ") || "Needs confirmation",
        tone: mapTone(item.colors),
        art: mapArt(category),
        status: item.status === "needs_confirmation" ? "new" : "analyzed",
      };
    }));
  }, [wardrobeQuery.data]);

  useEffect(() => {
    if (!outfitsQuery.data?.length) return;
    setLiveLooks(outfitsQuery.data.map((outfit, index) => ({
      id: `live-${outfit.id}`,
      label: `${String(index + 1).padStart(2, "0")} / Saved recommendation`,
      title: outfit.title,
      note: outfit.note,
      items: outfit.itemIds,
      accent: index % 2 === 0 ? "blue" : "olive",
      score: `${outfit.score}% match`,
    })));
    setSelectedLook(`live-${outfitsQuery.data[0]?.id ?? ""}`);
  }, [outfitsQuery.data]);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition((position) => setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }));
  }, []);

  const visibleGarments = useMemo(
    () => garments.filter((item) => (activeCategory === "All" || item.category === activeCategory) && `${item.name} ${item.color}`.toLowerCase().includes(wardrobeSearch.toLowerCase())),
    [activeCategory, garments, wardrobeSearch],
  );

  const runStylist = () => {
    setIsAnalyzing(true);
    recommendMutation.mutate({ requestText: prompt, preferences, weather: weatherQuery.data ? { temperatureC: weatherQuery.data.temperatureC, precipitationProbability: weatherQuery.data.precipitationProbability, condition: weatherQuery.data.condition } : undefined }, {
      onSuccess: (result) => {
        setLiveLooks(result.outfits.map((outfit, index) => ({
          id: `live-${outfit.id}`,
          label: `${String(index + 1).padStart(2, "0")} / Muse recommendation`,
          title: outfit.title,
          note: outfit.note,
          items: outfit.itemIds,
          accent: index % 2 === 0 ? "blue" : "olive",
          score: `${outfit.score}% match`,
        })));
        setSelectedLook(`live-${result.outfits[0]?.id ?? ""}`);
        setTab("looks");
        setIsAnalyzing(false);
      },
      onError: () => setIsAnalyzing(false),
    });
  };

  const handleUpload = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      analyzeMutation.mutate({ imageDataUrl: String(reader.result) }, {
        onSuccess: (result) => {
          const category = mapCategory(result.item.category);
          setGarments((current) => [{ id: result.item.id, name: result.item.name, category, color: result.item.colors.join(" / "), tone: mapTone(result.item.colors), art: mapArt(category), status: "new" }, ...current.filter((item) => item.id !== result.item.id)]);
          setShowUpload(false);
          setTab("wardrobe");
        },
      });
    };
    reader.readAsDataURL(file);
  };

  const toggleSaved = (lookId: string) => {
    setSavedLooks((current) => current.includes(lookId) ? current.filter((id) => id !== lookId) : [...current, lookId]);
    const numericId = Number(lookId.replace("live-", ""));
    if (Number.isFinite(numericId)) feedbackMutation.mutate({ outfitId: numericId, decision: "saved" });
  };

  const selectedLiveLook = liveLooks.find((look) => look.id === selectedLook) ?? liveLooks[0];
  const generateSelectedPreview = () => {
    if (!selectedLiveLook) return;
    if (!previewConsent) {
      window.alert("Please confirm that you understand this is an AI-generated visual approximation.");
      return;
    }
    previewMutation.mutate({
      outfitId: Number(selectedLiveLook.id.replace("live-", "")) || 1,
      title: selectedLiveLook.title,
      itemNames: selectedLiveLook.items.map((id) => garments.find((item) => item.id === id)?.name ?? "wardrobe piece"),
      noticeAccepted: true,
    }, { onSuccess: (result) => setPreviewUrl(result.url ?? null) });
  };
  const readImage = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const handleTryOn = async (person?: File, clothing?: FileList | null) => {
    if (!person || !clothing?.length) return;
    if (!tryOnConsent) {
      window.alert("Please confirm that you understand this is an AI-generated try-on image.");
      return;
    }
    const clothingFiles = Array.from(clothing).slice(0, 5);
    const [personImageDataUrl, ...clothingImageDataUrls] = await Promise.all([person, ...clothingFiles].map(readImage));
    tryOnMutation.mutate({ personImageDataUrl, clothingImageDataUrls, request: prompt, noticeAccepted: true }, {
      onSuccess: (result) => setTryOnUrl(result.url ?? null),
    });
  };

  return (
    <div className="min-h-screen bg-[#f5f4ef] text-[#1f211f]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[238px] flex-col bg-[#1e211f] px-5 py-6 text-[#f7f5ee] lg:flex">
        <div className="flex items-center gap-3 px-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#d7f36a] text-[#1e211f]"><Sparkles className="h-4 w-4" /></div>
          <div><p className="font-display text-lg font-semibold tracking-[-0.05em]">DripAdvisor</p><p className="text-[9px] uppercase tracking-[0.2em] text-white/40">Your wardrobe, unlocked</p></div>
        </div>

        <div className="mt-16 space-y-1">
          {([
            ["overview", LayoutGrid, "Overview"],
            ["wardrobe", Shirt, "My wardrobe"],
            ["looks", WandSparkles, "Saved looks"],
          ] as const).map(([key, Icon, label]) => (
            <button key={key} onClick={() => setTab(key)} className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm transition-colors ${tab === key ? "bg-white/10 text-white" : "text-white/45 hover:bg-white/5 hover:text-white"}`}>
              <span className="flex items-center gap-3"><Icon className="h-4 w-4" />{label}</span>
              {key === "looks" && savedLooks.length > 0 && <span className="rounded-full bg-[#d7f36a] px-2 py-0.5 text-[10px] font-bold text-[#1e211f]">{savedLooks.length}</span>}
            </button>
          ))}
        </div>

        <div className="mt-auto rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="mb-5 flex items-start justify-between"><span className="rounded-full bg-[#e5b1ff] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#332138]">Preview mode</span><CircleHelp className="h-4 w-4 text-white/30" /></div>
          <p className="text-sm leading-5 text-white/80">{integrationQuery.data?.neonConfigured ? "Connected to Neon with secure image storage." : "Your wardrobe is local to this demo. Connect your account when you are ready."}</p>
          <div className="mt-4 h-1 rounded-full bg-white/10"><div className="h-1 w-2/3 rounded-full bg-[#d7f36a]" /></div>
          <p className="mt-2 text-[10px] text-white/35">{integrationQuery.data?.assetProvider === "cloudinary" ? "Muse Spark · Neon · Cloudinary" : "Muse Spark · Neon · Manus storage"}</p>
        </div>
      </aside>

      <main className="min-h-screen lg:pl-[238px]">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-black/[0.06] bg-[#f5f4ef]/90 px-5 py-4 backdrop-blur-xl sm:px-8 lg:px-12">
          <div className="flex items-center gap-3 lg:hidden"><div className="grid h-8 w-8 place-items-center rounded-lg bg-[#1e211f] text-[#d7f36a]"><Sparkles className="h-4 w-4" /></div><span className="font-display font-semibold">DripAdvisor</span></div>
          <div className="hidden text-sm text-[#74776f] lg:block">Saturday, September 12 <span className="mx-2 text-black/20">/</span> Your style command center</div>
          <div className="flex items-center gap-2 sm:gap-3"><button onClick={() => { setTab("overview"); window.setTimeout(() => promptInputRef.current?.focus(), 0); }} aria-label="Search your wardrobe" className="grid h-9 w-9 place-items-center rounded-full border border-black/10 text-[#6b6f68] transition hover:bg-white"><Search className="h-4 w-4" /></button><button onClick={() => setPreferences((value) => value ? "" : "Prefer clean, comfortable outfits with understated colors and one considered detail.")} className="flex h-9 items-center gap-2 rounded-full border border-black/10 bg-white px-3 text-xs font-semibold"><span className="grid h-5 w-5 place-items-center rounded-full bg-[#e5b1ff] text-[9px]">JS</span><span className="hidden sm:inline">Preview user</span></button></div>
        </header>

        <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
          {tab === "overview" && <>
            <section className="relative overflow-hidden rounded-[28px] bg-[#d7f36a] px-6 py-8 sm:px-10 sm:py-10 lg:px-14 lg:py-12">
              <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full border-[42px] border-[#a2bc41]/30" /><div className="absolute -bottom-36 right-32 h-72 w-72 rounded-full border-[30px] border-[#f5f4ef]/30" />
              <div className="relative max-w-2xl"><div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#4d5e1b]"><span className="h-2 w-2 rounded-full bg-[#4d5e1b]" /> {integrationQuery.data?.museConfigured ? "Muse Spark online" : "Stylist fallback online"}</div><h1 className="max-w-xl font-display text-4xl font-semibold leading-[0.95] tracking-[-0.07em] text-[#1e211e] sm:text-6xl">Get dressed like you already know what you’re doing.</h1><p className="mt-5 max-w-lg text-sm leading-6 text-[#46511f] sm:text-base">Tell me where you’re going, how you want to feel, or just what you want to wear. I’ll work with what you already own.</p>
                <div className="mt-7 flex max-w-xl flex-col gap-2 rounded-2xl bg-white p-2 shadow-[0_12px_35px_rgba(53,68,8,0.14)] sm:flex-row sm:items-center"><Sparkles className="ml-3 hidden h-4 w-4 text-[#7a9140] sm:block" /><Input ref={promptInputRef} value={prompt} onChange={(event) => setPrompt(event.target.value)} className="h-11 border-0 bg-transparent px-3 text-sm shadow-none focus-visible:ring-0" placeholder="Ask your wardrobe anything..." /><Button onClick={runStylist} className="h-11 rounded-xl bg-[#1e211f] px-5 text-sm font-semibold text-white hover:bg-[#30352f]">{isAnalyzing ? "Styling..." : "Style me"}<ArrowUpRight className="ml-2 h-4 w-4" /></Button><Button onClick={() => setShowTryOn(true)} variant="outline" className="h-11 rounded-xl border-black/10 bg-white px-4 text-sm font-semibold text-[#1e211f] hover:bg-[#f1f1e9]">Try it on<Camera className="ml-2 h-4 w-4" /></Button></div>
                <div className="mt-3 flex max-w-xl items-center gap-2 rounded-xl border border-[#758c2a]/20 bg-white/35 px-3 py-2"><Sparkles className="h-3.5 w-3.5 shrink-0 text-[#71852c]" /><input value={preferences} onChange={(event) => setPreferences(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[11px] text-[#536322] outline-none placeholder:text-[#7d8b54]" placeholder="Tell Muse your style preferences..." /></div>
                <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => setPrompt("Something for a dinner date") } className="rounded-full border border-[#758c2a]/30 px-3 py-1.5 text-[11px] font-medium text-[#536322] hover:bg-white/40">Dinner date</button><button onClick={() => setPrompt("Make my jacket the hero") } className="rounded-full border border-[#758c2a]/30 px-3 py-1.5 text-[11px] font-medium text-[#536322] hover:bg-white/40">Make my jacket the hero</button><button onClick={() => setPrompt("Something easy for a rainy day") } className="rounded-full border border-[#758c2a]/30 px-3 py-1.5 text-[11px] font-medium text-[#536322] hover:bg-white/40">Rainy day</button></div>
              </div>
              <div className="absolute bottom-8 right-12 hidden w-44 rotate-6 rounded-[22px] bg-[#1e211f] p-3 shadow-2xl xl:block"><div className="rounded-[15px] bg-[#f3eedf] p-3"><div className="mb-12 flex items-start justify-between"><span className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#7b806e]">Today's read</span><CloudSun className="h-4 w-4 text-[#d2a341]" /></div><p className="font-display text-4xl font-semibold">19°</p><p className="mt-1 text-[10px] text-[#7b806e]">Cool, bright, breezy</p><div className="mt-5 border-t border-black/10 pt-3 text-[9px] font-semibold text-[#59634d]">Layer up · stay light</div></div></div>
            </section>

            <section className="mt-10"><SectionLabel eyebrow="Your edit" title="A little context goes a long way." action="View wardrobe" onAction={() => setTab("wardrobe")} /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-2xl bg-[#1e211f] p-5 text-white sm:col-span-2"><div className="flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Wardrobe health</p><p className="mt-4 font-display text-4xl font-semibold tracking-[-0.06em]">{garments.length} pieces</p></div><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#d7f36a] text-[#1e211f]"><Shirt className="h-4 w-4" /></div></div><div className="mt-8 flex items-end gap-1"><div className="h-3 w-4 rounded-t bg-[#d7f36a]" /><div className="h-5 w-4 rounded-t bg-[#d7f36a]" /><div className="h-8 w-4 rounded-t bg-[#d7f36a]" /><div className="h-6 w-4 rounded-t bg-[#d7f36a]" /><div className="h-11 w-4 rounded-t bg-[#d7f36a]" /><div className="h-14 w-4 rounded-t bg-[#e5b1ff]" /><span className="ml-3 text-[10px] text-white/40">+ add 4 more for sharper recommendations</span></div></div><div className="rounded-2xl border border-black/[0.07] bg-white p-5"><div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#989b92]">Today</p><CloudSun className="h-4 w-4 text-[#c7942e]" /></div><p className="mt-4 font-display text-3xl font-semibold tracking-[-0.06em]">19° / 12°</p><p className="mt-1 text-xs text-[#777b73]">Light layers, no umbrella</p><div className="mt-6 rounded-xl bg-[#f5f4ef] px-3 py-2 text-[10px] font-semibold text-[#656a61]">Best window: 10am – 7pm</div></div><button onClick={() => setShowUpload(true)} className="group rounded-2xl border border-dashed border-[#b4b7ad] bg-transparent p-5 text-left transition hover:border-[#1e211f] hover:bg-white"><div className="flex items-center justify-between"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#e5b1ff] text-[#38263d]"><Plus className="h-4 w-4" /></div><ArrowUpRight className="h-4 w-4 text-[#969a91] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div><p className="mt-6 font-display text-xl font-semibold tracking-[-0.04em]">Add a piece</p><p className="mt-1 text-xs leading-5 text-[#777b73]">Upload a photo and let Muse Spark read the details.</p></button></div></section>

            <section className="mt-12"><SectionLabel eyebrow="The shortlist" title="Looks for your next yes." action="See all looks" onAction={() => setTab("looks")} /><div className="grid gap-5 xl:grid-cols-2">{liveLooks.map((look) => <article key={look.id} className="group overflow-hidden rounded-[24px] border border-black/[0.07] bg-white transition hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(32,33,31,0.08)]"><div className={`relative h-48 overflow-hidden ${look.accent === "blue" ? "bg-[#d6e9e8]" : "bg-[#d9ddcc]"}`}><div className="absolute left-7 top-7 rounded-full bg-white/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-[#555b4d] backdrop-blur">{look.label}</div><div className="absolute -bottom-16 left-[22%] h-56 w-36 rotate-[-10deg] rounded-[46px] bg-[#f2ead9] shadow-xl" /><div className={`absolute -bottom-20 left-[41%] h-64 w-32 rotate-[8deg] rounded-t-[32px] ${look.accent === "blue" ? "bg-[#5d88a1]" : "bg-[#667055]"} shadow-xl`} /><div className="absolute -bottom-8 right-[20%] h-32 w-40 rotate-[-4deg] rounded-[60%_30%_35%_40%] bg-[#efeee8] shadow-xl" /><div className="absolute bottom-4 right-5 rounded-full bg-[#1e211f] px-3 py-1.5 text-[10px] font-bold text-[#d7f36a]">{look.score}</div></div><div className="p-5"><div className="flex items-start justify-between gap-4"><div><h3 className="font-display text-xl font-semibold tracking-[-0.05em]">{look.title}</h3><p className="mt-2 max-w-md text-xs leading-5 text-[#777b73]">{look.note}</p></div><button onClick={() => toggleSaved(look.id)} className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition ${savedLooks.includes(look.id) ? "border-[#b4cd4d] bg-[#d7f36a] text-[#1e211f]" : "border-black/10 text-[#92968d] hover:bg-[#f5f4ef]"}`}><Heart className={`h-4 w-4 ${savedLooks.includes(look.id) ? "fill-current" : ""}`} /></button></div><div className="mt-5 flex items-center justify-between"><div className="flex -space-x-2">{look.items.map((id) => { const item = garments.find((garment) => garment.id === id); return item ? <div key={id} className="h-8 w-8 overflow-hidden rounded-full border-2 border-white"><GarmentArt garment={item} small /></div> : null; })}</div><button onClick={() => { setSelectedLook(look.id); setTab("looks"); }} className="flex items-center gap-1 text-xs font-bold text-[#4c5542] hover:text-[#1e211f]">Open look <ArrowUpRight className="h-3.5 w-3.5" /></button></div></div></article>)}</div></section>
          </>}

          {tab === "wardrobe" && <section><div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#7f827c]">The inventory</p><h1 className="font-display text-4xl font-semibold tracking-[-0.07em]">My wardrobe<span className="text-[#abbf45]">.</span></h1><p className="mt-3 max-w-lg text-sm leading-6 text-[#777b73]">Everything you own, organized for better decisions. Add a photo and confirm what Muse Spark sees.</p></div><Button onClick={() => setShowUpload(true)} className="h-11 rounded-xl bg-[#1e211f] text-white hover:bg-[#30352f]"><Upload className="mr-2 h-4 w-4" /> Add garment</Button></div><div className="mb-6 flex flex-wrap items-center gap-2"><div className="mr-2 flex h-10 items-center gap-2 rounded-xl border border-black/10 bg-white px-3"><Search className="h-4 w-4 text-[#9b9e95]" /><input value={wardrobeSearch} onChange={(event) => setWardrobeSearch(event.target.value)} className="w-36 bg-transparent text-xs outline-none placeholder:text-[#a4a69e]" placeholder="Search pieces" /></div>{(["All", "Tops", "Bottoms", "Outerwear", "Shoes"] as const).map((category) => <button key={category} onClick={() => setActiveCategory(category)} className={`rounded-full px-4 py-2 text-xs font-semibold transition ${activeCategory === category ? "bg-[#1e211f] text-white" : "bg-white text-[#777b73] hover:bg-[#e8e8e1]"}`}>{category}</button>)}<button className="ml-auto grid h-9 w-9 place-items-center rounded-full border border-black/10 bg-white text-[#777b73]"><SlidersHorizontal className="h-4 w-4" /></button></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{visibleGarments.map((garment) => <article key={garment.id} className="group overflow-hidden rounded-2xl border border-black/[0.07] bg-white"><div className="relative"><GarmentArt garment={garment} /><button onClick={() => setGarments((current) => current.filter((item) => item.id !== garment.id))} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/80 text-[#7f827c] opacity-0 backdrop-blur transition group-hover:opacity-100 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>{garment.status === "new" && <span className="absolute bottom-3 right-3 rounded-full bg-[#e5b1ff] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[#3e2b43]">Confirm</span>}</div><div className="p-3.5"><div className="flex items-start justify-between gap-2"><div><h3 className="text-sm font-semibold capitalize">{garment.name}</h3><p className="mt-1 text-[11px] text-[#8b8e86]">{garment.color}</p></div><MoreHorizontal className="h-4 w-4 text-[#b0b3aa]" /></div><p className="mt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#a2a59c]">{garment.category}</p></div></article>)}<button onClick={() => setShowUpload(true)} className="flex min-h-[230px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#bfc2b8] bg-transparent text-center transition hover:border-[#1e211f] hover:bg-white"><div className="grid h-11 w-11 place-items-center rounded-full bg-[#e5b1ff] text-[#402c45]"><Plus className="h-5 w-5" /></div><p className="mt-4 text-sm font-semibold">Add a garment</p><p className="mt-1 max-w-[130px] text-[11px] leading-4 text-[#8b8e86]">Use a clear photo on a simple background</p></button></div></section>}

          {tab === "looks" && <section><div className="mb-8"><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#7f827c]">Your decisions</p><h1 className="font-display text-4xl font-semibold tracking-[-0.07em]">Saved looks<span className="text-[#abbf45]">.</span></h1><p className="mt-3 max-w-lg text-sm leading-6 text-[#777b73]">A small library of outfits that already feel like you.</p></div><div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]"><div className="space-y-4">{liveLooks.map((look) => <button key={look.id} onClick={() => setSelectedLook(look.id)} className={`w-full rounded-2xl border p-4 text-left transition ${selectedLook === look.id ? "border-[#abc447] bg-white shadow-[0_12px_35px_rgba(44,55,26,0.08)]" : "border-black/[0.07] bg-white/50 hover:bg-white"}`}><div className="flex items-center gap-4"><div className={`h-20 w-24 shrink-0 overflow-hidden rounded-xl ${look.accent === "blue" ? "bg-[#d6e9e8]" : "bg-[#d9ddcc]"}`}><div className="mx-auto mt-8 h-24 w-12 rounded-t-[18px] bg-[#667055] opacity-90" /></div><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#969a91]">{look.label}</p><h3 className="mt-1 truncate font-display text-lg font-semibold tracking-[-0.04em]">{look.title}</h3><p className="mt-1 text-xs text-[#7d8178]">{look.score} · {look.items.length} pieces</p></div><ChevronRight className="h-4 w-4 text-[#afb2a9]" /></div></button>)}</div><div className="rounded-[24px] bg-[#1e211f] p-5 text-white sm:p-7"><div className="flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Selected look</p><h2 className="mt-3 font-display text-3xl font-semibold leading-none tracking-[-0.06em]">{liveLooks.find((look) => look.id === selectedLook)?.title}</h2></div><button onClick={() => toggleSaved(selectedLook)} className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-[#d7f36a]"><Heart className="h-4 w-4 fill-current" /></button></div><div className="mt-7 grid grid-cols-3 gap-2">{(liveLooks.find((look) => look.id === selectedLook)?.items ?? []).slice(0, 3).map((id) => { const item = garments.find((garment) => garment.id === id); return item ? <div key={id} className="overflow-hidden rounded-xl"><GarmentArt garment={item} small /></div> : null; })}</div><label className="mt-6 flex items-start gap-3 text-xs leading-5 text-white/60"><input type="checkbox" checked={previewConsent} onChange={(event) => setPreviewConsent(event.target.checked)} className="mt-1 accent-[#d7f36a]" /><span>I understand the preview is AI-generated and may not accurately represent fit or garment details.</span></label><p className="mt-4 text-sm leading-6 text-white/60">Generate a visual approximation from this selected outfit. The generated image is stored by the server fallback until Muse Image is connected.</p>{previewUrl && <img src={previewUrl} alt="Generated outfit preview" className="mt-5 w-full rounded-2xl object-cover" />}<Button onClick={generateSelectedPreview} className="mt-5 h-11 w-full rounded-xl bg-[#e5b1ff] font-semibold text-[#1e211f] hover:bg-[#d79ced]">{previewMutation.isPending ? "Generating preview..." : "Generate preview"}<Camera className="ml-2 h-4 w-4" /></Button><Button onClick={runStylist} className="mt-6 h-11 w-full rounded-xl bg-[#d7f36a] font-semibold text-[#1e211f] hover:bg-[#c8e355]">{isAnalyzing ? "Preparing another take..." : "Try another version"}<WandSparkles className="ml-2 h-4 w-4" /></Button></div></div></section>}
        </div>
      </main>

      {showTryOn && <div className="fixed inset-0 z-50 grid place-items-center bg-[#1e211f]/55 p-4 backdrop-blur-sm"><div className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[26px] bg-[#f5f4ef] p-6 shadow-2xl sm:p-8"><button onClick={() => setShowTryOn(false)} className="absolute right-5 top-5 grid h-8 w-8 place-items-center rounded-full bg-white text-[#777b73]"><X className="h-4 w-4" /></button><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7f827c]">Muse Image try-on</p><h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.06em]">See the outfit on you.</h2><p className="mt-2 max-w-lg text-sm leading-6 text-[#777b73]">Upload one clear photo of yourself and one or more clothing photos. Muse Image will preserve your identity and compose the selected outfit.</p><div className="mt-6 grid gap-4 sm:grid-cols-2"><button onClick={() => personInputRef.current?.click()} className="rounded-2xl border border-dashed border-[#b7bbb0] bg-white/70 p-5 text-left hover:bg-white"><Camera className="h-5 w-5 text-[#6b7d2a]" /><p className="mt-4 text-sm font-semibold">1. Your photo</p><p className="mt-1 text-xs leading-5 text-[#8b8e86]">Use a clear front-facing or full-body photo.</p><input ref={personInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" /></button><button onClick={() => clothingInputRef.current?.click()} className="rounded-2xl border border-dashed border-[#b7bbb0] bg-white/70 p-5 text-left hover:bg-white"><Shirt className="h-5 w-5 text-[#6b7d2a]" /><p className="mt-4 text-sm font-semibold">2. Clothing photos</p><p className="mt-1 text-xs leading-5 text-[#8b8e86]">Select up to five items you want to wear.</p><input ref={clothingInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" /></button></div><label className="mt-6 flex items-start gap-3 text-xs leading-5 text-[#777b73]"><input type="checkbox" checked={tryOnConsent} onChange={(event) => setTryOnConsent(event.target.checked)} className="mt-1 accent-[#1e211f]" /><span>I understand this is an AI-generated try-on image and may not accurately represent fit, face, or garment details.</span></label>{tryOnUrl && <img src={tryOnUrl} alt="AI-generated try-on" className="mt-6 max-h-[420px] w-full rounded-2xl object-cover" />}<Button onClick={() => handleTryOn(personInputRef.current?.files?.[0], clothingInputRef.current?.files)} disabled={tryOnMutation.isPending} className="mt-6 h-12 w-full rounded-xl bg-[#1e211f] font-semibold text-white hover:bg-[#30352f]">{tryOnMutation.isPending ? "Muse is composing your try-on..." : "Generate my try-on"}<WandSparkles className="ml-2 h-4 w-4" /></Button>{tryOnMutation.error && <p className="mt-3 text-xs text-red-600">{tryOnMutation.error.message}</p>}<p className="mt-4 text-center text-[11px] text-[#92968d]">Your images are sent through the server and are not exposed as API credentials.</p></div></div>}
      {showUpload && <div className="fixed inset-0 z-50 grid place-items-center bg-[#1e211f]/45 p-4 backdrop-blur-sm"><div className="relative w-full max-w-lg rounded-[26px] bg-[#f5f4ef] p-6 shadow-2xl sm:p-8"><button onClick={() => setShowUpload(false)} className="absolute right-5 top-5 grid h-8 w-8 place-items-center rounded-full bg-white text-[#777b73]"><X className="h-4 w-4" /></button><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7f827c]">Add to the edit</p><h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.06em]">Upload a garment.</h2><p className="mt-2 max-w-sm text-sm leading-6 text-[#777b73]">Start with one clear photo. The first pass will be a local demo; the real Muse Spark analysis comes next.</p><button onClick={() => fileInputRef.current?.click()} className="mt-7 flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-[#b7bbb0] bg-white/60 px-5 py-10 text-center transition hover:border-[#1e211f] hover:bg-white"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e5b1ff] text-[#412e46]"><FileImage className="h-5 w-5" /></div><p className="mt-4 text-sm font-semibold">Choose a photo</p><p className="mt-1 text-xs text-[#93968e]">JPG, PNG or WEBP · up to 10MB</p><input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => handleUpload(event.target.files?.[0])} /></button><div className="mt-5 flex items-center gap-3 rounded-xl bg-[#e8e9df] px-4 py-3 text-xs text-[#68705b]"><ScanLine className="h-4 w-4 shrink-0" /><span>Later, Muse Spark will suggest category, color, pattern and warmth. You stay in control.</span></div></div></div>}
    </div>
  );
}
