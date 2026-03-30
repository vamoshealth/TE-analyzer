import { useState, useEffect } from "react";

// ─── Rubric Definition ───────────────────────────────────────────────────────
const CATEGORIES = [
  {
    id: "greeting", label: "Greeting & Identification",
    items: [
      { id: "g1", text: "Identified themselves by name and role", weight: 2 },
      { id: "g2", text: "Verified patient identity (name + DOB or 2 identifiers)", weight: 3 },
      { id: "g3", text: "Professional and warm tone", weight: 2 },
      { id: "g4", text: "Stated purpose of call (if outbound)", weight: 1 },
    ],
  },
  {
    id: "clinical", label: "Provider Message Delivery",
    items: [
      { id: "c1", text: "Clearly stated the purpose of the call (results, update, or instructions)", weight: 3 },
      { id: "c2", text: "Accurately relayed provider's findings, results, or diagnosis", weight: 3 },
      { id: "c3", text: "Communicated provider instructions / treatment plan correctly", weight: 3 },
      { id: "c4", text: "Explained medication changes, dosages, or refill instructions if applicable", weight: 3 },
      { id: "c5", text: "Conveyed urgency level appropriately (routine vs. needs prompt follow-up)", weight: 2 },
      { id: "c6", text: "Addressed patient questions or escalated to provider when outside scope", weight: 3 },
    ],
  },
  {
    id: "communication", label: "Communication & Empathy",
    items: [
      { id: "m1", text: "Used active listening techniques", weight: 2 },
      { id: "m2", text: "Demonstrated empathy and compassion", weight: 2 },
      { id: "m3", text: "Used clear, jargon-free language", weight: 2 },
      { id: "m4", text: "Allowed patient to speak without interruption", weight: 2 },
      { id: "m5", text: "Managed difficult emotions appropriately", weight: 2 },
    ],
  },
  {
    id: "resolution", label: "Resolution & Follow-Up",
    items: [
      { id: "r1", text: "Provided clear plan of action / next steps", weight: 3 },
      { id: "r2", text: "Verified patient understanding (teach-back)", weight: 3 },
      { id: "r3", text: "Scheduled follow-up if appropriate", weight: 2 },
      { id: "r4", text: "Offered additional assistance before closing", weight: 1 },
      { id: "r5", text: "Professional closing with callback info", weight: 1 },
    ],
  },
  {
    id: "compliance", label: "Compliance & Documentation",
    items: [
      { id: "d1", text: "HIPAA-compliant communication", weight: 3 },
      { id: "d2", text: "Accurate documentation in EHR", weight: 3 },
      { id: "d3", text: "Followed escalation protocol when needed", weight: 3 },
      { id: "d4", text: "Obtained verbal consent when required", weight: 2 },
    ],
  },
];

const ALL_ITEMS = CATEGORIES.flatMap((c) => c.items);
const SCORE_LABELS = { 2: "Met", 1: "Partial", 0: "Not Met", "-1": "N/A" };
const SCORE_COLORS = { 2: "#16a34a", 1: "#ca8a04", 0: "#dc2626", "-1": "#6b7280" };
const SCORE_BGS   = { 2: "#f0fdf4", 1: "#fefce8", 0: "#fef2f2", "-1": "#f3f4f6" };

const STAFF_MEMBERS = [
  "Alex","Ben","Bianca","Cassandra","Cindy","Denissee","Diana","Eder",
  "Kemberly","Kendry","Leidy","Litzy","Luis","Marco","Martha","Maritza",
  "Milzanea","Noah","Paola","Patssy","Shane","Suseth","Veruska",
];
const CALL_TYPES = [
  "Inbound – Patient Inquiry","Inbound – Symptom/Triage","Inbound – Rx Refill","Inbound – Lab Results",
  "Outbound – Follow-Up","Outbound – Care Gap","Outbound – Appointment Reminder","Outbound – Results Notification",
];
const CLINICS = ["Orem", "Ogden", "West Valley", "Arizona"];
const CLINIC_COLORS = { "Orem": "#0f766e", "Ogden": "#7c3aed", "West Valley": "#b45309", "Arizona": "#0369a1" };
const CLINIC_BGS = { "Orem": "#f0fdfa", "Ogden": "#f5f3ff", "West Valley": "#fffbeb", "Arizona": "#eff6ff" };

// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function getLetterGrade(pct) {
  if (pct >= 95) return { grade: "A+", color: "#16a34a" };
  if (pct >= 90) return { grade: "A",  color: "#16a34a" };
  if (pct >= 85) return { grade: "B+", color: "#65a30d" };
  if (pct >= 80) return { grade: "B",  color: "#ca8a04" };
  if (pct >= 75) return { grade: "C+", color: "#ea580c" };
  if (pct >= 70) return { grade: "C",  color: "#ea580c" };
  return { grade: "F", color: "#dc2626" };
}

const STORAGE_KEY = "te_audits_v2";
function loadAudits() {
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveAudits(audits) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(audits)); } catch(e) { console.error(e); }
}

function buildAuditPrompt(teNote, transcript) {
  const rubricJSON = CATEGORIES.map((cat) => ({
    category_id: cat.id, category_label: cat.label,
    items: cat.items.map((i) => ({ id: i.id, text: i.text, weight: i.weight })),
  }));
  return `You are a medical telephone encounter QA auditor for Vamos Health, a Direct Primary Care clinic. Your job is to score a staff member's phone call based on the rubric below.

You will be given:
1. The original Telephone Encounter (TE) note from the EHR
2. A transcript of the actual phone call

The call may be in English or Spanish — evaluate based on content and quality regardless of language.

Score each rubric item as:
- 2 = "Met" (fully demonstrated)
- 1 = "Partial" (partially demonstrated or inconsistent)
- 0 = "Not Met" (not demonstrated at all)
- -1 = "N/A" (not applicable to this call type)

RUBRIC:
${JSON.stringify(rubricJSON, null, 2)}

Respond ONLY with a JSON object (no markdown, no backticks, no preamble) in this exact format:
{
  "scores": { "<item_id>": <score_number>, ... },
  "rationale": { "<item_id>": "<1-2 sentence explanation>", ... },
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "improvements": ["<area for improvement 1>", ...],
  "coaching_summary": "<2-3 sentence overall coaching feedback paragraph>"
}

Every item ID from the rubric MUST appear in both "scores" and "rationale". Be specific — reference actual quotes or behaviors from the transcript when possible. For very short calls, use N/A generously for items that had no opportunity to be demonstrated.

=== ORIGINAL TE NOTE ===
${teNote || "(No TE note provided)"}

=== CALL TRANSCRIPT ===
${transcript || "(No transcript provided)"}`;
}

// ─── Mini Components ──────────────────────────────────────────────────────────
function ScoreBadge({ value }) {
  const v = String(value);
  return (
    <span style={{ padding:"3px 10px", fontSize:12, fontWeight:700, borderRadius:6,
      border:`1.5px solid ${SCORE_COLORS[v]||"#6b7280"}`, background:SCORE_BGS[v]||"#f3f4f6",
      color:SCORE_COLORS[v]||"#6b7280", whiteSpace:"nowrap" }}>
      {SCORE_LABELS[v]||"—"}
    </span>
  );
}

function MiniBar({ value, max, color }) {
  const pct = max > 0 ? (value/max)*100 : 0;
  return (
    <div style={{ width:80, height:6, background:"#e5e7eb", borderRadius:3, overflow:"hidden" }}>
      <div style={{ width:`${pct}%`, height:"100%", background:color, borderRadius:3, transition:"width .3s" }} />
    </div>
  );
}

function GradeRing({ pct, grade, color, size = 64 }) {
  const r = (size/2) - 6;
  const circ = 2 * Math.PI * r;
  const dash = pct != null ? (pct/100)*circ : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={5} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        fontSize={size < 60 ? 11 : 13} fontWeight={700} fill={color}>{grade}</text>
    </svg>
  );
}

function PulsingLoader() {
  return (
    <div style={{ display:"flex", gap:6, justifyContent:"center", padding:"40px 0" }}>
      <style>{`@keyframes pd{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}`}</style>
      {[0,1,2].map(i=>(
        <div key={i} style={{ width:10, height:10, borderRadius:"50%", background:"#0f766e",
          animation:"pd 1.2s infinite ease-in-out", animationDelay:`${i*.15}s` }} />
      ))}
    </div>
  );
}

function TrendBar({ audits }) {
  if (audits.length === 0) return <div style={{ fontSize:12, color:"#94a3b8" }}>No audits yet</div>;
  const sorted = [...audits].sort((a,b) => new Date(a.callDate)-new Date(b.callDate));
  const max = 100, h = 40, w = 160;
  const pts = sorted.map((a,i) => {
    const x = sorted.length === 1 ? w/2 : (i/(sorted.length-1))*w;
    const y = h - ((a.totalPct||0)/max)*h;
    return `${x},${y}`;
  }).join(" ");
  const lastPct = sorted[sorted.length-1].totalPct;
  const { color } = getLetterGrade(lastPct||0);
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {sorted.map((a,i) => {
          const x = sorted.length===1 ? w/2 : (i/(sorted.length-1))*w;
          const y = h - ((a.totalPct||0)/max)*h;
          return <circle key={i} cx={x} cy={y} r={3} fill={color} />;
        })}
      </svg>
      <span style={{ fontSize:12, fontWeight:700, color }}>{lastPct}%</span>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function TelephoneEncounterAudit() {
  const [view, setView]               = useState("new");
  const [audits, setAudits]           = useState(() => loadAudits());
  const [staffName, setStaffName]     = useState("");
  const [clinic, setClinic]           = useState("");
  const [callType, setCallType]       = useState("");
  const [callDate, setCallDate]       = useState(new Date().toISOString().slice(0,10));
  const [callId, setCallId]           = useState("");
  const [teNote, setTeNote]           = useState("");
  const [transcript, setTranscript]   = useState("");
  const [recordingUrl, setRecordingUrl] = useState("");
  const [aiResult, setAiResult]       = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [showExportMsg, setShowExportMsg] = useState(false);
  const [expanded, setExpanded]       = useState({});
  const [detailAudit, setDetailAudit] = useState(null);
  const [selectedClinic, setSelectedClinic] = useState("All");
  const [dashClinic, setDashClinic]   = useState("All");

  useEffect(() => { saveAudits(audits); }, [audits]);

  const resetForm = () => {
    setStaffName(""); setClinic(""); setCallType("");
    setCallDate(new Date().toISOString().slice(0,10));
    setCallId(""); setTeNote(""); setTranscript(""); setRecordingUrl("");
    setAiResult(null); setError(""); setExpanded({});
  };

  const runAudit = async () => {
    if (!staffName || !clinic || !callType || (!teNote && !transcript)) return;
    setLoading(true); setError(""); setAiResult(null);
    try {
      const response = await fetch("/api/audit", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ messages:[{ role:"user", content:buildAuditPrompt(teNote, transcript) }] }),
      });
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json();
      const text = data.content.map(b => b.type==="text" ? b.text : "").join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      if (!parsed.scores) throw new Error("Invalid response format");
      setAiResult(parsed);
      setView("results");
      const exp = {}; CATEGORIES.forEach(c => { exp[c.id]=true; }); setExpanded(exp);
    } catch(err) {
      setError("Audit failed — " + (err.message||"please try again."));
    } finally { setLoading(false); }
  };

  const computeTotals = (scores) => {
    const ap = ALL_ITEMS.filter(i => scores[i.id]!==undefined && scores[i.id]!==-1);
    const earned = ap.reduce((s,i) => s+(scores[i.id]===2?i.weight*2:scores[i.id]===1?i.weight:0),0);
    const possible = ap.reduce((s,i) => s+i.weight*2,0);
    const pct = possible>0 ? Math.round((earned/possible)*100) : null;
    return { pct, grade: pct!==null ? getLetterGrade(pct) : {grade:"—",color:"#9ca3af"} };
  };
  const computeCategoryTotals = (scores, cat) => {
    const ap = cat.items.filter(i => scores[i.id]!==undefined && scores[i.id]!==-1);
    const earned = ap.reduce((s,i) => s+(scores[i.id]===2?i.weight*2:scores[i.id]===1?i.weight:0),0);
    const possible = ap.reduce((s,i) => s+i.weight*2,0);
    const pct = possible>0 ? Math.round((earned/possible)*100) : null;
    return { pct, grade: pct!==null ? getLetterGrade(pct) : {grade:"—",color:"#9ca3af"} };
  };

  const saveAudit = () => {
    if (!aiResult) return;
    const { pct, grade } = computeTotals(aiResult.scores);
    const audit = {
      id: generateId(), staffName, clinic, callType, callDate, callId,
      teNote, transcript, recordingUrl,
      scores: aiResult.scores, rationale: aiResult.rationale,
      strengths: aiResult.strengths, improvements: aiResult.improvements,
      coachingSummary: aiResult.coaching_summary,
      totalPct: pct, totalGrade: grade.grade, createdAt: new Date().toISOString(),
    };
    setAudits(p => [audit,...p]);
    resetForm(); setView("history");
  };

  // ─── Computed data ────────────────────────────────────────────────────────
  const clinicStats = CLINICS.map(cl => {
    const mine = audits.filter(a => a.clinic===cl);
    const avg = mine.length>0 ? Math.round(mine.reduce((s,a)=>s+(a.totalPct||0),0)/mine.length) : null;
    const byCategory = CATEGORIES.map(cat => {
      const scores = mine.map(a => {
        const ap = cat.items.filter(i => a.scores?.[i.id]!==undefined && a.scores[i.id]!==-1);
        const e = ap.reduce((s,i)=>s+(a.scores[i.id]===2?i.weight*2:a.scores[i.id]===1?i.weight:0),0);
        const p = ap.reduce((s,i)=>s+i.weight*2,0);
        return p>0 ? Math.round((e/p)*100) : null;
      }).filter(v=>v!==null);
      const catAvg = scores.length>0 ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : null;
      return { label: cat.label, avg: catAvg };
    });
    return { clinic: cl, count: mine.length, avg, byCategory, audits: mine };
  });

  const staffSummary = STAFF_MEMBERS.map(name => {
    const all = audits.filter(a => a.staffName===name);
    const filtered = dashClinic==="All" ? all : all.filter(a=>a.clinic===dashClinic);
    const avg = filtered.length>0 ? Math.round(filtered.reduce((s,a)=>s+(a.totalPct||0),0)/filtered.length) : null;
    const cl = filtered.length>0 ? filtered[filtered.length-1].clinic : (all.length>0?all[0].clinic:"");
    return { name, count: filtered.length, avg, clinic: cl, audits: filtered };
  }).filter(s=>s.count>0).sort((a,b)=>(b.avg||0)-(a.avg||0));

  const exportCSV = () => {
    if (audits.length===0) return;
    const headers = ["Date","Staff","Clinic","Call Type","Call ID","Score %","Grade","Recording URL","Strengths","Improvements","Coaching Summary"];
    const rows = audits.map(a=>[
      a.callDate, a.staffName, a.clinic||"", a.callType, a.callId, a.totalPct??"", a.totalGrade,
      a.recordingUrl||"",
      `"${(a.strengths||[]).join("; ").replace(/"/g,'""')}"`,
      `"${(a.improvements||[]).join("; ").replace(/"/g,'""')}"`,
      `"${(a.coachingSummary||"").replace(/"/g,'""')}"`,
    ]);
    const csv=[headers.join(","),...rows.map(r=>r.join(","))].join("\n");
    const blob=new Blob([csv],{type:"text/csv"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url;
    a.download=`te-audits-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    setShowExportMsg(true); setTimeout(()=>setShowExportMsg(false),2500);
  };

  // ─── Styles ───────────────────────────────────────────────────────────────
  const fonts = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:wght@700;800&display=swap');`;
  const navBtn = (active) => ({
    padding:"8px 14px", fontSize:12, fontWeight:600, fontFamily:"'DM Sans',sans-serif",
    border:"none", borderRadius:8, cursor:"pointer", transition:"all .15s",
    background: active?"#0f766e":"transparent", color: active?"#fff":"#64748b",
  });
  const inputStyle = {
    display:"block", width:"100%", marginTop:4, padding:"9px 10px",
    border:"1px solid #d1d5db", borderRadius:8, fontSize:13,
    fontFamily:"'DM Sans',sans-serif", background:"#fff", boxSizing:"border-box",
  };
  const cardStyle = { background:"#fff", borderRadius:12, border:"1px solid #e5e7eb", padding:18 };
  const pillBtn = (active, color="#0f766e") => ({
    padding:"5px 14px", fontSize:12, fontWeight:600, borderRadius:20,
    border:`1.5px solid ${active?color:"#e5e7eb"}`,
    background: active ? color+"14" : "#fff",
    color: active ? color : "#94a3b8", cursor:"pointer",
  });

  // ─── Score card renderer ──────────────────────────────────────────────────
  const renderScoreCard = (scores, rationale, strengths, improvements, coaching, meta) => {
    const { pct, grade } = computeTotals(scores);
    return (
      <>
        <div style={{ ...cardStyle, display:"flex", justifyContent:"space-between", alignItems:"center", borderLeft:`4px solid ${grade.color}` }}>
          <div>
            <div style={{ fontSize:12, color:"#94a3b8", fontWeight:600 }}>{meta.staffName} · {meta.callDate}</div>
            <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{meta.callType}</div>
            {meta.clinic && (
              <span style={{ display:"inline-block", marginTop:4, fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:10,
                background: CLINIC_BGS[meta.clinic]||"#f1f5f9", color: CLINIC_COLORS[meta.clinic]||"#64748b" }}>
                {meta.clinic}
              </span>
            )}
            {meta.recordingUrl && <a href={meta.recordingUrl} target="_blank" rel="noopener noreferrer" style={{ display:"block", fontSize:12, color:"#0f766e", fontWeight:600, marginTop:4 }}>▶ Recording</a>}
          </div>
          <div style={{ textAlign:"right" }}>
            <GradeRing pct={pct} grade={grade.grade} color={grade.color} size={72} />
            <div style={{ fontSize:13, color:grade.color, fontWeight:600, marginTop:2 }}>{pct}%</div>
          </div>
        </div>

        {coaching && (
          <div style={{ ...cardStyle, borderLeft:"4px solid #0f766e" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#0f766e", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Coaching Summary</div>
            <p style={{ fontSize:13, color:"#334155", lineHeight:1.6, margin:0 }}>{coaching}</p>
          </div>
        )}

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div style={{ ...cardStyle, borderTop:"3px solid #16a34a" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#16a34a", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Strengths</div>
            {(strengths||[]).map((s,i)=>(
              <div key={i} style={{ fontSize:12, color:"#334155", lineHeight:1.5, marginBottom:6, paddingLeft:12, borderLeft:"2px solid #bbf7d0" }}>{s}</div>
            ))}
          </div>
          <div style={{ ...cardStyle, borderTop:"3px solid #ea580c" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#ea580c", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Areas for Improvement</div>
            {(improvements||[]).map((s,i)=>(
              <div key={i} style={{ fontSize:12, color:"#334155", lineHeight:1.5, marginBottom:6, paddingLeft:12, borderLeft:"2px solid #fed7aa" }}>{s}</div>
            ))}
          </div>
        </div>

        {CATEGORIES.map(cat => {
          const { pct:catPct, grade:catGrade } = computeCategoryTotals(scores, cat);
          const isExp = !!expanded[cat.id];
          return (
            <div key={cat.id} style={{ ...cardStyle, padding:0, overflow:"hidden" }}>
              <button onClick={()=>setExpanded(p=>({...p,[cat.id]:!p[cat.id]}))}
                style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 18px", background:"none", border:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                <span style={{ fontSize:14, fontWeight:700, color:"#1e293b" }}>{cat.label}</span>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  {catPct!==null && <span style={{ fontSize:13, fontWeight:700, color:catGrade.color, background:catGrade.color+"14", padding:"2px 10px", borderRadius:6 }}>{catGrade.grade} · {catPct}%</span>}
                  <span style={{ fontSize:18, color:"#94a3b8", transform:isExp?"rotate(180deg)":"rotate(0)", transition:"transform .2s", display:"inline-block" }}>▾</span>
                </div>
              </button>
              {isExp && (
                <div style={{ padding:"0 18px 16px" }}>
                  {cat.items.map(item=>(
                    <div key={item.id} style={{ padding:"10px 0", borderTop:"1px solid #f1f5f9" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span style={{ fontSize:13, color:"#334155", flex:1, paddingRight:12 }}>{item.text}</span>
                        <ScoreBadge value={scores[item.id]??-1} />
                      </div>
                      {rationale?.[item.id] && <div style={{ fontSize:12, color:"#64748b", marginTop:4, paddingLeft:12, borderLeft:"2px solid #e2e8f0", lineHeight:1.5 }}>{rationale[item.id]}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", background:"#f8fafc", minHeight:"100vh", color:"#1e293b" }}>
      <style>{fonts}</style>

      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#0f766e 0%,#134e4a 100%)", padding:"28px 28px 20px", color:"#fff" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <div style={{ fontSize:11, fontWeight:600, letterSpacing:2, textTransform:"uppercase", opacity:.65, marginBottom:4 }}>Vamos Health</div>
            <h1 style={{ fontFamily:"'Fraunces',serif", fontSize:24, fontWeight:800, margin:0, lineHeight:1.2 }}>Telephone Encounter Audit</h1>
            <p style={{ fontSize:13, opacity:.75, margin:"6px 0 0" }}>AI-powered QA scoring & coaching</p>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:28, fontWeight:800, fontFamily:"'Fraunces',serif" }}>{audits.length}</div>
            <div style={{ fontSize:11, opacity:.65 }}>Total Audits</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:4, marginTop:18, background:"rgba(255,255,255,.1)", borderRadius:10, padding:4, flexWrap:"wrap" }}>
          {[["new","New Audit"],["history","History"],["clinics","Clinics"],["dashboard","Dashboard"],["staff","Staff"]].map(([v,l])=>(
            <button key={v} style={navBtn(view===v||(v==="new"&&view==="results"))}
              onClick={()=>{ if(v==="new") resetForm(); setDetailAudit(null); setView(v); }}>{l}</button>
          ))}
          <div style={{ flex:1 }} />
          <button onClick={exportCSV} style={{ ...navBtn(false), color:"#99f6e4", fontSize:12 }}>⤓ CSV</button>
        </div>
      </div>

      {showExportMsg && <div style={{ background:"#f0fdf4", color:"#16a34a", textAlign:"center", padding:10, fontSize:13, fontWeight:600 }}>✓ CSV exported</div>}

      <div style={{ maxWidth:780, margin:"0 auto", padding:"20px 16px 60px" }}>

        {/* ═══ NEW AUDIT ═══ */}
        {view==="new" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <label style={{ fontSize:12, fontWeight:600, color:"#475569" }}>
                Staff Member *
                <select value={staffName} onChange={e=>setStaffName(e.target.value)} style={inputStyle}>
                  <option value="">Select…</option>
                  {STAFF_MEMBERS.map(n=><option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label style={{ fontSize:12, fontWeight:600, color:"#475569" }}>
                Clinic *
                <select value={clinic} onChange={e=>setClinic(e.target.value)} style={inputStyle}>
                  <option value="">Select…</option>
                  {CLINICS.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label style={{ fontSize:12, fontWeight:600, color:"#475569" }}>
                Call Type *
                <select value={callType} onChange={e=>setCallType(e.target.value)} style={inputStyle}>
                  <option value="">Select…</option>
                  {CALL_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label style={{ fontSize:12, fontWeight:600, color:"#475569" }}>
                Call Date
                <input type="date" value={callDate} onChange={e=>setCallDate(e.target.value)} style={inputStyle} />
              </label>
              <label style={{ fontSize:12, fontWeight:600, color:"#475569", gridColumn:"1/-1" }}>
                Call / Recording ID
                <input type="text" value={callId} onChange={e=>setCallId(e.target.value)} placeholder="Optional" style={inputStyle} />
              </label>
            </div>

            <div style={cardStyle}>
              <label style={{ fontSize:12, fontWeight:600, color:"#475569" }}>
                Original Telephone Encounter Note *
                <textarea value={teNote} onChange={e=>setTeNote(e.target.value)} rows={6}
                  placeholder="Paste the original TE documentation from eCW here…"
                  style={{ ...inputStyle, marginTop:6, resize:"vertical", lineHeight:1.6 }} />
              </label>
            </div>

            <div style={cardStyle}>
              <label style={{ fontSize:12, fontWeight:600, color:"#475569" }}>
                Call Transcript *
                <textarea value={transcript} onChange={e=>setTranscript(e.target.value)} rows={8}
                  placeholder="Paste the call transcript here…"
                  style={{ ...inputStyle, marginTop:6, resize:"vertical", lineHeight:1.6 }} />
              </label>
            </div>

            <div style={cardStyle}>
              <label style={{ fontSize:12, fontWeight:600, color:"#475569" }}>
                Audio Recording Link
                <div style={{ display:"flex", gap:8, marginTop:4 }}>
                  <input type="url" value={recordingUrl} onChange={e=>setRecordingUrl(e.target.value)}
                    placeholder="https://..." style={{ ...inputStyle, flex:1, marginTop:0 }} />
                  {recordingUrl && (
                    <a href={recordingUrl} target="_blank" rel="noopener noreferrer"
                      style={{ display:"flex", alignItems:"center", padding:"0 12px", background:"#f0fdfa", border:"1px solid #99f6e4", borderRadius:8, fontSize:12, fontWeight:600, color:"#0f766e", textDecoration:"none", whiteSpace:"nowrap" }}>
                      ▶ Open
                    </a>
                  )}
                </div>
              </label>
            </div>

            {error && <div style={{ background:"#fef2f2", color:"#dc2626", padding:"12px 16px", borderRadius:10, fontSize:13, fontWeight:600 }}>{error}</div>}

            <button onClick={runAudit} disabled={loading||!staffName||!clinic||!callType||(!teNote&&!transcript)}
              style={{ padding:"14px 28px", fontSize:15, fontWeight:700, fontFamily:"'DM Sans',sans-serif",
                border:"none", borderRadius:10, cursor:loading?"wait":"pointer",
                background:(!staffName||!clinic||!callType||(!teNote&&!transcript))?"#d1d5db":"linear-gradient(135deg,#0f766e,#134e4a)",
                color:"#fff", width:"100%" }}>
              {loading ? "Analyzing encounter…" : "Run AI Audit"}
            </button>

            {loading && (
              <div style={{ ...cardStyle, textAlign:"center" }}>
                <PulsingLoader />
                <p style={{ fontSize:13, color:"#64748b", marginTop:8 }}>Claude is reviewing the encounter against all rubric criteria…</p>
              </div>
            )}
          </div>
        )}

        {/* ═══ RESULTS ═══ */}
        {view==="results" && aiResult && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {renderScoreCard(aiResult.scores, aiResult.rationale, aiResult.strengths, aiResult.improvements, aiResult.coaching_summary, { staffName, callDate, callType, recordingUrl, clinic })}
            {teNote && (
              <div style={cardStyle}>
                <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Original TE Note</div>
                <div style={{ fontSize:12, color:"#475569", lineHeight:1.6, whiteSpace:"pre-wrap", maxHeight:160, overflowY:"auto" }}>{teNote}</div>
              </div>
            )}
            <div style={{ display:"flex", gap:12 }}>
              <button onClick={()=>setView("new")} style={{ flex:1, padding:13, fontSize:14, fontWeight:600, fontFamily:"'DM Sans',sans-serif", border:"1px solid #d1d5db", borderRadius:10, cursor:"pointer", background:"#fff", color:"#475569" }}>← Back to Edit</button>
              <button onClick={saveAudit} style={{ flex:2, padding:13, fontSize:15, fontWeight:700, fontFamily:"'DM Sans',sans-serif", border:"none", borderRadius:10, cursor:"pointer", background:"linear-gradient(135deg,#0f766e,#134e4a)", color:"#fff" }}>Save Audit</button>
            </div>
          </div>
        )}

        {/* ═══ HISTORY ═══ */}
        {view==="history" && !detailAudit && (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {/* Clinic filter pills */}
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {["All",...CLINICS].map(cl=>(
                <button key={cl} style={pillBtn(selectedClinic===cl, CLINIC_COLORS[cl]||"#0f766e")}
                  onClick={()=>setSelectedClinic(cl)}>{cl}</button>
              ))}
            </div>
            {audits.filter(a=>selectedClinic==="All"||a.clinic===selectedClinic).length===0 ? (
              <div style={{ textAlign:"center", padding:60, color:"#94a3b8", fontSize:14 }}>No audits yet.</div>
            ) : audits.filter(a=>selectedClinic==="All"||a.clinic===selectedClinic).map(a=>{
              const {grade,color} = a.totalPct!==null ? getLetterGrade(a.totalPct) : {grade:"—",color:"#9ca3af"};
              return (
                <button key={a.id} onClick={()=>setDetailAudit(a)}
                  style={{ ...cardStyle, textAlign:"left", cursor:"pointer", width:"100%", fontFamily:"'DM Sans',sans-serif" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <span style={{ fontSize:15, fontWeight:700 }}>{a.staffName}</span>
                      <span style={{ fontSize:12, color:"#94a3b8", marginLeft:8 }}>{a.callDate}</span>
                      {a.clinic && <span style={{ marginLeft:8, fontSize:11, fontWeight:600, padding:"1px 7px", borderRadius:8, background:CLINIC_BGS[a.clinic]||"#f1f5f9", color:CLINIC_COLORS[a.clinic]||"#64748b" }}>{a.clinic}</span>}
                    </div>
                    <span style={{ fontSize:16, fontWeight:800, color, background:color+"14", padding:"2px 12px", borderRadius:8, fontFamily:"'Fraunces',serif" }}>{grade} · {a.totalPct??'—'}%</span>
                  </div>
                  <div style={{ fontSize:12, color:"#64748b", marginTop:4 }}>{a.callType}</div>
                  {a.coachingSummary && <div style={{ fontSize:12, color:"#475569", marginTop:6, lineHeight:1.5, overflow:"hidden", textOverflow:"ellipsis", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{a.coachingSummary}</div>}
                </button>
              );
            })}
          </div>
        )}

        {/* ═══ HISTORY DETAIL ═══ */}
        {view==="history" && detailAudit && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <button onClick={()=>setDetailAudit(null)} style={{ alignSelf:"flex-start", background:"none", border:"none", cursor:"pointer", fontSize:13, color:"#0f766e", fontWeight:600, padding:0 }}>← Back to History</button>
            {renderScoreCard(detailAudit.scores||{}, detailAudit.rationale, detailAudit.strengths, detailAudit.improvements, detailAudit.coachingSummary, detailAudit)}
            {detailAudit.teNote && (
              <div style={cardStyle}>
                <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Original TE Note</div>
                <div style={{ fontSize:12, color:"#475569", lineHeight:1.6, whiteSpace:"pre-wrap" }}>{detailAudit.teNote}</div>
              </div>
            )}
          </div>
        )}

        {/* ═══ CLINICS ═══ */}
        {view==="clinics" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              {clinicStats.map(cs=>{
                const {grade,color} = cs.avg!==null ? getLetterGrade(cs.avg) : {grade:"—",color:"#9ca3af"};
                const clColor = CLINIC_COLORS[cs.clinic]||"#0f766e";
                const clBg = CLINIC_BGS[cs.clinic]||"#f0fdfa";
                return (
                  <div key={cs.clinic} style={{ ...cardStyle, borderTop:`3px solid ${clColor}` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                      <div>
                        <div style={{ fontSize:15, fontWeight:700, color:clColor }}>{cs.clinic}</div>
                        <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>{cs.count} audit{cs.count!==1?"s":""}</div>
                      </div>
                      <GradeRing pct={cs.avg} grade={grade} color={color} size={56} />
                    </div>
                    {cs.count>0 && (
                      <>
                        <div style={{ fontSize:11, fontWeight:600, color:"#94a3b8", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>By Category</div>
                        {cs.byCategory.map(bc=>{
                          const catG = bc.avg!==null ? getLetterGrade(bc.avg) : {grade:"—",color:"#9ca3af"};
                          return (
                            <div key={bc.label} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                              <div style={{ fontSize:11, color:"#475569", flex:1, lineHeight:1.3 }}>{bc.label}</div>
                              <div style={{ width:60, height:5, background:"#e5e7eb", borderRadius:3, overflow:"hidden" }}>
                                <div style={{ width:`${bc.avg||0}%`, height:"100%", background:catG.color, borderRadius:3 }} />
                              </div>
                              <div style={{ fontSize:11, fontWeight:700, color:catG.color, minWidth:28, textAlign:"right" }}>{bc.avg!==null?`${bc.avg}%`:"—"}</div>
                            </div>
                          );
                        })}
                        <div style={{ marginTop:12 }}>
                          <div style={{ fontSize:11, fontWeight:600, color:"#94a3b8", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Trend</div>
                          <TrendBar audits={cs.audits} />
                        </div>
                      </>
                    )}
                    {cs.count===0 && <div style={{ fontSize:12, color:"#94a3b8", textAlign:"center", padding:"16px 0" }}>No audits yet</div>}
                  </div>
                );
              })}
            </div>

            {/* Clinic comparison bar */}
            <div style={{ ...cardStyle }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#1e293b", marginBottom:14 }}>Clinic Comparison</div>
              {clinicStats.map(cs=>{
                const {color} = cs.avg!==null ? getLetterGrade(cs.avg) : {grade:"—",color:"#e5e7eb"};
                return (
                  <div key={cs.clinic} style={{ marginBottom:12 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontSize:12, fontWeight:600, color:CLINIC_COLORS[cs.clinic]||"#64748b" }}>{cs.clinic}</span>
                      <span style={{ fontSize:12, fontWeight:700, color }}>{cs.avg!==null?`${cs.avg}%`:"No data"}</span>
                    </div>
                    <div style={{ height:8, background:"#f1f5f9", borderRadius:4, overflow:"hidden" }}>
                      <div style={{ width:`${cs.avg||0}%`, height:"100%", background:CLINIC_COLORS[cs.clinic]||"#94a3b8", borderRadius:4, transition:"width .4s" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ DASHBOARD ═══ */}
        {view==="dashboard" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {/* Summary cards */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
              {[
                { label:"Total Audits", value: audits.length },
                { label:"Avg Score", value: audits.length>0 ? `${Math.round(audits.reduce((s,a)=>s+(a.totalPct||0),0)/audits.length)}%` : "—" },
                { label:"Clinics Active", value: CLINICS.filter(cl=>audits.some(a=>a.clinic===cl)).length },
                { label:"Staff Audited", value: [...new Set(audits.map(a=>a.staffName))].length },
              ].map(m=>(
                <div key={m.label} style={{ background:"#fff", borderRadius:10, border:"1px solid #e5e7eb", padding:"14px 16px" }}>
                  <div style={{ fontSize:11, color:"#94a3b8", fontWeight:600, textTransform:"uppercase", letterSpacing:1 }}>{m.label}</div>
                  <div style={{ fontSize:22, fontWeight:800, color:"#0f766e", fontFamily:"'Fraunces',serif", marginTop:4 }}>{m.value}</div>
                </div>
              ))}
            </div>

            {/* Clinic filter */}
            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
              <span style={{ fontSize:12, color:"#94a3b8", fontWeight:600 }}>Filter:</span>
              {["All",...CLINICS].map(cl=>(
                <button key={cl} style={pillBtn(dashClinic===cl, CLINIC_COLORS[cl]||"#0f766e")}
                  onClick={()=>setDashClinic(cl)}>{cl}</button>
              ))}
            </div>

            {/* Per-clinic progress */}
            <div style={{ ...cardStyle }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#1e293b", marginBottom:14 }}>Progress by Clinic</div>
              {clinicStats.filter(cs=>dashClinic==="All"||cs.clinic===dashClinic).map(cs=>{
                const {grade,color} = cs.avg!==null ? getLetterGrade(cs.avg) : {grade:"—",color:"#9ca3af"};
                return (
                  <div key={cs.clinic} style={{ display:"flex", alignItems:"center", gap:14, padding:"10px 0", borderBottom:"1px solid #f1f5f9" }}>
                    <div style={{ width:10, height:10, borderRadius:"50%", background:CLINIC_COLORS[cs.clinic], flexShrink:0 }} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600 }}>{cs.clinic}</div>
                      <div style={{ fontSize:11, color:"#94a3b8" }}>{cs.count} audit{cs.count!==1?"s":""}</div>
                    </div>
                    <TrendBar audits={cs.audits} />
                    <div style={{ minWidth:50, textAlign:"right" }}>
                      <div style={{ fontSize:16, fontWeight:800, color, fontFamily:"'Fraunces',serif" }}>{grade}</div>
                      <div style={{ fontSize:11, color }}>{cs.avg!==null?`${cs.avg}%`:"—"}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Per-agent progress */}
            <div style={{ ...cardStyle }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#1e293b", marginBottom:14 }}>Progress by Agent</div>
              {staffSummary.length===0 && <div style={{ textAlign:"center", padding:30, color:"#94a3b8", fontSize:13 }}>No audits yet.</div>}
              {staffSummary.map(s=>{
                const {grade,color} = s.avg!==null ? getLetterGrade(s.avg) : {grade:"—",color:"#9ca3af"};
                const clColor = CLINIC_COLORS[s.clinic]||"#64748b";
                return (
                  <div key={s.name} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:"1px solid #f1f5f9" }}>
                    <div style={{ width:34, height:34, borderRadius:"50%", background:"#f0fdfa", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:12, color:"#0f766e", flexShrink:0 }}>
                      {s.name.split(" ").map(n=>n[0]).join("")}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ fontSize:13, fontWeight:600 }}>{s.name}</span>
                        {s.clinic && <span style={{ fontSize:10, fontWeight:600, padding:"1px 6px", borderRadius:8, background:CLINIC_BGS[s.clinic]||"#f1f5f9", color:clColor }}>{s.clinic}</span>}
                      </div>
                      <div style={{ fontSize:11, color:"#94a3b8" }}>{s.count} audit{s.count!==1?"s":""}</div>
                    </div>
                    <TrendBar audits={s.audits} />
                    <div style={{ minWidth:50, textAlign:"right" }}>
                      <div style={{ fontSize:15, fontWeight:800, color, fontFamily:"'Fraunces',serif" }}>{grade}</div>
                      <div style={{ fontSize:11, color }}>{s.avg!==null?`${s.avg}%`:"—"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ STAFF ═══ */}
        {view==="staff" && (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <div style={{ fontSize:12, color:"#94a3b8", fontWeight:600, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Staff Performance Overview</div>
            {STAFF_MEMBERS.map(name=>{
              const mine = audits.filter(a=>a.staffName===name);
              const avg = mine.length>0 ? Math.round(mine.reduce((s,a)=>s+(a.totalPct||0),0)/mine.length) : null;
              const {grade,color} = avg!==null ? getLetterGrade(avg) : {grade:"—",color:"#9ca3af"};
              const cl = mine.length>0 ? mine[mine.length-1].clinic : "";
              return (
                <div key={name} style={{ ...cardStyle, display:"flex", alignItems:"center", gap:14 }}>
                  <div style={{ width:38, height:38, borderRadius:"50%", background:"#f0fdfa", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:13, color:"#0f766e", flexShrink:0 }}>
                    {name.split(" ").map(n=>n[0]).join("")}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontSize:14, fontWeight:600 }}>{name}</span>
                      {cl && <span style={{ fontSize:10, fontWeight:600, padding:"1px 6px", borderRadius:8, background:CLINIC_BGS[cl]||"#f1f5f9", color:CLINIC_COLORS[cl]||"#64748b" }}>{cl}</span>}
                    </div>
                    <div style={{ fontSize:11, color:"#94a3b8" }}>{mine.length} audit{mine.length!==1?"s":""}</div>
                  </div>
                  {avg!==null && <MiniBar value={avg} max={100} color={color} />}
                  <span style={{ fontSize:14, fontWeight:700, color, fontFamily:"'Fraunces',serif", minWidth:60, textAlign:"right" }}>
                    {avg!==null?`${grade} ${avg}%`:"—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
