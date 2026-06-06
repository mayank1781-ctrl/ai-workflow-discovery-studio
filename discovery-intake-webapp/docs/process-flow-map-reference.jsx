import { useState } from "react";

// ═══ DESIGN TOKENS (match cockpit.css / future.css) ═══════════════════════════
const T = {
  bg:     "#060c18",
  card:   "#0b1627",
  card2:  "#0f1d34",
  border: "#182942",
  teal:   "#00d4b4",
  pink:   "#ff4fc8",
  amber:  "#f59e0b",
  red:    "#ef4444",
  text:   "#dde8f5",
  muted:  "#7a93b4",
  dim:    "#3d5470",
};

const GRAD = `linear-gradient(90deg,${T.teal},${T.pink})`;

// ═══ AI PATTERN TAXONOMY (extracted from Excel workbook) ═══════════════════
const PAT = {
  "Retrieve":  { color: "#06b6d4", abbr: "RTV", desc: "Information retrieval from sources"      },
  "Extract":   { color: "#00d4b4", abbr: "EXT", desc: "Extract & structure from unstructured"   },
  "Generate":  { color: "#f97316", abbr: "GEN", desc: "Draft, create, write from context"       },
  "Summarise": { color: "#ec4899", abbr: "SUM", desc: "Condense & synthesise content"           },
  "Search":    { color: "#10b981", abbr: "SRC", desc: "Cross-source search & retrieval"         },
  "Match":     { color: "#3b82f6", abbr: "MTH", desc: "Automated matching & anomaly detection"  },
  "Route":     { color: "#8b5cf6", abbr: "RTE", desc: "Smart routing & escalation triggers"     },
  "Optimise":  { color: "#f59e0b", abbr: "OPT", desc: "Predictive & optimisation modelling"     },
};

const OPP_COLOR  = { "Quick Win": T.teal, "High Impact": T.pink, "Strategic": T.amber, "Monitor": T.muted };
const SENS_COLOR = { Critical: T.red, High: T.amber, Medium: T.teal, Low: T.dim };

// ═══ WORKFLOWS ══════════════════════════════════════════════════════════════
const WORKFLOWS = {
  workshop: {
    name: "Workshop Facilitation",
    source: "Excel Workbook B — AI Infusion Intake · Workshop Use Case",
    steps: [
      {
        id:"w1",n:1,
        label:"Receive & Frame Workshop Request",
        persona:"Client Executive / Sponsor · Capco MP/PC",
        pattern:"Retrieve",pattern2:"Extract",
        sensitivity:"Low",coverage:78,hasPain:true,hasOpp:true,oppTag:"Quick Win",
        cells:{
          personaActors:    {v:"Client executive / sponsor; Capco MP/PC or workshop lead; broader Capco strategy team",s:"confirmed"},
          systemsTools:     {v:"Email, meeting discussions; Capco internal planning docs; CRM/repo not specified",s:"inferred"},
          output:           {v:"Initial workshop problem statement, expected outcomes, rough scope, audience view",s:"confirmed"},
          trigger:          {v:"Client/sponsor raises open-ended workshop need (strategic or leadership-oriented)",s:"confirmed"},
          painFriction:     {v:"Ambiguous scope, no structured brief template, misaligned stakeholder expectations",s:"confirmed"},
          aiPattern:        {v:"Retrieve / Extract — surface relevant prior workshops, extract client brief signals",s:"inferred"},
          humanCheckpoint:  {v:"Capco lead frames the ask and confirms scope before any delivery work",s:"confirmed"},
          timeTaken:        {v:"Part of overall 2–4 week pre-work period",s:"inferred"},
          frequencyVolume:  {v:"Varies — project-driven",s:"inferred"},
          dataSensitivity:  {v:"Low — strategic context only",s:"confirmed"},
          rulesDecisionLogic:{v:"Workshop standalone or part of programme? Paid vs unpaid? These determine team size",s:"inferred"},
        }
      },
      {
        id:"w2",n:2,
        label:"Build Initial Agenda Hypothesis",
        persona:"Capco Workshop Lead · Facilitation Expert · SC/M/CM",
        pattern:"Generate",pattern2:"Summarise",
        sensitivity:"Low",coverage:72,hasPain:true,hasOpp:true,oppTag:"Quick Win",
        cells:{
          personaActors:    {v:"Capco workshop lead; MP/PC; SC/M/CM; facilitation expert (e.g. Emily); optional SMEs",s:"confirmed"},
          systemsTools:     {v:"Agenda doc; prior workshop materials; facilitation playbooks/templates; SharePoint repos",s:"confirmed"},
          output:           {v:"Draft agenda with timeboxes, facilitation techniques, candidate exercises",s:"confirmed"},
          trigger:          {v:"Enough understanding of request to propose how workshop should run",s:"confirmed"},
          painFriction:     {v:"Manual search through old playbooks; inconsistent quality; re-inventing exercises",s:"confirmed"},
          aiPattern:        {v:"Generate / Summarise — draft agenda structures from brief + past playbooks",s:"inferred"},
          humanCheckpoint:  {v:"Capco lead reviews draft before socialising with client",s:"confirmed"},
          timeTaken:        {v:"Unclear as standalone; included within 2–4 week pre-work period",s:"inferred"},
          frequencyVolume:  {v:"Once per workshop engagement",s:"inferred"},
          dataSensitivity:  {v:"Low — internal planning materials",s:"confirmed"},
          rulesDecisionLogic:{v:"",s:"empty"},
        }
      },
      {
        id:"w3",n:3,
        label:"Collect Client/Stakeholder Input",
        persona:"Capco Consultant · Client Stakeholders · Participants",
        pattern:"Extract",pattern2:"Summarise",
        sensitivity:"Medium",coverage:65,hasPain:true,hasOpp:true,oppTag:"High Impact",
        cells:{
          personaActors:    {v:"Capco interviewer(s); client leadership team; workshop participants; client sponsor",s:"confirmed"},
          systemsTools:     {v:"Video/in-person meetings; interview notes; transcripts if available; client-provided docs",s:"inferred"},
          output:           {v:"Synthesised stakeholder themes, pain points, perspectives informing agenda",s:"confirmed"},
          trigger:          {v:"Initial agenda drafted and shared; stakeholder list confirmed",s:"inferred"},
          painFriction:     {v:"Manual synthesis across many interviews; no consistent template; themes missed",s:"confirmed"},
          aiPattern:        {v:"Extract / Summarise — pull themes from transcripts, rank pain points by frequency",s:"inferred"},
          humanCheckpoint:  {v:"Capco consultant reviews synthesised themes before feeding into agenda update",s:"inferred"},
          timeTaken:        {v:"Unclear; depends on number of stakeholders. Client interviews can be 1hr each",s:"inferred"},
          frequencyVolume:  {v:"",s:"empty"},
          dataSensitivity:  {v:"Medium — stakeholder opinions, interview content",s:"confirmed"},
          rulesDecisionLogic:{v:"",s:"empty"},
        }
      },
      {
        id:"w4",n:4,
        label:"Research Markets, Competitors & Topics",
        persona:"Capco Strategy Team · Research Lead",
        pattern:"Search",pattern2:"Retrieve",
        sensitivity:"Low",coverage:58,hasPain:true,hasOpp:true,oppTag:"Quick Win",
        cells:{
          personaActors:    {v:"Capco strategy team; workshop lead; SMEs; facilitation expert or repository owner",s:"inferred"},
          systemsTools:     {v:"SharePoint / Capco repos; prior workshop folders; internal collateral; product sources",s:"inferred"},
          output:           {v:"Research findings, reusable workshop components, competitive insights",s:"confirmed"},
          trigger:          {v:"Stakeholder input complete; workshop objectives and hypothesis clear",s:"inferred"},
          painFriction:     {v:"Manual research across many sources; duplication across teams; no single source of truth",s:"confirmed"},
          aiPattern:        {v:"Search / Retrieve — semantic search across Capco knowledge base + external sources",s:"inferred"},
          humanCheckpoint:  {v:"",s:"empty"},
          timeTaken:        {v:"Part of pre-work period; varies widely by topic complexity",s:"inferred"},
          frequencyVolume:  {v:"Once per engagement; may revisit per workshop module",s:"inferred"},
          dataSensitivity:  {v:"Low — market/industry content",s:"confirmed"},
          rulesDecisionLogic:{v:"",s:"empty"},
        }
      },
      {
        id:"w5",n:5,
        label:"Iterate Agenda & Materials with Client",
        persona:"Capco Workshop Lead · Client Buyer / Main Stakeholder",
        pattern:"Summarise",pattern2:"Generate",
        sensitivity:"Medium",coverage:61,hasPain:true,hasOpp:false,oppTag:"Monitor",
        cells:{
          personaActors:    {v:"Capco workshop lead / team; client buyer or main stakeholder; client sponsor",s:"confirmed"},
          systemsTools:     {v:"Agenda doc; slide deck; materials; content; Capco working docs — exact system unclear",s:"inferred"},
          output:           {v:"Client-aligned agenda and adjusted approved draft pack or content approach",s:"confirmed"},
          trigger:          {v:"First draft materials ready and shared with client",s:"inferred"},
          painFriction:     {v:"Multiple revision rounds; client feedback loops; slow turnaround; change fatigue",s:"confirmed"},
          aiPattern:        {v:"Summarise / Generate — track changes across versions, auto-incorporate feedback",s:"inferred"},
          humanCheckpoint:  {v:"Sponsor / buyer provides feedback; Capco team incorporates changes",s:"confirmed"},
          timeTaken:        {v:"Likely repeated back-and-forth within pre-work; part of 2–4 week pre-workshop period",s:"inferred"},
          frequencyVolume:  {v:"",s:"empty"},
          dataSensitivity:  {v:"Medium — client-specific content, agenda assumptions",s:"inferred"},
          rulesDecisionLogic:{v:"",s:"empty"},
        }
      },
      {
        id:"w6",n:6,
        label:"Build Workshop Packet Content",
        persona:"Capco Workshop Team · Facilitation Expert · SMEs",
        pattern:"Generate",pattern2:null,
        sensitivity:"Low",coverage:44,hasPain:true,hasOpp:true,oppTag:"High Impact",
        cells:{
          personaActors:    {v:"Capco workshop team; facilitation expert; SMEs; client facilitators where they provide content",s:"inferred"},
          systemsTools:     {v:"PowerPoint; sticky note tools; Miro/Mural; similar boards; phone-voting / QR tool templates; SharePoint",s:"inferred"},
          output:           {v:"Workshop packet — slides, interactive templates, facilitator guide, logistics brief",s:"confirmed"},
          trigger:          {v:"Agenda approved and signed off by client sponsor",s:"inferred"},
          painFriction:     {v:"Manual content creation; inconsistent branding; re-building exercises from scratch each time",s:"confirmed"},
          aiPattern:        {v:"Generate — create slide decks, facilitator notes, exercise templates from approved agenda",s:"inferred"},
          humanCheckpoint:  {v:"",s:"empty"},
          timeTaken:        {v:"Often major part of 2–4 week pre-work. Facilitator pre-read material creation to-do list",s:"inferred"},
          frequencyVolume:  {v:"Once per engagement; scaled by workshop size and module count",s:"inferred"},
          dataSensitivity:  {v:"Low — facilitation content",s:"inferred"},
          rulesDecisionLogic:{v:"",s:"empty"},
        }
      },
    ]
  },
  invoice: {
    name: "Invoice Approval",
    source: "Discovery interview · Finance Ops",
    steps: [
      {
        id:"i1",n:1,label:"Receive & Log Invoice",persona:"AP Clerk",
        pattern:"Extract",pattern2:"Classify",sensitivity:"High",coverage:82,
        hasPain:true,hasOpp:true,oppTag:"Quick Win",
        cells:{
          personaActors:    {v:"AP Clerk",s:"confirmed"},
          systemsTools:     {v:"Email, SAP S/4HANA",s:"confirmed"},
          output:           {v:"Logged invoice entry",s:"inferred"},
          trigger:          {v:"Vendor email received",s:"confirmed"},
          painFriction:     {v:"Duplicate emails, unclear routing rules",s:"confirmed"},
          aiPattern:        {v:"Document extraction + classification",s:"inferred"},
          humanCheckpoint:  {v:"Manual duplicate check",s:"confirmed"},
          timeTaken:        {v:"15–30 mins",s:"inferred"},
          frequencyVolume:  {v:"~200 invoices / week",s:"confirmed"},
          dataSensitivity:  {v:"High — vendor PII + financials",s:"confirmed"},
          rulesDecisionLogic:{v:"Amount > £10k → escalate to Manager",s:"inferred"},
        }
      },
      {
        id:"i2",n:2,label:"3-Way Match Validation",persona:"AP Senior Analyst",
        pattern:"Match",pattern2:null,sensitivity:"High",coverage:91,
        hasPain:true,hasOpp:true,oppTag:"High Impact",
        cells:{
          personaActors:    {v:"AP Senior Analyst",s:"confirmed"},
          systemsTools:     {v:"SAP S/4HANA, Excel tracker",s:"confirmed"},
          output:           {v:"Match report / exception list",s:"confirmed"},
          trigger:          {v:"Invoice logged in SAP",s:"inferred"},
          painFriction:     {v:"Manual PO / GR cross-referencing",s:"confirmed"},
          aiPattern:        {v:"Auto-matching + anomaly detection",s:"confirmed"},
          humanCheckpoint:  {v:"Exception review by AP Senior",s:"confirmed"},
          timeTaken:        {v:"45–90 mins",s:"inferred"},
          frequencyVolume:  {v:"~180 / week",s:"inferred"},
          dataSensitivity:  {v:"High — financial records",s:"confirmed"},
          rulesDecisionLogic:{v:"Tolerance ±2% of PO value",s:"confirmed"},
        }
      },
      {
        id:"i3",n:3,label:"Approval Routing",persona:"Finance Manager / CFO",
        pattern:"Route",pattern2:null,sensitivity:"Medium",coverage:73,
        hasPain:true,hasOpp:true,oppTag:"Quick Win",
        cells:{
          personaActors:    {v:"Finance Manager, CFO",s:"confirmed"},
          systemsTools:     {v:"Microsoft Teams, SAP workflow",s:"inferred"},
          output:           {v:"Approved / rejected invoice",s:"confirmed"},
          trigger:          {v:"Match complete, exceptions resolved",s:"inferred"},
          painFriction:     {v:"Approvers unresponsive, no SLA tracking",s:"confirmed"},
          aiPattern:        {v:"Smart routing + escalation triggers",s:"inferred"},
          humanCheckpoint:  {v:"Manual approval decision",s:"confirmed"},
          timeTaken:        {v:"1–3 business days",s:"confirmed"},
          frequencyVolume:  {v:"~180 / week",s:"inferred"},
          dataSensitivity:  {v:"Medium — approval metadata",s:"inferred"},
          rulesDecisionLogic:{v:"£0–5k: Mgr · £5–50k: Dir · £50k+: CFO",s:"confirmed"},
        }
      },
      {
        id:"i4",n:4,label:"Payment Scheduling",persona:"Treasury Team",
        pattern:"Optimise",pattern2:null,sensitivity:"Critical",coverage:45,
        hasPain:false,hasOpp:true,oppTag:"Strategic",
        cells:{
          personaActors:    {v:"Treasury Team",s:"inferred"},
          systemsTools:     {v:"SAP TRM, Bank portal",s:"inferred"},
          output:           {v:"Payment batch file",s:"inferred"},
          trigger:          {v:"Invoice approved",s:"confirmed"},
          painFriction:     {v:"",s:"empty"},
          aiPattern:        {v:"Cash flow optimisation model",s:"inferred"},
          humanCheckpoint:  {v:"Treasury sign-off",s:"inferred"},
          timeTaken:        {v:"",s:"empty"},
          frequencyVolume:  {v:"Weekly batch run",s:"inferred"},
          dataSensitivity:  {v:"Critical — banking details",s:"inferred"},
          rulesDecisionLogic:{v:"",s:"empty"},
        }
      },
    ]
  }
};

const FIELD_LABELS = {
  personaActors:"Persona / Actors", systemsTools:"Systems / Tools",
  output:"Output", trigger:"Trigger", painFriction:"Pain / Friction",
  aiPattern:"AI Pattern", humanCheckpoint:"Human Checkpoint",
  timeTaken:"Time Taken", frequencyVolume:"Freq / Volume",
  dataSensitivity:"Data Sensitivity", rulesDecisionLogic:"Rules / Logic",
};

// ═══ HELPERS ══════════════════════════════════════════════════════════════════
function meta(step) {
  const cells     = Object.values(step.cells);
  const confirmed = cells.filter(c => c.s === "confirmed").length;
  const inferred  = cells.filter(c => c.s === "inferred").length;
  const empty     = cells.filter(c => c.s === "empty").length;
  const total     = cells.length;
  const coverage  = Math.round(((confirmed + inferred) / total) * 100);
  const filled    = cells.filter(c => c.s !== "empty");
  const confidence = filled.length
    ? Math.round(filled.reduce((s,c) => s + (c.s === "confirmed" ? 90 : 70), 0) / filled.length)
    : 0;
  return { confirmed, inferred, empty, total, coverage, confidence };
}

// ═══ RING ══════════════════════════════════════════════════════════════════
function Ring({ pct, color, size = 46 }) {
  const r    = size / 2 - 5;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div style={{ position:"relative", width:size, height:size, flexShrink:0 }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color+"25"} strokeWidth={4.5} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={4.5}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition:"stroke-dasharray 1.1s cubic-bezier(.23,1,.32,1)" }} />
      </svg>
      <div style={{
        position:"absolute",top:0,left:0,right:0,bottom:0,
        display:"flex",alignItems:"center",justifyContent:"center",
        fontSize:10,fontWeight:800,color,letterSpacing:"-0.02em",
      }}>
        {pct}
      </div>
    </div>
  );
}

// ═══ ARROW ════════════════════════════════════════════════════════════════════
function Arrow({ fc, tc, idx }) {
  const id = `arr${idx}`;
  return (
    <div style={{ display:"flex", alignItems:"center", flexShrink:0, zIndex:1 }}>
      <svg width={56} height={52} viewBox="0 0 56 52">
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor={fc} stopOpacity="0.55" />
            <stop offset="100%" stopColor={tc} stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <line x1="4" y1="26" x2="47" y2="26" stroke={`url(#${id})`} strokeWidth="2" strokeDasharray="4,3.5" />
        <path d="M43,20 L52,26 L43,32" fill="none" stroke={tc+"aa"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ═══ STEP CARD (FULL) ═════════════════════════════════════════════════════════
function StepCard({ step, isSelected, onClick, viewMode }) {
  const [hov, setHov] = useState(false);
  const pat   = PAT[step.pattern] || PAT.Extract;
  const m     = meta(step);
  const ringC = m.coverage > 78 ? T.teal : m.coverage > 50 ? T.amber : T.red;

  const cardBg =
    viewMode === "sensitivity" ? (SENS_COLOR[step.sensitivity] || T.dim) + "0f" :
    viewMode === "opportunities" && step.hasOpp ? pat.color + "0e" :
    T.card;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: cardBg,
        border: `1.5px solid ${isSelected ? pat.color : hov ? pat.color + "60" : T.border}`,
        borderRadius: 12,
        padding: "14px 14px 12px",
        cursor: "pointer",
        transition: "all 0.22s",
        filter: hov || isSelected ? "brightness(1.1)" : "brightness(1)",
        boxShadow: `inset 4px 0 0 ${pat.color}${isSelected ? "ff" : "99"}`,
        minWidth: 175,
        maxWidth: 210,
        flex: 1,
        position: "relative",
      }}
    >
      {/* Pattern + Ring */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
        <div>
          <span style={{ background:pat.color+"22", color:pat.color, padding:"2px 8px", borderRadius:99, fontSize:9, fontWeight:700, letterSpacing:"0.07em", display:"block", marginBottom: step.pattern2 ? 4 : 0 }}>
            {step.pattern.toUpperCase()}
          </span>
          {step.pattern2 && (
            <span style={{ background:(PAT[step.pattern2]?.color||T.dim)+"22", color:PAT[step.pattern2]?.color||T.dim, padding:"2px 8px", borderRadius:99, fontSize:9, fontWeight:700, letterSpacing:"0.07em", display:"block" }}>
              + {step.pattern2.toUpperCase()}
            </span>
          )}
        </div>
        <Ring pct={m.coverage} color={ringC} size={44} />
      </div>

      {/* Step number — gradient text */}
      <div style={{
        fontSize:9.5, fontWeight:800, letterSpacing:"0.11em", marginBottom:4,
        background:`linear-gradient(90deg,${pat.color},${T.pink})`,
        WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text",
      }}>
        STEP {String(step.n).padStart(2,"0")}
      </div>

      {/* Name */}
      <div style={{ fontSize:12.5, fontWeight:700, lineHeight:1.3, marginBottom:6, color:T.text }}>
        {step.label}
      </div>

      {/* Persona */}
      <div style={{ fontSize:10, color:T.muted, marginBottom:10, lineHeight:1.3 }}>
        👤 {step.persona}
      </div>

      {/* Tricolor coverage bar */}
      <div style={{ display:"flex", height:4, borderRadius:99, overflow:"hidden", marginBottom:5, gap:"1px" }}>
        <div style={{ background:T.teal,  width:`${(m.confirmed/m.total)*100}%`, minWidth:m.confirmed?2:0,  transition:"width 0.9s ease" }} />
        <div style={{ background:T.amber, width:`${(m.inferred/m.total)*100}%`,  minWidth:m.inferred?2:0,   transition:"width 0.9s ease" }} />
        <div style={{ background:T.dim,   flex:1 }} />
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, marginBottom:10 }}>
        <span style={{ color:T.teal  }}>✓{m.confirmed}</span>
        <span style={{ color:T.amber }}>~{m.inferred}</span>
        <span style={{ color:T.dim   }}>✗{m.empty}</span>
      </div>

      {/* Indicator pills */}
      <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
        {step.hasPain
          ? <Tag bg={T.red+"1a"}   color={T.red}                         label="⚡ Pain"       />
          : <Tag bg={T.amber+"1a"} color={T.amber}                       label="? Pain TBD"   />
        }
        {step.hasOpp && (
          <Tag bg={(OPP_COLOR[step.oppTag]||T.teal)+"1a"} color={OPP_COLOR[step.oppTag]||T.teal} label={`✦ ${step.oppTag}`} />
        )}
        {viewMode === "sensitivity" && (
          <Tag bg={(SENS_COLOR[step.sensitivity]||T.dim)+"1a"} color={SENS_COLOR[step.sensitivity]||T.dim} label={step.sensitivity} />
        )}
      </div>
    </div>
  );
}

// ═══ COMPACT CARD ════════════════════════════════════════════════════════════
function CompactCard({ step, isSelected, onClick }) {
  const [hov, setHov] = useState(false);
  const pat = PAT[step.pattern] || PAT.Extract;
  const m   = meta(step);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: isSelected ? pat.color+"14" : T.card,
        border: `1.5px solid ${isSelected ? pat.color : hov ? pat.color+"50" : T.border}`,
        borderRadius: 9, padding:"10px 13px",
        cursor:"pointer", minWidth:148,
        boxShadow:`inset 3px 0 0 ${pat.color}`,
        transition:"all 0.18s",
      }}
    >
      <div style={{ fontSize:9, color:pat.color, fontWeight:700, letterSpacing:"0.08em", marginBottom:3 }}>
        {String(step.n).padStart(2,"0")} · {step.pattern.toUpperCase()}{step.pattern2?` + ${step.pattern2.toUpperCase()}`:""}
      </div>
      <div style={{ fontSize:12, fontWeight:700, marginBottom:6, color:T.text, lineHeight:1.3 }}>{step.label}</div>
      <div style={{ display:"flex", height:4, borderRadius:99, overflow:"hidden", gap:"1px" }}>
        <div style={{ background:T.teal,  width:`${(m.confirmed/m.total)*100}%`, transition:"width 0.9s ease" }} />
        <div style={{ background:T.amber, width:`${(m.inferred/m.total)*100}%`,  transition:"width 0.9s ease" }} />
        <div style={{ background:T.dim,   flex:1 }} />
      </div>
      <div style={{ display:"flex", gap:8, fontSize:9, marginTop:4 }}>
        <span style={{ color:T.teal  }}>✓{m.confirmed}</span>
        <span style={{ color:T.amber }}>~{m.inferred}</span>
        <span style={{ color:T.dim   }}>✗{m.empty}</span>
      </div>
    </div>
  );
}

// ═══ DETAIL PANEL ════════════════════════════════════════════════════════════
function DetailPanel({ step, onClose }) {
  const pat = PAT[step.pattern] || PAT.Extract;
  const m   = meta(step);
  const sc  = { confirmed:T.teal, inferred:T.amber, empty:T.dim };
  return (
    <div style={{
      background:T.card2, border:`1px solid ${pat.color}44`, borderRadius:12,
      padding:20, marginTop:16,
      boxShadow:`0 0 50px ${pat.color}0d`,
      animation:"fadeIn 0.2s ease",
    }}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom:5 }}>
            <span style={{ background:pat.color+"22", color:pat.color, padding:"3px 12px", borderRadius:99, fontSize:10.5, fontWeight:700 }}>
              Step {step.n} — {step.label}
            </span>
            {step.pattern2 && (
              <span style={{ background:(PAT[step.pattern2]?.color||T.dim)+"22", color:PAT[step.pattern2]?.color||T.dim, padding:"3px 12px", borderRadius:99, fontSize:10, fontWeight:700 }}>
                + {step.pattern2}
              </span>
            )}
          </div>
          <div style={{ fontSize:11, color:T.muted }}>
            <span style={{ color:T.teal  }}>✓ {m.confirmed} confirmed</span>
            &nbsp;·&nbsp;
            <span style={{ color:T.amber }}>~ {m.inferred} inferred</span>
            &nbsp;·&nbsp;
            <span style={{ color:T.dim   }}>✗ {m.empty} empty</span>
            &nbsp;·&nbsp;{m.confidence}% confidence
          </div>
        </div>
        <button onClick={onClose} style={{
          background:"transparent", border:`1px solid ${T.border}`,
          color:T.muted, borderRadius:6, padding:"4px 11px",
          fontSize:11, cursor:"pointer",
        }}>✕</button>
      </div>

      {/* Cell grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"12px 20px" }}>
        {Object.entries(step.cells).map(([key, cell]) => (
          <div key={key}>
            <div style={{ fontSize:9, textTransform:"uppercase", letterSpacing:"0.09em", color:T.dim, marginBottom:2 }}>
              {FIELD_LABELS[key] || key}
            </div>
            <div style={{ fontSize:11.5, color:cell.s==="empty"?T.dim:T.text, lineHeight:1.45 }}>
              {cell.v || "—"}
            </div>
            <span style={{ background:sc[cell.s]+"1a", color:sc[cell.s], padding:"1px 6px", borderRadius:99, fontSize:9, fontWeight:600 }}>
              {cell.s}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══ SHARED TAG ATOM ═════════════════════════════════════════════════════════
function Tag({ bg, color, label }) {
  return (
    <span style={{ background:bg, color, padding:"2px 7px", borderRadius:99, fontSize:9, fontWeight:700 }}>
      {label}
    </span>
  );
}

// ═══ ROOT COMPONENT ══════════════════════════════════════════════════════════
export default function ProcessFlowMap() {
  const [wfKey,    setWfKey   ] = useState("workshop");
  const [sel,      setSel     ] = useState(null);
  const [viewMode, setViewMode] = useState("coverage");
  const [compact,  setCompact ] = useState(false);
  const [steps,    setSteps   ] = useState(null); // null = use original

  const wf       = WORKFLOWS[wfKey];
  const liveSteps = steps || wf.steps;
  const selStep  = liveSteps.find(s => s.id === sel);

  // Stats
  const allCells   = liveSteps.flatMap(s => Object.values(s.cells));
  const totalConf  = allCells.filter(c => c.s === "confirmed").length;
  const totalInf   = allCells.filter(c => c.s === "inferred").length;
  const totalEmp   = allCells.filter(c => c.s === "empty").length;
  const totalN     = allCells.length;
  const overallCov = Math.round(((totalConf + totalInf) / totalN) * 100);

  // Simulate live capture filling empty cells
  const [simRunning, setSimRunning] = useState(false);
  function simulate() {
    if (simRunning) return;
    setSimRunning(true);
    const empties = liveSteps.flatMap(s =>
      Object.entries(s.cells)
        .filter(([,c]) => c.s === "empty")
        .map(([k]) => ({ sid:s.id, key:k }))
    );
    empties.forEach(({ sid, key }, i) => {
      setTimeout(() => {
        setSteps(prev => (prev || wf.steps).map(s =>
          s.id !== sid ? s : {
            ...s,
            cells: { ...s.cells, [key]: { v:"(captured from interview)", s:"inferred" } }
          }
        ));
        if (i === empties.length - 1) setSimRunning(false);
      }, (i + 1) * 480);
    });
  }

  function resetSim() {
    setSteps(null);
    setSel(null);
  }

  function switchWorkflow(key) {
    setWfKey(key);
    setSteps(null);
    setSel(null);
  }

  const MODES = [
    { id:"coverage",      label:"Coverage"        },
    { id:"opportunities", label:"AI Opportunities" },
    { id:"sensitivity",   label:"Sensitivity"      },
  ];

  return (
    <div style={{
      background:T.bg, minHeight:"100vh", color:T.text,
      fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif",
      fontSize:14, lineHeight:1.5,
      padding: compact ? "14px 18px" : "22px 26px",
    }}>

      {/* ── Top bar ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:9.5, textTransform:"uppercase", letterSpacing:"0.15em", color:T.muted, marginBottom:4 }}>
            {compact ? "Discovery · Live Progress" : "Process Flow Map"}
          </div>
          <div style={{ fontSize: compact?15:19, fontWeight:800, letterSpacing:"-0.01em" }}>
            {wf.name}
          </div>
          <div style={{ fontSize:10.5, color:T.muted, marginTop:3 }}>
            {wf.source}
            &nbsp;·&nbsp;
            <span style={{ color:T.teal  }}>{totalConf} confirmed</span>
            &nbsp;·&nbsp;
            <span style={{ color:T.amber }}>{totalInf} inferred</span>
            &nbsp;·&nbsp;
            <span style={{ color:T.dim   }}>{totalEmp} empty</span>
          </div>
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          {/* Workflow switcher */}
          <div style={{ display:"flex", background:T.card, border:`1px solid ${T.border}`, borderRadius:8, padding:3, gap:2 }}>
            {Object.entries(WORKFLOWS).map(([k,w]) => (
              <button key={k} onClick={() => switchWorkflow(k)} style={{
                background: wfKey===k ? T.teal+"22" : "transparent",
                border:`1px solid ${wfKey===k ? T.teal+"55" : "transparent"}`,
                color: wfKey===k ? T.teal : T.muted,
                borderRadius:5, padding:"4px 11px", fontSize:10.5,
                fontWeight: wfKey===k ? 700 : 400,
                cursor:"pointer", transition:"all 0.15s", whiteSpace:"nowrap",
              }}>
                {w.name}
              </button>
            ))}
          </div>

          {/* View modes (full only) */}
          {!compact && (
            <div style={{ display:"flex", background:T.card, border:`1px solid ${T.border}`, borderRadius:8, padding:3, gap:2 }}>
              {MODES.map(m => (
                <button key={m.id} onClick={() => setViewMode(m.id)} style={{
                  background: viewMode===m.id ? T.teal+"22" : "transparent",
                  border:`1px solid ${viewMode===m.id ? T.teal+"55" : "transparent"}`,
                  color: viewMode===m.id ? T.teal : T.muted,
                  borderRadius:5, padding:"4px 11px", fontSize:10.5,
                  fontWeight: viewMode===m.id ? 700 : 400,
                  cursor:"pointer", transition:"all 0.15s", whiteSpace:"nowrap",
                }}>
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {/* Compact toggle */}
          <button onClick={() => setCompact(!compact)} style={{
            background: compact ? "#8b5cf622" : "transparent",
            border:`1px solid ${compact ? "#8b5cf655" : T.border}`,
            color: compact ? "#8b5cf6" : T.muted,
            borderRadius:7, padding:"5px 12px", fontSize:10.5,
            cursor:"pointer", transition:"all 0.15s",
          }}>
            {compact ? "⊞ Full map" : "⊟ Compact"}
          </button>

          {/* Simulate */}
          {totalEmp > 0
            ? <button onClick={simulate} disabled={simRunning} style={{
                background:GRAD, border:"none", color:"#000", borderRadius:7,
                padding:"5px 13px", fontSize:10.5, fontWeight:700, cursor:"pointer",
                opacity:simRunning?0.65:1,
              }}>
                {simRunning ? "Capturing…" : "▶ Simulate capture"}
              </button>
            : <button onClick={resetSim} style={{
                background:"transparent", border:`1px solid ${T.border}`, color:T.muted,
                borderRadius:7, padding:"5px 12px", fontSize:10.5, cursor:"pointer",
              }}>
                ↺ Reset
              </button>
          }
        </div>
      </div>

      {/* ── Overall progress bar ── */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom: compact?14:20 }}>
        <div style={{ flex:1, background:T.border, borderRadius:99, height:compact?4:6, overflow:"hidden", display:"flex" }}>
          <div style={{ background:T.teal,  width:`${(totalConf/totalN)*100}%`, height:"100%", transition:"width 0.9s ease" }} />
          <div style={{ background:T.amber, width:`${(totalInf/totalN)*100}%`,  height:"100%", transition:"width 0.9s ease" }} />
          <div style={{ background:T.dim,   flex:1, height:"100%" }} />
        </div>
        <span style={{ fontSize:13, fontWeight:800, color:overallCov>80?T.teal:T.amber, minWidth:38, letterSpacing:"-0.02em" }}>
          {overallCov}%
        </span>
      </div>

      {/* ── AI Pattern legend (full only) ── */}
      {!compact && (
        <div style={{ display:"flex", gap:14, marginBottom:18, flexWrap:"wrap" }}>
          {Object.entries(PAT).map(([k,p]) => (
            <span key={k} style={{ display:"flex", alignItems:"center", gap:5, fontSize:10.5, color:T.muted }}>
              <span style={{ width:9, height:9, borderRadius:2, background:p.color, display:"inline-block", flexShrink:0 }} />
              {k}
            </span>
          ))}
        </div>
      )}

      {/* ── Flow ── */}
      <div style={{ display:"flex", alignItems:compact?"center":"flex-start", gap:0, overflowX:"auto", paddingBottom:10 }}>
        {liveSteps.map((step, i) => {
          const nextPat = liveSteps[i+1] ? (PAT[liveSteps[i+1].pattern]?.color || T.teal) : null;
          return (
            <div key={step.id} style={{ display:"flex", alignItems:"center" }}>
              {compact
                ? <CompactCard step={step} isSelected={sel===step.id} onClick={() => setSel(sel===step.id?null:step.id)} />
                : <StepCard    step={step} isSelected={sel===step.id} onClick={() => setSel(sel===step.id?null:step.id)} viewMode={viewMode} />
              }
              {i < liveSteps.length - 1 && (
                <Arrow fc={PAT[step.pattern]?.color||T.teal} tc={nextPat||T.teal} idx={i} />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Detail panel ── */}
      {selStep && <DetailPanel step={selStep} onClose={() => setSel(null)} />}

      {/* ── AI Pattern reference (opportunities mode) ── */}
      {!compact && viewMode === "opportunities" && (
        <div style={{ marginTop:28 }}>
          <div style={{ fontSize:9.5, textTransform:"uppercase", letterSpacing:"0.14em", color:T.muted, marginBottom:12 }}>
            AI Pattern Reference
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
            {Object.entries(PAT).map(([k,p]) => (
              <div key={k} style={{
                background:T.card, border:`1px solid ${T.border}`, borderRadius:8,
                padding:"10px 12px", boxShadow:`inset 3px 0 0 ${p.color}`,
              }}>
                <div style={{ fontSize:11, fontWeight:700, color:p.color, marginBottom:2 }}>{k}</div>
                <div style={{ fontSize:10.5, color:T.muted }}>{p.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Sensitivity legend ── */}
      {!compact && viewMode === "sensitivity" && (
        <div style={{ marginTop:20, display:"flex", gap:16, flexWrap:"wrap" }}>
          {Object.entries(SENS_COLOR).map(([lvl,col]) => (
            <span key={lvl} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:T.muted }}>
              <span style={{ width:10, height:10, borderRadius:3, background:col, display:"inline-block" }} />
              {lvl}
            </span>
          ))}
        </div>
      )}

    </div>
  );
}
