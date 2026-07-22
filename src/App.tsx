import { useEffect, useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ApiResponse } from "./api";
import bachelorPhotoImport from "./assets/bachelor-80s.webp";

const bachelorPhotoUrl = new URL(bachelorPhotoImport, import.meta.url).href;
const bachelorPhoto = bachelorPhotoUrl;

type Crew = ApiResponse<typeof api, "getAllData">["crew"][number];
type RV = ApiResponse<typeof api, "getAllData">["rvs"][number];
type Cost = ApiResponse<typeof api, "getAllData">["costs"][number];
type Itin = ApiResponse<typeof api, "getAllData">["itinerary"][number];

const RACE_TARGET = new Date("2026-10-25T18:00:00Z").getTime();
const RV_CAPACITY = 6;
const TABS = ["OVERVIEW","SCHEDULE","COSTS","DOCS"] as const;

function useCountdown(target: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(()=>{const i=setInterval(()=>setNow(Date.now()),1000); return ()=>clearInterval(i)},[]);
  const diff = Math.max(0, target-now);
  const d=Math.floor(diff/86400000); const h=Math.floor((diff%86400000)/3600000); const m=Math.floor((diff%3600000)/60000); const s=Math.floor((diff%60000)/1000);
  return { diff, d,h,m,s, finished: diff<=0 };
}
function formatMoney(cents:number){ return "$"+(cents/100).toFixed(2); }
function formatMoneyCompact(cents:number){ return "$"+(cents/100).toFixed(0); }
function fileToBase64(file: File){ return new Promise<string>((res,rej)=>{ const r=new FileReader(); r.onload=()=>{ const result=r.result as string; const b64=result.split(",")[1]||""; res(b64)}; r.onerror=rej; r.readAsDataURL(file); }); }
function formatPhoneDisplay(p?: string|null){ if(!p) return null; const digits=p.replace(/\D/g,""); if(digits.length===10) return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`; if(digits.length===11) return `${digits[0]}-${digits.slice(1,4)}-${digits.slice(4,7)}-${digits.slice(7)}`; return p; }
function phoneHref(p?: string|null){ if(!p) return null; const d=p.replace(/\D/g,""); if(!d) return null; return `tel:+1${d.slice(-10)}`; }

function safeParseArray(json?: string|null): number[] {
  if(!json) return [];
  try{ const v=JSON.parse(json); if(Array.isArray(v)) return v.map(Number).filter(n=>!isNaN(n)); return []; }catch{return []}
}
function safeParseCustom(json?: string|null): Record<number, number> {
  if(!json) return {};
  try{ const v=JSON.parse(json); if(typeof v==="object" && v!==null){ const out:Record<number,number>={}; for(const k in v){ const id=Number(k); const amt=Number((v as any)[k]); if(!isNaN(id)&&!isNaN(amt)) out[id]=amt; } return out; } return {}; }catch{return {}}
}
function getParticipants(cost: Cost, inIds:number[]): number[] {
  const mode = (cost.splitMode as any) || "all_in";
  if(mode==="selected"){ const arr=safeParseArray(cost.splitAmongJson); return arr.length?arr:inIds; }
  if(mode==="custom"){ const obj=safeParseCustom(cost.splitCustomJson); const keys=Object.keys(obj).map(Number); return keys.length?keys:inIds; }
  return inIds;
}

export function App(){
  const qc=useQueryClient();
  const dataQ=useQuery({ queryKey:["allData"], queryFn:()=>api.getAllData({}) });
  const crew=(dataQ.data?.crew||[]) as Crew[];
  const rvs=(dataQ.data?.rvs||[]) as RV[];
  const costs=(dataQ.data?.costs||[]) as Cost[];
  const itinerary=(dataQ.data?.itinerary||[]) as Itin[];
  const weather=dataQ.data?.weather;
  const fileInputRef=useRef<HTMLInputElement>(null);

  const [activeTab,setActiveTab]=useState<typeof TABS[number]>("OVERVIEW");
  const [rsvpFilter,setRsvpFilter]=useState<"all"|"in"|"out"|"maybe">("all");
  const [expandedId,setExpandedId]=useState<number|null>(null);
  const [showAddModal,setShowAddModal]=useState(false);
  const [editingCrew,setEditingCrew]=useState<Crew|null>(null);
  const [showRVModal,setShowRVModal]=useState(false);
  const [editingRV,setEditingRV]=useState<RV|null>(null);
  const [showBachelorLightbox,setShowBachelorLightbox]=useState(false);
  const [toasts,setToasts]=useState<{id:number,msg:string}[]>([]);
  const pushToast=(msg:string)=>{ const id=Date.now(); setToasts(t=>[...t,{id,msg}]); setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3000); };

  const [showCostModal,setShowCostModal]=useState(false);
  const [editingCost,setEditingCost]=useState<Cost|null>(null);
  const [costForm,setCostForm]=useState({ title:"", amount:"", category:"rv", paidBy:"", splitMode:"all_in" as "all_in"|"selected"|"custom", selected:[] as number[], custom:{} as Record<number,string>, settled:false, notes:"" });
  const [costPaidSearch,setCostPaidSearch]=useState("");
  const [costSelSearch,setCostSelSearch]=useState("");
  const [expandedCostId,setExpandedCostId]=useState<number|null>(null);

  const [showItinModal,setShowItinModal]=useState(false);
  const [editingItin,setEditingItin]=useState<Itin|null>(null);
  const [itinForm,setItinForm]=useState({ date:"2026-10-23", time:"08:00", title:"", location:"", description:"", link:"", type:"general" });

  const countdown=useCountdown(RACE_TARGET);

  useEffect(()=>{
    if(dataQ.isSuccess && crew.length===0){
      api.seedDefaults({ force:false }).then(()=>qc.invalidateQueries()).catch(()=>{});
    }
  },[dataQ.isSuccess, crew.length]);

  const addCrewMut=useMutation({ mutationFn:(v:any)=>api.addCrewMember(v), onSuccess:()=>{ qc.invalidateQueries(); pushToast("Added"); setShowAddModal(false); setEditingCrew(null); }});
  const updateCrewMut=useMutation({ mutationFn:(v:any)=>api.updateCrewMember(v), onSuccess:()=>{ qc.invalidateQueries(); pushToast("Saved"); setShowAddModal(false); setEditingCrew(null);} });
  const deleteCrewMut=useMutation({ mutationFn:(id:number)=>api.deleteCrewMember({id}), onSuccess:()=>{ qc.invalidateQueries(); pushToast("Removed"); }});
  const addRVMut=useMutation({ mutationFn:(v:any)=>api.addRV(v), onSuccess:()=>{ qc.invalidateQueries(); pushToast("RV added"); setShowRVModal(false); setEditingRV(null);} });
  const updateRVMut=useMutation({ mutationFn:(v:any)=>api.updateRV(v), onSuccess:()=>{ qc.invalidateQueries(); pushToast("RV saved"); setShowRVModal(false); setEditingRV(null);} });
  const deleteRVMut=useMutation({ mutationFn:(id:number)=>api.deleteRV({id}), onSuccess:()=>{ qc.invalidateQueries(); pushToast("RV removed"); }});
  const addCostMut=useMutation({ mutationFn:(v:any)=>api.addCost(v), onSuccess:()=>{ qc.invalidateQueries(); pushToast("Expense added"); setShowCostModal(false); setEditingCost(null);} });
  const updateCostMut=useMutation({ mutationFn:(v:any)=>api.updateCost(v), onSuccess:()=>{ qc.invalidateQueries(); pushToast("Expense saved"); setShowCostModal(false); setEditingCost(null);} });
  const deleteCostMut=useMutation({ mutationFn:(id:number)=>api.deleteCost({id}), onSuccess:()=>{ qc.invalidateQueries(); pushToast("Expense removed"); }});
  const addItinMut=useMutation({ mutationFn:(v:any)=>api.addItineraryItem(v), onSuccess:()=>{ qc.invalidateQueries(); pushToast("Event added"); setShowItinModal(false); setEditingItin(null);} });
  const updateItinMut=useMutation({ mutationFn:(v:any)=>api.updateItineraryItem(v), onSuccess:()=>{ qc.invalidateQueries(); pushToast("Event saved"); setShowItinModal(false); setEditingItin(null);} });
  const deleteItinMut=useMutation({ mutationFn:(id:number)=>api.deleteItineraryItem({id}), onSuccess:()=>{ qc.invalidateQueries(); pushToast("Event removed"); }});
  const refreshWeatherMut=useMutation({ mutationFn:()=>api.refreshWeather({}), onSuccess:()=>{ qc.invalidateQueries(); pushToast("Weather refreshed"); }});
  const uploadDocMut=useMutation({ mutationFn:(v:any)=>api.uploadDocument(v), onSuccess:()=>{ qc.invalidateQueries(); pushToast("Doc uploaded"); }});

  const crewIn=crew.filter(c=>c.rsvpStatus==="in");
  const inIds=crewIn.map(c=>c.id);
  const totalRvSeats=rvs.reduce((s,r)=>s+(r.capacity||RV_CAPACITY),0);
  const assignedInCount=crewIn.filter(c=>c.rvId!==null).length;
  const neededRVCount=inIds.length>0? Math.ceil(inIds.length/RV_CAPACITY):0;
  const spareSeats=totalRvSeats - inIds.length;
  const shortage=inIds.length - totalRvSeats;

  const filteredCrew = crew.filter(c=>{
    if(rsvpFilter==="all") return true;
    return c.rsvpStatus===rsvpFilter;
  });

  const balances = useMemo(()=>{
    const map = new Map<number,{paid:number, owes:number}>();
    crew.forEach(c=>map.set(c.id,{paid:0, owes:0}));
    inIds.forEach(id=>{ if(!map.has(id)) map.set(id,{paid:0, owes:0}); });
    costs.filter(c=>!c.settled).forEach(cost=>{
      const amount=cost.amountCents;
      const paidBy=cost.paidBy;
      if(paidBy!=null){ const entry=map.get(paidBy) || {paid:0,owes:0}; entry.paid+=amount; map.set(paidBy,entry); }
      const participants=getParticipants(cost, inIds);
      if(participants.length===0) return;
      if((cost.splitMode as any)==="custom"){
        const custom=safeParseCustom(cost.splitCustomJson);
        participants.forEach(pid=>{ const owe=custom[pid]??0; const e=map.get(pid)||{paid:0,owes:0}; e.owes+=owe; map.set(pid,e); });
      } else {
        const per=Math.floor(amount/participants.length);
        const rem=amount%participants.length;
        participants.forEach((pid,idx)=>{ const owe=per+(idx<rem?1:0); const e=map.get(pid)||{paid:0,owes:0}; e.owes+=owe; map.set(pid,e); });
      }
    });
    const list=Array.from(map.entries()).map(([id, v])=>{ const c=crew.find(x=>x.id===id); return { id, name:c?.name||`#${id}`, color:c?.avatarColor||"#ccc", role:c?.role||"crew", paid:v.paid, owes:v.owes, net:v.paid - v.owes }; }).filter(x=>x.paid!==0||x.owes!==0||inIds.includes(x.id));
    return { map, list };
  },[costs, crew, inIds.join(",")]);

  const settlement = useMemo(()=>{
    const creditors=balances.list.filter(b=>b.net>0).map(b=>({ ...b, rem:b.net })).sort((a,b)=>b.rem-a.rem);
    const debtors=balances.list.filter(b=>b.net<0).map(b=>({ ...b, rem:-b.net })).sort((a,b)=>b.rem-a.rem);
    const txs:{from:number, to:number, fromName:string, toName:string, amount:number}[]=[];
    let i=0,j=0;
    while(i<creditors.length && j<debtors.length){
      const cr=creditors[i]!; const db=debtors[j]!;
      const amt=Math.min(cr.rem, db.rem);
      if(amt>0) txs.push({ from:db.id, to:cr.id, fromName:db.name, toName:cr.name, amount:amt });
      cr.rem-=amt; db.rem-=amt;
      if(cr.rem===0) i++; if(db.rem===0) j++;
    }
    return txs;
  },[balances]);

  const totalSpent=costs.reduce((s,c)=>s+c.amountCents,0);
  const outstanding=costs.filter(c=>!c.settled).reduce((s,c)=>s+c.amountCents,0);

  const groupedItin = useMemo(()=>{
    const groups: Record<string, Itin[]> = {};
    itinerary.forEach(it=>{ const d=it.date; if(!groups[d]) groups[d]=[]; groups[d].push(it); });
    Object.keys(groups).forEach(k=>groups[k]!.sort((a,b)=>a.time.localeCompare(b.time)));
    const sortedKeys=Object.keys(groups).sort();
    return { groups, sortedKeys };
  },[itinerary]);

  const openAddCrew=()=>{ setEditingCrew(null); setShowAddModal(true); };
  const openEditCrew=(c:Crew)=>{ setEditingCrew(c); setShowAddModal(true); };
  const openAddRV=()=>{ setEditingRV(null); setShowRVModal(true); };
  const openEditRV=(rv:RV)=>{ setEditingRV(rv); setShowRVModal(true); };
  const openAddCost=()=>{ setEditingCost(null); setCostForm({ title:"", amount:"", category:"rv", paidBy:inIds[0]?String(inIds[0]):"", splitMode:"all_in", selected:[...inIds], custom:{} as any, settled:false, notes:"" }); setCostPaidSearch(""); setCostSelSearch(""); setShowCostModal(true); };
  const openEditCost=(c:Cost)=>{ setEditingCost(c); const customObj=safeParseCustom(c.splitCustomJson); const customStr:Record<number,string>={}; Object.entries(customObj).forEach(([k,v])=>{ customStr[Number(k)]=(v/100).toFixed(2); }); setCostForm({ title:c.title, amount:(c.amountCents/100).toFixed(2), category:c.category, paidBy:c.paidBy?String(c.paidBy):"", splitMode:(c.splitMode as any)||"all_in", selected:safeParseArray(c.splitAmongJson).length?safeParseArray(c.splitAmongJson):[...inIds], custom:customStr, settled:!!c.settled, notes:c.notes||"" }); setShowCostModal(true); };
  const openAddItin=()=>{ setEditingItin(null); setItinForm({ date:"2026-10-23", time:"08:00", title:"", location:"", description:"", link:"", type:"general" }); setShowItinModal(true); };
  const openEditItin=(it:Itin)=>{ setEditingItin(it); setItinForm({ date:it.date, time:it.time, title:it.title, location:it.location||"", description:it.description||"", link:it.link||"", type:it.type }); setShowItinModal(true); };

  if(dataQ.isPending) return <div className="min-h-screen bg-[var(--bg)] grid place-items-center p-8"><div className="paper-shadow bg-[var(--surface)] px-6 py-4 mono">Loading Talladega…</div></div>;
  if(dataQ.isError) return <div className="min-h-screen bg-[var(--bg)] grid place-items-center p-8"><div className="paper-shadow bg-[var(--surface)] px-6 py-4">Failed to load</div></div>;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] selection:bg-[var(--accent)] selection:text-white overflow-x-clip relative track-asphalt">
      <div className="pointer-events-none fixed inset-0 checker-green-black opacity-[0.025] z-0" aria-hidden />

      {/* Fixed top header — Interstate branding + Dan avatar, single safe-area-protected layer */}
      <header className="fixed top-0 left-0 right-0 z-[100] bg-[var(--bg)] border-b-2 border-[var(--border-strong)] pt-safe" style={{ overflow: "visible" }}>
        {/* Interstate Batteries #18 top band — inside the fixed header so it can never cover the avatar */}
        <div className="labonte-top-band relative z-10">
          <div className="absolute inset-0 checker-green-black opacity-[0.22]" aria-hidden />
          <div className="relative mono text-[10px] sm:text-[11px] font-black tracking-widest text-white uppercase px-4 pr-[88px] sm:pr-[112px] text-center" style={{ textShadow: "0 1px 0 #0A1A2F" }}>
            INTERSTATE BATTERIES • #18 • TALLADEGA • YELLAWOOD 500 • OCT 25, 2026
          </div>
        </div>
        <div className="h-[6px] bg-[#0A1A2F] w-full relative z-10" />

        {/* Title row with Dan avatar — avatar is foreground, never clipped */}
        <div className="relative bg-[var(--bg)] z-20">
          <div className="mx-auto max-w-[1020px] px-4 py-3 flex items-center justify-between gap-3 min-h-[88px] sm:min-h-[104px]">
            <div className="leading-[0.95] pr-2">
              <div className="display text-[26px] md:text-[30px] tracking-[0.02em]">TALLADEGA</div>
              <div className="mono text-[11px] uppercase tracking-widest opacity-70 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--labonte-green)]" /> Dan Rohe's Bachelor Bash
              </div>
              <div className="mono text-[10px] opacity-60 mt-0.5 hidden sm:block">YellaWood 500 • Sun Oct 25 1PM CT • Talladega Superspeedway</div>
            </div>
            <button
              onClick={()=>setShowBachelorLightbox(true)}
              className="relative flex-shrink-0 z-[200]"
              style={{ zIndex: 200 }}
              aria-label="View Dan Rohe photo"
            >
              <div className="w-[72px] h-[72px] sm:w-[88px] sm:h-[88px] rounded-full overflow-hidden border-[3px] border-[var(--labonte-green)] bg-[var(--surface-2)] shadow-[3px_3px_0_var(--ink)]">
                <img src={bachelorPhoto} alt="Dan Rohe" className="w-full h-full object-cover object-center" />
              </div>
            </button>
          </div>
        </div>
        <div className="h-[4px] w-full checker-green-black relative z-20" aria-hidden />
      </header>

      {/* Spacer so content starts below fixed header — accounts for safe-area + banner + title row */}
      <div aria-hidden className="h-[154px] sm:h-[168px]" style={{ height: "calc(var(--twsa-safe-area-inset-top, 0px) + 138px)" }} />
      <div className="sm:hidden" aria-hidden style={{ height: "calc(var(--twsa-safe-area-inset-top, 0px) * 0.5)" }} />

      <div className="mx-auto max-w-[1020px] px-4 relative z-10 pb-10 pt-2">
        {/* Interstate #18 watermark behind hero */}
        <div className="pointer-events-none absolute right-[-20px] top-[-8px] hidden lg:block opacity-[0.07] z-0 select-none" aria-hidden>
          <div className="bobby-watermark text-[220px] leading-[0.82]">18</div>
          <div className="bobby-watermark-outline text-[42px] -mt-2 tracking-wider">INTERSTATE</div>
        </div>

        {/* Countdown / Weather / Route */}
        <div className="mt-4 flex flex-col gap-2.5 relative z-10">
            <div className="paper-shadow bg-[var(--surface)] rounded-[var(--radius)] p-3 border-t-[3px] border-t-[var(--labonte-green)]">
              <div className="mono text-[11px] font-bold tracking-widest uppercase opacity-70 flex items-center gap-2"><span className="w-2 h-2 bg-[var(--labonte-green)] rounded-full" /> T-Minus To Green Flag</div>
              <div className="mt-2.5 grid grid-cols-4 gap-2 text-center">
                <div className="bg-[var(--surface-2)] rounded-[12px] py-2 border border-[var(--border)]/60"><div className="display text-[22px] leading-none">{countdown.d}</div><div className="mono text-[10px] opacity-70">DAYS</div></div>
                <div className="bg-[var(--surface-2)] rounded-[12px] py-2 border border-[var(--border)]/60"><div className="display text-[22px] leading-none">{countdown.h}</div><div className="mono text-[10px] opacity-70">HRS</div></div>
                <div className="bg-[var(--surface-2)] rounded-[12px] py-2 border border-[var(--border)]/60"><div className="display text-[22px] leading-none">{countdown.m}</div><div className="mono text-[10px] opacity-70">MIN</div></div>
                <div className="bg-[var(--surface-2)] rounded-[12px] py-2 border border-[var(--border)]/60"><div className="display text-[22px] leading-none">{countdown.s}</div><div className="mono text-[10px] opacity-70">SEC</div></div>
              </div>
              <div className="mt-2 mono text-[10px] opacity-60">Race: Sun Oct 25, 2026 • 1:00 PM CT • Talladega Superspeedway • North Park Free Camp</div>
            </div>
            <div className="paper-shadow bg-[var(--surface)] rounded-[var(--radius)] p-3 border-t-[3px] border-t-[var(--labonte-green)]">
              <div className="flex justify-between items-center"><div className="mono text-[11px] font-bold tracking-widest uppercase opacity-70">Weather • Talladega, AL</div><button onClick={()=>refreshWeatherMut.mutate()} disabled={refreshWeatherMut.isPending} className="mono text-[10px] underline disabled:opacity-50 text-[var(--labonte-green)]">{refreshWeatherMut.isPending ? "Refreshing…" : "Refresh"}</button></div>
              {(() => {
                const w = weather?.data;
                const cond = (w as any)?.conditions;
                const temp = cond?.temperature;
                const unit = cond?.unit || "°F";
                const desc = cond?.description || (w as any)?.summary || "";
                const feels = cond?.feels_like;
                const high = cond?.high;
                const low = cond?.low;
                const humidity = cond?.humidity_percent;
                const wind = cond?.wind;
                const forecast = Array.isArray((w as any)?.forecast_days) ? (w as any).forecast_days.slice(0,3) : [];
                if (!w) return <div className="mono text-[11px] opacity-60 mt-2">No weather cached – click Refresh</div>;
                return (
                  <div className="mt-1.5">
                    <div className="display text-[20px] leading-tight">{temp != null ? `${temp}°${unit.replace("°","")}` : "—"} <span className="mono text-[12px] opacity-80 font-medium" style={{fontFamily:"Space Grotesk"}}> {desc}</span></div>
                    <div className="mono text-[11px] opacity-70 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      {feels != null && <span>Feels {feels}°</span>}
                      {high != null && low != null && <span>H {high}° / L {low}°</span>}
                      {humidity != null && <span>{humidity}% humidity</span>}
                      {wind && <span>{wind}</span>}
                    </div>
                    {forecast.length > 0 && (
                      <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] mono">
                        {forecast.map((d:any, i:number) => (
                          <div key={i} className="bg-[var(--surface-2)] rounded-[8px] px-2 py-1.5 border border-[var(--border-strong)]/10">
                            <div className="font-bold uppercase opacity-70">{d.date ? new Date(d.date+"T12:00:00").toLocaleDateString(undefined,{weekday:"short"}) : `Day ${i+1}`}</div>
                            <div>{d.high != null && d.low != null ? `${d.high}° / ${d.low}°` : "—"}</div>
                            <div className="opacity-70 truncate">{d.summary || ""}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {!cond && <div className="mono text-[11px] opacity-70 mt-1">{(w as any).summary || "Weather data loaded"}</div>}
                  </div>
                );
              })()}
            </div>
            <div className="paper-shadow bg-[var(--surface)] rounded-[var(--radius)] p-3 border-t-[3px] border-t-[var(--labonte-green)]">
              <div className="mono text-[11px] font-bold tracking-widest uppercase opacity-70 flex items-center gap-2"><span className="w-1.5 h-1.5 bg-[var(--labonte-green)] rounded-full" /> Route • ATL → Dega</div>
              <div className="mt-1.5 mono text-[12px] leading-6">
                <div>ATL Airport RV Depot → Buc-ee's Leeds ~85mi → North Park ~22mi</div>
                <div className="opacity-60 text-[11px]">Total 107mi • I-20 E • ~1h45</div>
                <a href="https://www.google.com/maps/dir/ATL+Airport+RV+Depot/Buc-ee%27s+Leeds+AL/Talladega+Superspeedway" target="_blank" rel="noopener noreferrer" className="inline-block mt-1.5 underline font-bold text-[var(--labonte-green)]">Open Maps →</a>
              </div>
            </div>
        </div>

        {/* IN/OUT Board - directly after top row */}
        <div className="mt-4 relative">
          <div className="tire-skid opacity-[0.35] mb-3" aria-hidden />
          <div className="paper-shadow bg-[var(--surface)] rounded-[var(--radius)] p-3 md:p-4 border-t-[4px] border-t-[var(--labonte-green)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="display text-[18px] flex items-center gap-2"><span className="w-2 h-2 bg-[var(--labonte-green)] rounded-full" /> CREW BOARD • {crewIn.length} IN / {crew.length} total • {assignedInCount}/{crewIn.length} assigned</div>
            <div className="flex gap-2">
              {(["all","in","out","maybe"] as const).map(f=>(
                <button key={f} onClick={()=>setRsvpFilter(f)} className={`mono text-[10px] px-2.5 py-1 border uppercase font-bold rounded-full ${rsvpFilter===f?"bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]":"bg-[var(--surface-2)] border-[var(--border-strong)]"}`}>{f}</button>
              ))}
              <button onClick={()=>openAddCrew()} className="mono text-[10px] px-3 py-1 bg-[var(--labonte-green)] text-white font-bold uppercase border border-[var(--border-strong)] rounded-full">+ Add</button>
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            {filteredCrew.map(c=>{
              const isIn=c.rsvpStatus==="in";
              const digits=formatPhoneDisplay(c.phone);
              const href=phoneHref(c.phone);
              const assignedRV=rvs.find(r=>r.id===c.rvId);
              const isExpanded = expandedId===c.id;
              return (
                <div key={c.id} className="grid gap-0">
                <div className={`flex items-center gap-2 md:gap-3 p-2.5 rounded-[12px] border ${isIn?"bg-[var(--surface-2)] border-[var(--border-strong)]":"bg-[var(--bg)] border-dashed border-[var(--border)]"} overflow-hidden ${isExpanded ? "rounded-b-none" : ""}`}>
                  <div className="w-8 h-8 rounded-full grid place-items-center text-[11px] font-black text-white flex-shrink-0" style={{background:c.avatarColor||"#333"}}>{c.name.split(" ").map(x=>x[0]).join("").slice(0,2)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={()=>setExpandedId(isExpanded?null:c.id)} className="font-bold text-[13px] truncate text-left hover:underline">{c.name}</button>
                      <span className={`mono text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase border ${c.role==="bachelor"?"bg-[var(--accent-red)] text-white":c.role==="organizer"?"bg-[var(--ink)] text-[var(--bg)]":c.role==="planner"?"bg-[var(--accent)] text-white":"bg-[var(--surface-3)]"}`}>{c.role}</span>
                      <span className={`mono text-[9px] px-1.5 py-0.5 rounded-full border uppercase ${isIn?"bg-green-50 text-green-800 border-green-200":"bg-red-50 text-red-700 border-red-200"}`}>{c.rsvpStatus}</span>
                      {assignedRV && <span className="mono text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--surface-3)] border border-[var(--border-strong)] font-bold">{assignedRV.name}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap min-w-0">
                      {digits && href ? <a href={href} className="mono text-[11px] underline font-bold tracking-wide truncate">{digits}</a> : digits ? <span className="mono text-[11px] truncate">{digits}</span> : <span className="mono text-[10px] opacity-50">no phone</span>}
                      {c.flightFrom && <span className="mono text-[10px] opacity-60 truncate">{c.flightFrom}→{c.arrivalAirport||"ATL"} {c.flightNumber||""}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <select value={c.rvId??""} onChange={e=>{ const val=e.target.value ? Number(e.target.value) : null; updateCrewMut.mutate({ id:c.id, rvId: val }); }} className="mono text-[11px] border border-[var(--border-strong)] bg-white text-[#0A1A2F] rounded-[8px] px-1 py-1 max-w-[90px]">
                      <option value="">No RV</option>
                      {rvs.map(r=><option key={r.id} value={r.id}>{r.name} {crewIn.filter(x=>x.rvId===r.id).length}/{r.capacity||6}</option>)}
                    </select>
                    <button onClick={()=>setExpandedId(isExpanded?null:c.id)} className="w-7 h-7 grid place-items-center border border-[var(--border-strong)] rounded-full bg-[var(--surface)] mono text-[12px]" aria-label={isExpanded ? "Collapse" : "Expand"}>{isExpanded?"−":"+"}</button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="paper-shadow-sm bg-[var(--bg)] p-3 rounded-b-[12px] mono text-[11px] leading-5 border border-t-0 border-[var(--border-strong)] -mt-px">
                    <div className="flex justify-between"><span className="font-bold">{c.name} details</span><button onClick={()=>setExpandedId(null)} className="underline">Close</button></div>
                    <div className="mt-1">Role: {c.role} • RSVP: {c.rsvpStatus} • RV: {rvs.find(r=>r.id===c.rvId)?.name || "Unassigned"}</div>
                    <div>Email: {c.email||"—"} • Phone: {c.phone||"—"} {c.phone && <a href={phoneHref(c.phone)||"#"} className="underline font-bold ml-2">Call</a>}</div>
                    <div>Flight: {c.flightAirline||""} {c.flightNumber||""} {c.flightFrom||""} → {c.arrivalAirport||"ATL"} • Dep {c.flightDepart||"—"} Arr {c.flightArrive||"—"}</div>
                    <div>Notes: {c.notes||"—"}</div>
                    <div className="mt-2 flex gap-2 flex-wrap">
                      <button onClick={()=>openEditCrew(c)} className="px-3 py-1 bg-[var(--surface-2)] border border-[var(--border-strong)] font-bold">Edit name / details</button>
                      <button onClick={()=>{ if(confirm(`Remove ${c.name}?`)) deleteCrewMut.mutate(c.id); }} className="px-3 py-1 bg-[var(--accent-red)] text-white border border-[var(--border-strong)] font-bold">Remove</button>
                      <select value={c.rsvpStatus||"in"} onChange={e=>updateCrewMut.mutate({ id:c.id, rsvpStatus: e.target.value as any })} className="border px-2 py-1 bg-white text-[#0A1A2F] rounded">
                        <option value="in">IN</option><option value="out">OUT</option><option value="maybe">MAYBE</option><option value="invited">INVITED</option>
                      </select>
                    </div>
                  </div>
                )}
                </div>
              );
            })}
          </div>
        </div>
        </div>

        {/* Tab bar - NOW RIGHT ABOVE ITS CONTENT as requested */}
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <div className="mono text-[11px] font-bold tracking-widest uppercase opacity-60 flex items-center gap-2"><span className="w-1.5 h-1.5 bg-[var(--labonte-green)] rounded-full" /> Trip Details</div>
            <div className="mono text-[10px] opacity-60">{crewIn.length} IN • {rvs.length} RVs</div>
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto scrollbar-hide pb-2">
            {TABS.map(t=>(
              <button key={t} onClick={()=>setActiveTab(t)} className={`whitespace-nowrap px-4 py-2 mono text-[11px] font-black tracking-widest uppercase rounded-full border transition-all ${activeTab===t? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] shadow-[2px_2px_0_var(--labonte-green)]" : "bg-[var(--surface)] border-[var(--border-strong)] hover:border-[var(--labonte-green)]"}`}>{t}</button>
            ))}
          </div>

          {/* Tab Panels - directly under tabs */}
          {activeTab==="OVERVIEW" && (
            <div className="mt-3 grid gap-3">
              <div className="paper-shadow bg-[var(--surface)] rounded-[var(--radius)] p-4 border-t-[3px] border-t-[var(--labonte-green)]">
                <div className="display text-[16px] flex items-center gap-2"><span className="w-2 h-2 bg-[var(--labonte-green)] rounded-full"/> Trip Notes • Fri Oct 23 - Mon Oct 26</div>
                <div className="mt-3 mono text-[12px] leading-6">
                  <div>• Fri Oct 23: Fly ATL, RV pickup, Buc-ee's Leeds, to North Park free camp.</div>
                  <div>• Sat Oct 24: Pre-race, setup, garage, merch.</div>
                  <div>• Sun Oct 25: YellaWood 500 1pm CT – main event.</div>
                  <div>• Mon Oct 26: Drive back, fly out ATL.</div>
                </div>
              </div>
            </div>
          )}

          {activeTab==="SCHEDULE" && (
            <div className="mt-3">
              <div className="flex items-center justify-between">
                <div className="display text-[16px]">Schedule • Editable</div>
                <button onClick={openAddItin} className="mono text-[10px] px-3 py-1.5 bg-[var(--accent)] text-white font-bold uppercase border border-[var(--border-strong)] rounded-full">+ Add Event</button>
              </div>
              <div className="mt-3 grid gap-3">
                {groupedItin.sortedKeys.length===0 && <div className="mono text-[12px] opacity-60 p-4 border border-dashed rounded-[12px] text-center">No events yet. Add your first day.</div>}
                {groupedItin.sortedKeys.map(dateKey=>{
                  const items=groupedItin.groups[dateKey]||[];
                  const d=new Date(dateKey); const label=isNaN(d.getTime())?dateKey: d.toLocaleDateString(undefined,{ weekday:"short", month:"short", day:"numeric" });
                  return (
                    <div key={dateKey} className="paper-shadow-sm bg-[var(--surface)] rounded-[12px] p-3">
                      <div className="mono text-[11px] font-black tracking-widest uppercase border-b border-[var(--border-strong)] pb-1">{label} • {dateKey}</div>
                      <div className="mt-2 grid gap-2">
                        {items.map(it=>(
                          <div key={it.id} className="flex gap-2 p-2 bg-[var(--bg)] border border-[var(--border-strong)]/20 rounded-[10px]">
                            <div className="mono text-[11px] font-bold min-w-[52px]">{it.time}</div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-[13px] leading-tight">{it.title} <span className="mono text-[9px] px-1 py-0.5 bg-[var(--surface-2)] border rounded-full ml-1 uppercase">{it.type}</span></div>
                              <div className="mono text-[11px] opacity-60 truncate">{it.location||""}</div>
                              {it.description && <div className="mono text-[11px] mt-1 opacity-70 line-clamp-2">{it.description}</div>}
                              {it.link && <a href={it.link} target="_blank" className="mono text-[10px] underline mt-1 inline-block">Link</a>}
                            </div>
                            <div className="flex flex-col gap-1 flex-shrink-0">
                              <button onClick={()=>openEditItin(it)} className="w-7 h-7 grid place-items-center border rounded-full mono text-[11px] bg-[var(--surface-2)]">✎</button>
                              <button onClick={()=>{ if(confirm(`Delete ${it.title}?`)) deleteItinMut.mutate(it.id); }} className="w-7 h-7 grid place-items-center border rounded-full bg-[var(--accent-red)] text-white mono">×</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab==="COSTS" && (
            <div className="mt-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="display text-[16px]">Costs • Allocatable</div>
                <button onClick={openAddCost} className="mono text-[10px] px-3 py-1.5 bg-[var(--ink)] text-[var(--bg)] font-black uppercase tracking-widest border rounded-full">+ Add Expense</button>
              </div>

              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="paper-shadow-sm bg-[var(--surface)] rounded-[12px] p-3"><div className="mono text-[10px] uppercase opacity-60 font-bold">Total Spent</div><div className="display text-[18px]">{formatMoney(totalSpent)}</div></div>
                <div className="paper-shadow-sm bg-[var(--surface)] rounded-[12px] p-3"><div className="mono text-[10px] uppercase opacity-60 font-bold">Outstanding</div><div className="display text-[18px]">{formatMoney(outstanding)}</div></div>
                <div className="paper-shadow-sm bg-[var(--surface)] rounded-[12px] p-3"><div className="mono text-[10px] uppercase opacity-60 font-bold">Per IN</div><div className="display text-[18px]">{inIds.length? formatMoneyCompact(Math.round(totalSpent/inIds.length)) : "$0"}</div></div>
                <div className="paper-shadow-sm bg-[var(--surface)] rounded-[12px] p-3"><div className="mono text-[10px] uppercase opacity-60 font-bold">Settled</div><div className="display text-[18px]">{costs.filter(c=>c.settled).length}/{costs.length}</div></div>
              </div>

              <div className="mt-4 paper-shadow bg-[var(--surface)] rounded-[var(--radius)] p-3">
                <div className="mono text-[11px] font-black tracking-widest uppercase">Balance Board • Excluding Settled</div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {balances.list.map(b=>{
                    const net=b.net;
                    return (
                      <div key={b.id} className="flex items-center gap-2 p-2 bg-[var(--bg)] border border-[var(--border-strong)]/15 rounded-[10px]">
                        <div className="w-8 h-8 rounded-full grid place-items-center text-[11px] font-black text-white flex-shrink-0" style={{background:b.color}}>{b.name.split(" ").map(x=>x[0]).join("").slice(0,2)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-[12px] truncate">{b.name} <span className="mono text-[9px] opacity-60 uppercase">{b.role}</span></div>
                          <div className="mono text-[10px] opacity-60">Paid {formatMoney(b.paid)} • Owes {formatMoney(b.owes)}</div>
                        </div>
                        <div className={`mono text-[11px] font-black px-2 py-1 rounded-full border ${net>0?"bg-green-50 text-green-800 border-green-200": net<0?"bg-red-50 text-red-700 border-red-200":"bg-[var(--surface-2)]"}`}>{net>0?`+${formatMoney(net)}`: net<0? `${formatMoney(net)}` : "$0"}<div className="text-[8px] opacity-70">{net>0?"is owed": net<0?"owes":"even"}</div></div>
                      </div>
                    );
                  })}
                  {balances.list.length===0 && <div className="mono text-[11px] opacity-60 p-2">No balances yet – add expenses.</div>}
                </div>

                {settlement.length>0 && (
                  <div className="mt-4">
                    <div className="mono text-[11px] font-black tracking-widest uppercase">Settle-Up • Minimal Transactions</div>
                    <div className="mt-2 grid gap-1">
                      {settlement.map((tx,i)=>(
                        <div key={i} className="mono text-[11px] p-2 bg-[var(--surface-2)] border border-[var(--border-strong)]/15 rounded-[8px] flex justify-between">
                          <span><span className="font-bold">{tx.fromName}</span> → <span className="font-bold">{tx.toName}</span></span>
                          <span className="font-black">{formatMoney(tx.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 grid gap-2">
                {costs.map(c=>{
                  const paidByCrew=crew.find(x=>x.id===c.paidBy);
                  const parts=getParticipants(c, inIds);
                  const expanded=expandedCostId===c.id;
                  return (
                    <div key={c.id} className={`paper-shadow-sm rounded-[12px] p-3 border ${c.settled?"bg-[var(--surface-2)] opacity-70 border-dashed":"bg-[var(--surface)] border-[var(--border-strong)]/15"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-[13px] truncate">{c.title}</span>
                            <span className="mono text-[9px] px-1.5 py-0.5 bg-[var(--surface-3)] border rounded-full uppercase font-bold">{c.category}</span>
                            {c.settled && <span className="mono text-[9px] px-1.5 py-0.5 bg-green-600 text-white rounded-full uppercase font-bold">SETTLED</span>}
                          </div>
                          <div className="mono text-[12px] font-black mt-1">{formatMoney(c.amountCents)}</div>
                          <div className="mt-1 flex flex-wrap gap-1 items-center">
                            <span className="mono text-[10px] opacity-60">Paid by:</span>
                            {paidByCrew ? <span className="inline-flex items-center gap-1 mono text-[10px] px-2 py-0.5 bg-[var(--ink)] text-[var(--bg)] rounded-full font-bold"><span className="w-4 h-4 rounded-full grid place-items-center text-[8px] text-white" style={{background:paidByCrew.avatarColor||"#333"}}>{paidByCrew.name[0]}</span>{paidByCrew.name}</span> : <span className="mono text-[10px] opacity-60">—</span>}
                            <span className="mono text-[10px] opacity-60 ml-2">Split {c.splitMode||"all_in"} • {parts.length} way{parts.length!==1?"s":""}</span>
                          </div>
                          {expanded && (
                            <div className="mt-2 mono text-[11px] leading-5">
                              <div>Participants: {parts.map(id=>crew.find(x=>x.id===id)?.name || id).join(", ")}</div>
                              {(c.splitMode==="custom") && <div>Custom: {Object.entries(safeParseCustom(c.splitCustomJson)).map(([id,amt])=> `${crew.find(x=>x.id===Number(id))?.name||id}: ${formatMoney(amt)}`).join(", ")}</div>}
                              {c.notes && <div>Notes: {c.notes}</div>}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          <button onClick={()=>setExpandedCostId(expanded?null:c.id)} className="w-7 h-7 grid place-items-center border rounded-full mono text-[11px] bg-[var(--surface-2)]">{expanded?"−":"+"}</button>
                          <button onClick={()=>openEditCost(c)} className="w-7 h-7 grid place-items-center border rounded-full mono bg-[var(--surface)]">✎</button>
                          <button onClick={()=>updateCostMut.mutate({ id:c.id, settled: !c.settled })} className={`w-7 h-7 grid place-items-center border rounded-full mono text-[10px] font-bold ${c.settled?"bg-green-600 text-white":"bg-[var(--accent-mustard)]"}`}>${c.settled?"✓":"$"}</button>
                          <button onClick={()=>{ if(confirm(`Delete ${c.title}?`)) deleteCostMut.mutate(c.id); }} className="w-7 h-7 grid place-items-center border rounded-full bg-[var(--accent-red)] text-white mono">×</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {costs.length===0 && <div className="mono text-[12px] opacity-60 p-4 border border-dashed rounded-[12px] text-center">No expenses yet. Add RV rental, gas, tickets.</div>}
              </div>
            </div>
          )}

          {activeTab==="DOCS" && (
            <div className="mt-3">
              <div className="flex items-center justify-between"><div className="display text-[16px]">Docs</div><button onClick={()=>fileInputRef.current?.click()} className="mono text-[10px] px-3 py-1.5 bg-[var(--ink)] text-[var(--bg)] font-bold uppercase rounded-full">Upload</button><input ref={fileInputRef} type="file" className="hidden" onChange={async e=>{ const f=e.target.files?.[0]; if(!f) return; const b64=await fileToBase64(f); await uploadDocMut.mutateAsync({ title:f.name, fileName:f.name, mimeType:f.type, base64Data:b64, category:"doc", uploadedBy:"crew" }); if(fileInputRef.current) fileInputRef.current.value=""; }} /></div>
              <div className="mt-3 grid gap-2">{(dataQ.data?.documents||[]).map((d:any)=><div key={d.id} className="paper-shadow-sm bg-[var(--surface)] p-3 rounded-[12px] mono text-[11px] flex justify-between"><span>{d.title} {d.sizeBytes?`• ${(d.sizeBytes/1024).toFixed(1)}KB`:""}</span><a href={d.url||"#"} target="_blank" className="underline">Open</a></div>)}</div>
              {(dataQ.data?.documents||[]).length===0 && <div className="mono text-[11px] opacity-60 mt-2">No docs yet.</div>}
            </div>
          )}
        </div>

        {/* RV Fleet - AT THE VERY BOTTOM as last section */}
        <div className="mt-8 relative">
          <div className="tire-skid opacity-[0.35] mb-3" aria-hidden />
          <div className="h-[4px] w-full checker-green-black rounded-full mb-3 opacity-80" aria-hidden />
        <div className="paper-shadow bg-[var(--surface)] rounded-[var(--radius)] p-4 md:p-6 border border-[var(--border)] border-t-[4px] border-t-[var(--labonte-green)] relative overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 relative z-10">
            <div>
                <div className="display text-[18px] leading-none">RV Fleet • {rvs.length} rigs • {totalRvSeats} seats • {assignedInCount}/{crewIn.length} assigned</div>
                <div className="mono text-[10px] uppercase tracking-widest opacity-60">6 per rig • Add your rig</div>
            </div>
            <button onClick={()=>openAddRV()} className="mono text-[11px] px-4 py-2 bg-[var(--ink)] text-[var(--bg)] font-black uppercase tracking-widest border border-[var(--border)] rounded-full">+ Add RV</button>
          </div>
          <div className="mt-4 grid gap-2 relative z-10">
            <div className="rounded-[12px] bg-[var(--surface-2)] border border-[var(--border)] p-3 mono text-[11px] md:text-[12px] leading-5">
              <div className="font-bold tracking-widest uppercase flex items-center gap-2"><span className="w-2 h-2 bg-[var(--labonte-green)] rounded-full"/>Capacity • {RV_CAPACITY} per rig</div>
              <div className="mt-1">
                {crewIn.length===0 ? "No one IN yet." : (
                  <>
                    <span className="font-bold">{crewIn.length} IN</span> / {RV_CAPACITY} per rig = <span className="font-bold">{neededRVCount} RV{neededRVCount!==1?"s":""} needed</span> ({neededRVCount*RV_CAPACITY} seats). You have {rvs.length} RVs ({totalRvSeats} seats) • {assignedInCount} assigned.
                  </>
                )}
              </div>
              {crewIn.length>0 && (
                <div className="mt-2 flex flex-wrap gap-2 items-center">
                  {shortage>0 ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#C1121F] text-white font-bold rounded-full text-[11px] border border-[#0A1A2F]/20">Need {Math.ceil(shortage/RV_CAPACITY)} more RV ({shortage} seats short)</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-[var(--labonte-green)] text-white font-bold rounded-full text-[11px]">{spareSeats>=0?`${spareSeats} spare seat${spareSeats!==1?"s":""}${spareSeats>=RV_CAPACITY?` • ${Math.floor(spareSeats/RV_CAPACITY)} RV worth`:""}`:"At capacity"}</span>
                  )}
                  {shortage>0 && <button onClick={openAddRV} className="px-3 py-1.5 bg-[#0A1A2F] text-white font-bold rounded-full text-[11px]">+ Add RV</button>}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
            {rvs.map(rv=>{
              const assigned=crewIn.filter(c=>c.rvId===rv.id);
              const cap=rv.capacity||RV_CAPACITY;
              const pct=cap>0? Math.round((assigned.length/cap)*100):0;
              return (
                <div key={rv.id} className="bg-[var(--surface)] rounded-[14px] p-4 border border-[var(--border)] border-t-[3px] border-t-[var(--labonte-green)] relative overflow-hidden">
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold tracking-wide text-[14px] leading-tight truncate">{rv.name}</div>
                      <div className="mono text-[11px] opacity-70 mt-1 leading-[1.4]">{rv.company||"No company"} • {rv.confirmation||"No conf"}<br/>Pickup {rv.pickupLocation||"ATL"} {rv.pickupTime||""} • CAP {cap} • {rv.status||"reserved"}</div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={()=>openEditRV(rv)} className="w-8 h-8 grid place-items-center border border-[var(--border)] rounded-full bg-[var(--surface-2)] mono text-[12px]" aria-label="Edit">✎</button>
                      <button onClick={()=>{ if(confirm(`Remove ${rv.name}? Assigned crew will be unassigned.`)){ deleteRVMut.mutate(rv.id); crewIn.filter(c=>c.rvId===rv.id).forEach(c=>updateCrewMut.mutate({ id:c.id, rvId:null })); } }} className="w-8 h-8 grid place-items-center border border-[var(--border)] rounded-full bg-red-600 text-white mono" aria-label="Remove">×</button>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="h-[8px] bg-[var(--surface-2)] rounded-full overflow-hidden border border-[var(--border)]">
                      <div className="h-full bg-[var(--labonte-green)] rounded-full transition-all" style={{ width:`${Math.min(100,pct)}%` }} />
                    </div>
                    <div className="mono text-[10px] mt-1.5 flex justify-between font-bold opacity-70"><span>{assigned.length}/{cap} seats • {pct}%</span><span>Driver: {crew.find(c=>c.id===rv.driverCrewId)?.name || "—"}</span></div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {assigned.map(c=>(
                      <span key={c.id} className="inline-flex items-center gap-1 mono text-[10px] px-2.5 py-1 bg-[var(--ink)] text-[var(--bg)] rounded-full font-bold">
                        {c.name}<button onClick={()=>updateCrewMut.mutate({ id:c.id, rvId:null })} className="ml-1 w-4 h-4 grid place-items-center rounded-full bg-red-600 text-white leading-none">×</button>
                      </span>
                    ))}
                    {assigned.length===0 && <span className="mono text-[11px] opacity-60 font-bold border border-dashed border-[var(--border)] px-3 py-1 rounded-full">No one assigned • {cap} seats free</span>}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <select onChange={e=>{ const cid=Number(e.target.value); if(cid) updateCrewMut.mutate({ id:cid, rvId: rv.id }); e.target.value=""; }} className="flex-1 mono text-[11px] font-bold border border-[var(--border)] rounded-[8px] px-3 py-2 bg-[var(--surface)]">
                      <option value="">+ Assign to this RV</option>
                      {crewIn.filter(c=>c.rvId!==rv.id).map(c=><option key={c.id} value={c.id}>{c.name} • {c.phone?formatPhoneDisplay(c.phone):""}</option>)}
                    </select>
                  </div>
                </div>
              );
            })}
            {rvs.length===0 && (
              <div className="col-span-1 md:col-span-2 mono text-[12px] p-5 border border-dashed border-[var(--border)] rounded-[14px] bg-[var(--surface-2)] text-center">
                <div className="font-bold">4 IN / {RV_CAPACITY} per rig = {neededRVCount} RV needed • 0 added yet</div>
                <div className="mt-1 opacity-70">Add your first rig below. Clean start – no placeholder RVs.</div>
                <button onClick={openAddRV} className="mt-3 px-4 py-2 bg-[var(--ink)] text-[var(--bg)] font-bold uppercase text-[11px] rounded-full">+ Add First RV</button>
              </div>
            )}
          </div>
        </div>
        </div>

        {/* Toasts */}
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-70 grid gap-2 pointer-events-none">
          {toasts.map(t=><div key={t.id} className="pointer-events-auto paper-shadow bg-[var(--ink)] text-[var(--bg)] mono text-[12px] px-4 py-2 rounded-full font-bold">{t.msg}</div>)}
        </div>

        {/* Crew Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-60 bg-black/50 grid place-items-center p-4 overflow-y-auto">
            <div className="paper-shadow bg-[var(--surface)] rounded-[16px] w-full max-w-[520px] p-4 max-h-[90dvh] overflow-y-auto">
              <div className="flex justify-between items-center"><div className="display text-[18px]">{editingCrew?"Edit Crew":"Add Crew"}</div><button onClick={()=>{ setShowAddModal(false); setEditingCrew(null); }} className="w-8 h-8 grid place-items-center border rounded-full">×</button></div>
              <CrewForm crew={editingCrew} rvs={rvs} onSave={(v:any)=>{ if(editingCrew) updateCrewMut.mutate({ id:editingCrew.id, ...v }); else addCrewMut.mutate(v); }} onCancel={()=>{ setShowAddModal(false); setEditingCrew(null); }} />
            </div>
          </div>
        )}

        {/* RV Modal */}
        {showRVModal && (
          <div className="fixed inset-0 z-60 bg-black/50 grid place-items-center p-4 overflow-y-auto">
            <div className="paper-shadow bg-[var(--surface)] rounded-[16px] w-full max-w-[520px] p-4">
              <div className="flex justify-between items-center"><div className="display text-[18px]">{editingRV?"Edit RV":"Add RV"}</div><button onClick={()=>{ setShowRVModal(false); setEditingRV(null); }} className="w-8 h-8 grid place-items-center border rounded-full">×</button></div>
              <RVForm rv={editingRV} crew={crewIn} onSave={(v:any)=>{ if(editingRV) updateRVMut.mutate({ id:editingRV.id, ...v }); else addRVMut.mutate(v); }} onCancel={()=>{ setShowRVModal(false); setEditingRV(null); }} />
            </div>
          </div>
        )}

        {/* Cost Modal */}
        {showCostModal && (
          <div className="fixed inset-0 z-60 bg-black/60 grid place-items-center p-4 overflow-y-auto">
            <div className="paper-shadow bg-[var(--surface)] rounded-[16px] w-full max-w-[560px] p-4 max-h-[92dvh] overflow-y-auto">
              <div className="flex justify-between items-center"><div className="display text-[18px]">{editingCost?"Edit Expense":"Add Expense"}</div><button onClick={()=>{ setShowCostModal(false); setEditingCost(null); }} className="w-8 h-8 grid place-items-center border rounded-full">×</button></div>
              <div className="mt-3 grid gap-3 mono text-[12px]">
                <label className="grid gap-1"><span className="font-bold uppercase text-[10px]">Title</span><input value={costForm.title} onChange={e=>setCostForm({...costForm, title:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" placeholder="RV rental - THUNDER" /></label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1"><span className="font-bold uppercase text-[10px]">Amount $</span><input type="number" step="0.01" value={costForm.amount} onChange={e=>setCostForm({...costForm, amount:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" placeholder="840.00" /></label>
                  <label className="grid gap-1"><span className="font-bold uppercase text-[10px]">Category</span><select value={costForm.category} onChange={e=>setCostForm({...costForm, category:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]"><option value="rv">RV</option><option value="gas">Gas</option><option value="tickets">Tickets</option><option value="food">Food</option><option value="other">Other</option></select></label>
                </div>

                <label className="grid gap-1"><span className="font-bold uppercase text-[10px]">Paid By • searchable</span>
                  <input value={costPaidSearch} onChange={e=>setCostPaidSearch(e.target.value)} placeholder="Search crew..." className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" />
                  <select value={costForm.paidBy} onChange={e=>setCostForm({...costForm, paidBy:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]">
                    <option value="">Select payer</option>
                    {crew.filter(c=>!costPaidSearch || c.name.toLowerCase().includes(costPaidSearch.toLowerCase())).map(c=><option key={c.id} value={String(c.id)}>{c.name} {c.rsvpStatus==="in"?"• IN":""}</option>)}
                  </select>
                </label>

                <label className="grid gap-1"><span className="font-bold uppercase text-[10px]">Split Mode</span>
                  <select value={costForm.splitMode} onChange={e=>setCostForm({...costForm, splitMode: e.target.value as any})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]">
                    <option value="all_in">All IN equally</option>
                    <option value="selected">Selected equally</option>
                    <option value="custom">Custom amounts</option>
                  </select>
                </label>

                {(costForm.splitMode==="selected" || costForm.splitMode==="custom") && (
                  <div className="grid gap-2">
                    <span className="font-bold uppercase text-[10px]">Participants {costForm.splitMode==="selected"?"• check":"• enter amounts"}</span>
                    <input value={costSelSearch} onChange={e=>setCostSelSearch(e.target.value)} placeholder="Filter crew..." className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" />
                    <div className="grid gap-1 max-h-[180px] overflow-y-auto border border-[var(--border-strong)]/15 rounded-[8px] p-2 bg-[var(--bg)]">
                      {crew.filter(c=>!costSelSearch || c.name.toLowerCase().includes(costSelSearch.toLowerCase())).map(c=>{
                        const checked=costForm.selected.includes(c.id);
                        return (
                          <label key={c.id} className="flex items-center justify-between gap-2 p-1.5 rounded-[6px] hover:bg-[var(--surface-2)]">
                            <span className="flex items-center gap-2"><input type="checkbox" checked={checked} onChange={e=>{ const set=new Set(costForm.selected); if(e.target.checked) set.add(c.id); else set.delete(c.id); setCostForm({...costForm, selected:Array.from(set)}); }} />{c.name} <span className="text-[10px] opacity-60">{c.rsvpStatus}</span></span>
                            {costForm.splitMode==="custom" && checked && <input type="number" step="0.01" value={costForm.custom[c.id]||""} onChange={e=>setCostForm({...costForm, custom:{...costForm.custom, [c.id]: e.target.value}})} placeholder="$" className="w-[84px] border rounded px-2 py-1 bg-white text-[#0A1A2F]" />}
                          </label>
                        );
                      })}
                    </div>
                    <div className="text-[10px] opacity-60">Selected: {costForm.selected.length} • {costForm.selected.map(id=>crew.find(c=>c.id===id)?.name).join(", ")}</div>
                  </div>
                )}

                <label className="grid gap-1"><span className="font-bold uppercase text-[10px]">Notes</span><input value={costForm.notes} onChange={e=>setCostForm({...costForm, notes:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" placeholder="Optional" /></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={costForm.settled} onChange={e=>setCostForm({...costForm, settled:e.target.checked})} /><span className="font-bold uppercase text-[10px]">Settled / Paid</span></label>

                <div className="flex gap-2 pt-2">
                  <button onClick={()=>{
                    const amountCents=Math.round(parseFloat(costForm.amount||"0")*100);
                    if(!costForm.title || isNaN(amountCents) || amountCents<=0){ pushToast("Need title + amount"); return; }
                    if(!costForm.paidBy){ pushToast("Pick paid by"); return; }
                    let splitAmongJson: string|null=null;
                    let splitCustomJson: string|null=null;
                    if(costForm.splitMode==="selected"){ splitAmongJson=JSON.stringify(costForm.selected); }
                    if(costForm.splitMode==="custom"){
                      const cmap:Record<number,number>={};
                      costForm.selected.forEach(id=>{ const v=parseFloat((costForm.custom as any)[id]||"0"); cmap[id]=Math.round(v*100); });
                      splitCustomJson=JSON.stringify(cmap);
                      splitAmongJson=null;
                    }
                    const payload={ title:costForm.title, amountCents, category:costForm.category, paidBy: Number(costForm.paidBy), splitMode: costForm.splitMode, splitAmongJson, splitCustomJson, settled: costForm.settled, notes: costForm.notes };
                    if(editingCost) updateCostMut.mutate({ id:editingCost.id, ...payload }); else addCostMut.mutate(payload);
                  }} className="flex-1 py-2.5 bg-[var(--ink)] text-[var(--bg)] font-black uppercase tracking-widest mono text-[11px] border rounded-full">Save</button>
                  <button onClick={()=>{ setShowCostModal(false); setEditingCost(null); }} className="px-4 py-2.5 bg-[var(--surface-2)] border rounded-full font-bold uppercase text-[11px]">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Itinerary Modal */}
        {showItinModal && (
          <div className="fixed inset-0 z-60 bg-black/50 grid place-items-center p-4">
            <div className="paper-shadow bg-[var(--surface)] rounded-[16px] w-full max-w-[520px] p-4">
              <div className="flex justify-between items-center"><div className="display text-[18px]">{editingItin?"Edit Event":"Add Event"}</div><button onClick={()=>{ setShowItinModal(false); setEditingItin(null); }} className="w-8 h-8 grid place-items-center border rounded-full">×</button></div>
              <div className="mt-3 grid gap-3 mono text-[12px]">
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1"><span className="font-bold uppercase text-[10px]">Date</span><input type="date" value={itinForm.date} onChange={e=>setItinForm({...itinForm, date:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" /></label>
                  <label className="grid gap-1"><span className="font-bold uppercase text-[10px]">Time</span><input type="time" value={itinForm.time} onChange={e=>setItinForm({...itinForm, time:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" /></label>
                </div>
                <label className="grid gap-1"><span className="font-bold uppercase text-[10px]">Title</span><input value={itinForm.title} onChange={e=>setItinForm({...itinForm, title:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" placeholder="YellaWood 500 - 1PM CT" /></label>
                <label className="grid gap-1"><span className="font-bold uppercase text-[10px]">Location</span><input value={itinForm.location} onChange={e=>setItinForm({...itinForm, location:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" placeholder="Talladega Superspeedway" /></label>
                <label className="grid gap-1"><span className="font-bold uppercase text-[10px]">Description</span><textarea value={itinForm.description} onChange={e=>setItinForm({...itinForm, description:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F] min-h-[64px]" /></label>
                <label className="grid gap-1"><span className="font-bold uppercase text-[10px]">Link (optional)</span><input value={itinForm.link} onChange={e=>setItinForm({...itinForm, link:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" placeholder="https://..." /></label>
                <label className="grid gap-1"><span className="font-bold uppercase text-[10px]">Type</span><select value={itinForm.type} onChange={e=>setItinForm({...itinForm, type:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]"><option value="general">general</option><option value="travel">travel</option><option value="race">race</option><option value="camp">camp</option><option value="stop">stop</option></select></label>
                <div className="flex gap-2 pt-2">
                  <button onClick={()=>{ if(!itinForm.title){ pushToast("Need title"); return; } const payload={ date:itinForm.date, time:itinForm.time, title:itinForm.title, location:itinForm.location||null, description:itinForm.description||null, link:itinForm.link||null, type:itinForm.type }; if(editingItin) updateItinMut.mutate({ id:editingItin.id, ...payload }); else addItinMut.mutate(payload); }} className="flex-1 py-2.5 bg-[var(--ink)] text-[var(--bg)] font-black uppercase tracking-widest mono text-[11px] rounded-full">Save</button>
                  <button onClick={()=>{ setShowItinModal(false); setEditingItin(null); }} className="px-4 py-2.5 bg-[var(--surface-2)] border rounded-full">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bachelor Lightbox */}
        {showBachelorLightbox && (
          <div className="fixed inset-0 z-[110] bg-black/80 grid place-items-center p-4" onClick={()=>setShowBachelorLightbox(false)}>
            <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e=>e.stopPropagation()}>
              <img src={bachelorPhoto} alt="Dan Rohe" className="max-w-full max-h-[85vh] rounded-[16px] border-2 border-white object-contain" />
              <button onClick={()=>setShowBachelorLightbox(false)} className="absolute -top-3 -right-3 w-8 h-8 bg-white text-black rounded-full grid place-items-center font-black">×</button>
              <div className="mt-3 text-center text-white mono text-[12px]">Dan Rohe • Bachelor • Click outside to close</div>
            </div>
          </div>
        )}

      </div>

      {/* Footer */}
      <footer className="relative z-10 bg-[var(--surface-2)] border-t border-[var(--border)] text-center mono text-[10px] tracking-widest uppercase py-4 px-4">
        <div className="opacity-70">
          Talladega • Dan Rohe's Bachelor Bash • 4 IN / 6 per rig
        </div>
        <div className="mt-1 opacity-50 text-[9px]">YellaWood 500 • Sun Oct 25 1PM CT • ATL → Talladega</div>
      </footer>
    </div>
  );
}

function CrewForm({ crew, rvs, onSave, onCancel }:{ crew:Crew|null, rvs:RV[], onSave:(v:any)=>void, onCancel:()=>void }){
  const [form,setForm]=useState({ name: crew?.name||"", role: (crew?.role as any)||"crew", phone: crew?.phone||"", email: crew?.email||"", flightFrom: crew?.flightFrom||"", flightAirline: crew?.flightAirline||"", flightNumber: crew?.flightNumber||"", flightDepart: crew?.flightDepart||"", flightArrive: crew?.flightArrive||"", arrivalAirport: crew?.arrivalAirport||"ATL", rvId: crew?.rvId ? String(crew.rvId) : "", notes: crew?.notes||"", rsvpStatus: crew?.rsvpStatus||"in" });
  return (
    <div className="mt-3 grid gap-3 mono text-[12px] text-[#0A1A2F]">
      <label className="grid gap-1">
        <span className="font-bold uppercase text-[10px] text-[#0A1A2F]">Full name</span>
        <input value={form.name} onChange={e=>setForm({...form, name:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" placeholder="Dan Rohe" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1"><span className="font-bold uppercase text-[10px] text-[#0A1A2F]">Role</span><select value={form.role} onChange={e=>setForm({...form, role:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]"><option value="bachelor">bachelor</option><option value="organizer">organizer</option><option value="planner">planner</option><option value="crew">crew</option></select></label>
        <label className="grid gap-1"><span className="font-bold uppercase text-[10px] text-[#0A1A2F]">RSVP status</span><select value={form.rsvpStatus} onChange={e=>setForm({...form, rsvpStatus:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]"><option value="in">in</option><option value="out">out</option><option value="maybe">maybe</option><option value="invited">invited</option></select></label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="grid gap-1"><span className="font-bold uppercase text-[10px] text-[#0A1A2F]">Email</span><input type="email" value={form.email} onChange={e=>setForm({...form, email:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" placeholder="dan@example.com" /></label>
        <label className="grid gap-1"><span className="font-bold uppercase text-[10px] text-[#0A1A2F]">Phone number</span><input value={form.phone} onChange={e=>setForm({...form, phone:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" placeholder="4105550123" /></label>
      </div>
      <label className="grid gap-1"><span className="font-bold uppercase text-[10px] text-[#0A1A2F]">RV assignment</span><select value={form.rvId} onChange={e=>setForm({...form, rvId:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]"><option value="">No RV assigned</option>{rvs.map(r=><option key={r.id} value={String(r.id)}>{r.name} ({r.capacity||6} seats)</option>)}</select></label>

      <div className="border-t border-[#0A1A2F]/10 pt-3 mt-1">
        <div className="font-bold uppercase text-[10px] text-[#0A1A2F] opacity-70 mb-2">Flight details (optional)</div>
        <div className="grid gap-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="grid gap-1"><span className="font-bold uppercase text-[10px] text-[#0A1A2F]">Flying from</span><input value={form.flightFrom} onChange={e=>setForm({...form, flightFrom:e.target.value})} placeholder="BWI" className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" /></label>
            <label className="grid gap-1"><span className="font-bold uppercase text-[10px] text-[#0A1A2F]">Airline</span><input value={form.flightAirline} onChange={e=>setForm({...form, flightAirline:e.target.value})} placeholder="Southwest" className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" /></label>
            <label className="grid gap-1"><span className="font-bold uppercase text-[10px] text-[#0A1A2F]">Flight number</span><input value={form.flightNumber} onChange={e=>setForm({...form, flightNumber:e.target.value})} placeholder="WN 202" className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" /></label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="grid gap-1"><span className="font-bold uppercase text-[10px] text-[#0A1A2F]">Depart time</span><input value={form.flightDepart} onChange={e=>setForm({...form, flightDepart:e.target.value})} placeholder="10:30 AM" className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" /></label>
            <label className="grid gap-1"><span className="font-bold uppercase text-[10px] text-[#0A1A2F]">Arrive time</span><input value={form.flightArrive} onChange={e=>setForm({...form, flightArrive:e.target.value})} placeholder="12:15 PM" className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" /></label>
            <label className="grid gap-1"><span className="font-bold uppercase text-[10px] text-[#0A1A2F]">Arrival airport</span><input value={form.arrivalAirport} onChange={e=>setForm({...form, arrivalAirport:e.target.value})} placeholder="ATL" className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" /></label>
          </div>
        </div>
      </div>

      <label className="grid gap-1"><span className="font-bold uppercase text-[10px] text-[#0A1A2F]">Notes</span><textarea value={form.notes} onChange={e=>setForm({...form, notes:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F] min-h-[64px]" placeholder="Dietary restrictions, etc." /></label>

      <div className="flex gap-2 pt-2"><button onClick={()=>onSave({ name:form.name, role:form.role, phone:form.phone, email:form.email||undefined, flightFrom:form.flightFrom||undefined, flightAirline:form.flightAirline||undefined, flightNumber:form.flightNumber||undefined, flightDepart:form.flightDepart||undefined, flightArrive:form.flightArrive||undefined, arrivalAirport:form.arrivalAirport||"ATL", rvId: form.rvId? Number(form.rvId) : null, notes:form.notes||undefined, rsvpStatus:form.rsvpStatus })} className="flex-1 py-2.5 bg-[#0A1A2F] text-white font-black uppercase tracking-widest text-[11px] border rounded-full">Save</button><button onClick={onCancel} className="px-4 py-2.5 bg-white border border-[#0A1A2F]/20 text-[#0A1A2F] font-bold rounded-full">Cancel</button></div>
    </div>
  );
}
function RVForm({ rv, crew, onSave, onCancel }:{ rv:RV|null, crew:Crew[], onSave:(v:any)=>void, onCancel:()=>void }){
  const [form,setForm]=useState({ name: rv?.name||`RV-${Math.floor(Math.random()*100)}`, company: rv?.company||"", confirmation: rv?.confirmation||"", capacity: String(rv?.capacity||6), costCents: rv?.costCents ? String((rv.costCents/100)) : "", driverCrewId: rv?.driverCrewId? String(rv.driverCrewId):"", pickupLocation: rv?.pickupLocation||"ATL Airport RV Depot", pickupTime: rv?.pickupTime||"11:30", dropoffTime: rv?.dropoffTime||"13:00", status: rv?.status||"reserved" });
  return (
    <div className="mt-3 grid gap-3 mono text-[12px] text-[#0A1A2F]">
      <label className="grid gap-1">
        <span className="font-bold uppercase text-[10px] text-[#0A1A2F]">RV name</span>
        <input value={form.name} onChange={e=>setForm({...form, name:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" placeholder="Thunder Wagon" />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="grid gap-1"><span className="font-bold uppercase text-[10px] text-[#0A1A2F]">Rental company</span><input value={form.company} onChange={e=>setForm({...form, company:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" placeholder="Cruise America" /></label>
        <label className="grid gap-1"><span className="font-bold uppercase text-[10px] text-[#0A1A2F]">Confirmation #</span><input value={form.confirmation} onChange={e=>setForm({...form, confirmation:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" placeholder="ABC123" /></label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1"><span className="font-bold uppercase text-[10px] text-[#0A1A2F]">Seat capacity</span><input type="number" min={1} max={12} value={form.capacity} onChange={e=>setForm({...form, capacity:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" placeholder="6" /></label>
        <label className="grid gap-1"><span className="font-bold uppercase text-[10px] text-[#0A1A2F]">Rental cost ($)</span><input type="number" step="0.01" value={form.costCents} onChange={e=>setForm({...form, costCents:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" placeholder="850.00" /></label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="grid gap-1"><span className="font-bold uppercase text-[10px] text-[#0A1A2F]">Driver</span><select value={form.driverCrewId} onChange={e=>setForm({...form, driverCrewId:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]"><option value="">No driver assigned</option>{crew.map(c=><option key={c.id} value={String(c.id)}>{c.name}</option>)}</select></label>
        <label className="grid gap-1"><span className="font-bold uppercase text-[10px] text-[#0A1A2F]">Booking status</span><select value={form.status} onChange={e=>setForm({...form, status:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]"><option value="reserved">Reserved</option><option value="confirmed">Confirmed</option><option value="picked_up">Picked up</option><option value="returned">Returned</option><option value="cancelled">Cancelled</option></select></label>
      </div>
      <div className="border-t border-[#0A1A2F]/10 pt-3 mt-1">
        <div className="font-bold uppercase text-[10px] text-[#0A1A2F] opacity-70 mb-2">Pickup & dropoff</div>
        <div className="grid gap-2">
          <label className="grid gap-1"><span className="font-bold uppercase text-[10px] text-[#0A1A2F]">Pickup location</span><input value={form.pickupLocation} onChange={e=>setForm({...form, pickupLocation:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" placeholder="ATL Airport RV Depot" /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1"><span className="font-bold uppercase text-[10px] text-[#0A1A2F]">Pickup time</span><input value={form.pickupTime} onChange={e=>setForm({...form, pickupTime:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" placeholder="11:30" /></label>
            <label className="grid gap-1"><span className="font-bold uppercase text-[10px] text-[#0A1A2F]">Dropoff time</span><input value={form.dropoffTime} onChange={e=>setForm({...form, dropoffTime:e.target.value})} className="border border-[#0A1A2F]/20 rounded-[8px] px-3 py-2 bg-white text-[#0A1A2F]" placeholder="13:00" /></label>
          </div>
        </div>
      </div>
      <div className="flex gap-2 pt-2"><button onClick={()=>onSave({ name:form.name, company:form.company||undefined, confirmation:form.confirmation||undefined, capacity: Number(form.capacity)||6, costCents: form.costCents? Math.round(parseFloat(form.costCents)*100):0, driverCrewId: form.driverCrewId? Number(form.driverCrewId): null, pickupLocation: form.pickupLocation||undefined, pickupTime: form.pickupTime||undefined, dropoffTime: form.dropoffTime||undefined, status: form.status })} className="flex-1 py-2.5 bg-[#0A1A2F] text-white font-black uppercase tracking-widest text-[11px] border rounded-full">Save RV</button><button onClick={onCancel} className="px-4 py-2.5 bg-white border border-[#0A1A2F]/20 text-[#0A1A2F] font-bold rounded-full">Cancel</button></div>
    </div>
  );
}
