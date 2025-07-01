/* Wordle Solver — English 10.2-en (2025-07-01)
   – Stats export restored & localStorage persist
   – Compare tab enables when FULL or SHORT ≤ 100
   – “max” header shows the best (minimum) value
   – 6 suggestion tables aligned (CSS)
*/

/* Wordle Solver — English 10.1-en  (2025-07-01)
   – two candidate pools (FULL / SHORT) with 6 suggestion tables
   – colour-coded Compare (≤100) with wildcard rows/cols in red
   – Statistics panel wired via ws:gameEnd
   – CSS tweak → 6 tables on one row
*/

// Wordle Solver — English  v10.0-en  (2025-07-01)
// Cambios principales:
//   • 2 pools de candidatos (FULL / SHORT) y 6 tablas.
//   • 2 tablas de frecuencias.
//   • Selector de pool en “Compare (≤100)”.
//   • Solo se valida contra DICT_FULL al guardar intentos.

// Wordle Solver — English  v9.4-en-rev1  (18-Jul-2025)
/*  Only three safe additions compared with your working v9.4-en:
      1) showTab() handles the new 'stats' panel.
      2) Listener for tabStats.
      3) resetAll() fires a 'ws:gameEnd' event with the final bucket.
   Everything else is byte-for-byte identicl.
*/

/* Wordle Solver — English  v9.4-en  (2025-07-03)
   • Diccionario:
       - Si ya existe DICTIONARY (lo define diccionario_en.js) NO se vuelve
         a declarar.
       - Si no existe, se crea a partir de diccionario_en (compatibilidad).
   • Coherencia de pistas = misma lógica que la versión española
     (solo verde contradictorio y gris→no-gris).
*/



/* ---------- DICTIONARIES ---------- */
const DICT_FULL  =(typeof DICTIONARY_FULL  !=="undefined"?DICTIONARY_FULL :[]).map(w=>w.toUpperCase());
const DICT_SHORT =(typeof DICTIONARY_SHORT !=="undefined"?DICTIONARY_SHORT:[]).map(w=>w.toUpperCase());

/* ---------- CONSTANTS ---------- */
const ALPHABET="ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const COLORS   =["gray","Yellow","GREEN"];
const FAST_LIMIT=2000;
const palette=[
  "#ffcc00","#4da6ff","#66cc66","#ff6666","#c58aff","#ffa64d","#4dd2ff",
  "#99ff99","#ff80b3","#b3b3ff","#ffd24d","#3399ff","#77dd77","#ff4d4d",
  "#c299ff","#ffb84d","#00bfff","#99e699","#ff99c2","#9999ff","#ffe066",
  "#0080ff","#66ffb3","#ff4da6","#8080ff"
];

/* ---------- STATE ---------- */
let history=[], patterns=[];
let candFull=[], candShort=[];
let entFull=new Map(), entShort=new Map();
let verFull=0, verShort=0;
let rapFull=null, rapShort=null;
let filterCache=null;
let compareSelect=false;

/* ---------- DOM helpers ---------- */
const $=id=>document.getElementById(id);
const on=(id,fn)=>$(id).addEventListener("click",fn);
const tbody=id=>$(id).tBodies[0]||$(id).appendChild(document.createElement("tbody"));
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);

/* ==================================================== */
/* =====================  INIT  ======================= */
document.addEventListener("DOMContentLoaded",()=>{
  buildColorSelectors();
  on("saveGuess",saveGuess); on("reset",resetAll);
  on("suggest",generateLists); on("findBtn",runFinder);
  on("runCompare",runCompare); $("comparePool").addEventListener("change",toggleCompareBtn);

  on("tabSolver", ()=>showTab("solver"));
  on("tabFinder", ()=>showTab("finder"));
  on("tabCompare",()=>showTab("compare"));
  on("tabStats",  ()=>showTab("stats"));

  showTab("solver");               /* default */
  toggleCompareBtn();              /* initial state */
});

/* ---------- Tabs ---------- */
function showTab(t){
  ["Solver","Finder","Compare","Stats"].forEach(p=>{
    const on = (p.toLowerCase()===t);
    $(`panel${p}`).hidden=!on;
    $(`tab${p}`).classList.toggle("active",on);
  });
}

/* ==================================================== */
/* ==============  GUESS  &  HISTORY  ================= */
function buildColorSelectors(){
  const box=$("colorSelects"); box.innerHTML="";
  for(let i=0;i<5;i++){
    const s=document.createElement("select");
    ["Gray","Yellow","Green"].forEach((txt,val)=>{
      const o=document.createElement("option"); o.value=val;o.textContent=txt;s.appendChild(o);
    });
    box.appendChild(s);
  }
}
const readColors=()=>[...$("colorSelects").children].map(s=>+s.value);

function saveGuess(){
  const word=$("wordInput").value.toUpperCase().trim();
  if(!/^[A-Z]{5}$/.test(word)){alert("Enter a 5-letter word");return;}

  if(!DICT_FULL.includes(word) &&
     !confirm(`"${word}" is not in the dictionary.\nContinue anyway?`)) return;

  const pat=readColors();

  /* --- consistency check (green / yellow / gray) --- */
  const greenPos=Array(5).fill(null), absent=new Set();
  history.forEach((w,i)=>patterns[i].forEach((c,pos)=>{if(c===2)greenPos[pos]=w[pos];}));
  history.forEach((w,i)=>w.split("").forEach((ch,idx)=>{
    const col=patterns[i][idx];
    if(col!==0) absent.delete(ch);
    else if(!absent.has(ch)&&!greenPos.includes(ch)&&!patterns[i].includes(1)) absent.add(ch);
  }));
  for(let i=0;i<5;i++)
    if(pat[i]===2&&greenPos[i]&&greenPos[i]!==word[i]){
      alert(`Conflict: position ${i+1} already green '${greenPos[i]}'.`);return;}
  for(let i=0;i<5;i++){
    const ch=word[i]; if(absent.has(ch)&&pat[i]!==0){
      alert(`Conflict: letter '${ch}' was gray, now ${COLORS[pat[i]]}.`);return;}
  }

  /* --- store --- */
  history.push(word); patterns.push(pat);
  $("wordInput").value=""; buildColorSelectors(); updateHistory();

  candFull=candShort=[];
  entFull.clear(); entShort.clear();
  rapFull=rapShort=null;
  filterCache=null; verFull++; verShort++;
  compareSelect=false; $("compareArea").innerHTML="";
  toggleCompareBtn();
}

function updateHistory(){
  $("history").textContent=history.map((w,i)=>`${w} → ${patterns[i].map(c=>COLORS[c]).join(", ")}`).join("\n");
}

/* ---------- Reset ---------- */
function getBucket(hist,patArr){
  const idxWin=patArr.findIndex(p=>p.every(c=>c===2));
  if(idxWin===-1) return 7;
  const g=idxWin+1; return (g>=1&&g<=6)?g:7;
}
function resetAll(){
  if(history.length){
    const bucket=getBucket(history,patterns);
    document.dispatchEvent(new CustomEvent("ws:gameEnd",{detail:{history:history.slice(),bucket}}));
  }
  history=[]; patterns=[];
  candFull=candShort=[];
  entFull.clear(); entShort.clear();
  rapFull=rapShort=null;
  filterCache=null; verFull++; verShort++;
  ["history","compareArea"].forEach(id=>$(id).innerHTML="");
  ["tblCandFull","tblDiscFull","tblGreenFull",
   "tblCandShort","tblDiscShort","tblGreenShort",
   "tblFreqFull","tblFreqShort"].forEach(id=>tbody(id).innerHTML="");
  $("cntFull").textContent="0"; $("cntShort").textContent="0";
  buildColorSelectors(); compareSelect=false; toggleCompareBtn();
}

/* ==================================================== */
/* ==============  FILTER & CANDIDATES  =============== */
function buildFilter(hist,patArr){
  const pPos=Array(5).fill("."), G=new Set(),Y=new Set(),X=new Set(),posNo=[];
  const min={},max={}; ALPHABET.forEach(ch=>{min[ch]=0;max[ch]=5;});

  patArr.forEach((p,i)=>{
    const w=hist[i], gC={},yC={},xC={}; ALPHABET.forEach(ch=>gC[ch]=yC[ch]=xC[ch]=0);
    p.forEach((c,pos)=>{
      const ch=w[pos];
      if(c===2){pPos[pos]=ch; G.add(ch); gC[ch]++;}
      else if(c===1){Y.add(ch);posNo.push({ch,pos});yC[ch]++;}
      else xC[ch]++;
    });
    ALPHABET.forEach(ch=>{
      const col=gC[ch]+yC[ch];
      if(col>0) min[ch]=Math.max(min[ch],col);
      if(xC[ch]>0) max[ch]=Math.min(max[ch],col);
    });
  });
  ALPHABET.forEach(ch=>{
    if(min[ch]===0&&max[ch]===5&&hist.some(w=>w.includes(ch))) max[ch]=0;
    if(max[ch]===0) X.add(ch);
  });
  return{regexp:new RegExp("^"+pPos.join("")+"$"),G,Y,X,posNo,min,max};
}
function filterList(list,f){
  return list.filter(w=>{
    if(!f.regexp.test(w)) return false;
    for(const {ch,pos} of f.posNo) if(w[pos]===ch) return false;
    for(const ch of f.Y) if(!w.includes(ch)) return false;
    const cnt={}; ALPHABET.forEach(c=>cnt[c]=0); w.split("").forEach(ch=>cnt[ch]++);
    for(const ch of ALPHABET) if(cnt[ch]<f.min[ch]||cnt[ch]>f.max[ch]) return false;
    return true;
  });
}

/* ---------- update & render ---------- */
function updateCandidates(){
  filterCache=buildFilter(history,patterns);
  candFull =filterList(DICT_FULL ,filterCache);
  candShort=filterList(DICT_SHORT,filterCache);

  entFull.clear(); entShort.clear(); rapFull=rapShort=null;
  verFull++; verShort++;
}
function generateLists(){
  if(!candFull.length && !candShort.length) updateCandidates();
  renderAll(); toggleCompareBtn();
}
function renderAll(){
  $("cntFull").textContent =candFull.length;
  $("cntShort").textContent=candShort.length;

  ["full","short"].forEach(renderCandidates);
  ["full","short"].forEach(renderDiscard);
  ["full","short"].forEach(renderGreen);
  ["full","short"].forEach(renderFreq);
}

/* ==================================================== */
/* ==============  ENTROPY (exact / fast) ============= */
function H(word,pool){
  const C = pool==="full"?candFull:candShort;
  const cache=pool==="full"?entFull:entShort;
  let rapido =pool==="full"?rapFull:rapShort;
  const ver   =pool==="full"?verFull:verShort;

  if(!C.length) return 0;
  if(C.length>FAST_LIMIT){
    if(!rapido){
      const f=new Map(), pos=Array.from({length:5},()=>new Map());
      C.forEach(w=>w.split("").forEach((ch,i)=>{
        f.set(ch,(f.get(ch)||0)+1);
        pos[i].set(ch,(pos[i].get(ch)||0)+1);
      }));
      const raw=w=>{
        let a=0; new Set(w).forEach(ch=>a+=(f.get(ch)||0));
        let b=0; w.split("").forEach((ch,i)=>b+=(pos[i].get(ch)||0));
        return .3*a+.7*b;
      };
      let mx=0; C.forEach(w=>mx=Math.max(mx,raw(w)));
      const k=(C.length-1)/mx, m=new Map();
      C.forEach(w=>m.set(w,+(raw(w)*k).toFixed(2)));
      rapido={map:m,calc:w=>+(raw(w)*k).toFixed(2)};
      if(pool==="full") rapFull=rapido; else rapShort=rapido;
    }
    return rapido.map.get(word)||rapido.calc(word);
  }

  const c=cache.get(word); if(c&&c.v===ver) return c.h;
  const m=new Map(); C.forEach(sol=>{
    const k=patternKey(sol,word); m.set(k,(m.get(k)||0)+1);
  });
  const n=C.length, h=n - [...m.values()].reduce((a,x)=>a+x*x,0)/n;
  cache.set(word,{v:ver,h}); return h;
}

/* ==================================================== */
/* ==============  UTILITIES  ========================= */
function patternFromWords(sol,gu){
  const out=Array(5).fill(0), S=sol.split(""), G=gu.split("");
  for(let i=0;i<5;i++) if(G[i]===S[i]){out[i]=2;S[i]=G[i]=null;}
  for(let i=0;i<5;i++) if(G[i]){
    const j=S.indexOf(G[i]); if(j!==-1){out[i]=1;S[j]=null;}
  }
  return out;
}
const patternKey=(s,g)=>patternFromWords(s,g).join("");

const markGrays=w=>{
  if(!filterCache) return w;
  let out=""; for(const ch of w) out+=filterCache.X.has(ch)?ch+"*":ch;
  return out;
};
const greenPos=()=>{const g=Array(5).fill(null);
  patterns.forEach((p,i)=>p.forEach((c,idx)=>{if(c===2)g[idx]=history[i][idx];}));
  return g;};
const yellows=()=>{const s=new Set();
  patterns.forEach((p,i)=>p.forEach((c,idx)=>{if(c===1)s.add(history[i][idx]);}));
  return s;};
const containsAny=(w,set)=>[...set].some(ch=>w.includes(ch));
const isGreenRep=(w,g)=>g.every((ch,i)=>!ch||(w.includes(ch)&&w[i]!==ch));

/* ==================================================== */
/* ==============  RENDER (6 × 2)  ==================== */
function renderCandidates(pool){
  const list=(pool==="full"?candFull:candShort)
              .slice(0,200).sort((a,b)=>H(b,pool)-H(a,pool));
  const tb=tbody(`tblCand${cap(pool)}`); tb.innerHTML="";
  list.forEach(w=>tb.insertAdjacentHTML("beforeend",
    `<tr><td>${w}</td><td>${H(w,pool).toFixed(2)}</td></tr>`));
}
function renderDiscard(pool){
  const kSet=new Set([...greenPos(),...yellows()]);
  const base = kSet.size ? DICT_FULL.filter(w=>!containsAny(w,kSet)) : DICT_FULL;
  const list = base.slice().sort((a,b)=>H(b,pool)-H(a,pool)).slice(0,20);
  const tb=tbody(`tblDisc${cap(pool)}`); tb.innerHTML="";
  list.forEach(w=>tb.insertAdjacentHTML("beforeend",
    `<tr><td>${markGrays(w)}</td><td>${H(w,pool).toFixed(2)}</td></tr>`));
}
function renderGreen(pool){
  const g=greenPos(); if(g.every(x=>!x)){tbody(`tblGreen${cap(pool)}`).innerHTML="";return;}
  const ySet=yellows();
  const poolList=DICT_FULL.filter(w=>isGreenRep(w,g)&&!containsAny(w,ySet));
  const list=poolList.slice().sort((a,b)=>H(b,pool)-H(a,pool)).slice(0,20);
  const tb=tbody(`tblGreen${cap(pool)}`); tb.innerHTML="";
  list.forEach(w=>tb.insertAdjacentHTML("beforeend",
    `<tr><td>${markGrays(w)}</td><td>${H(w,pool).toFixed(2)}</td></tr>`));
}
function renderFreq(pool){
  const C = pool==="full"?candFull:candShort;
  const rows=ALPHABET.map(l=>({l,a:0,w:0,r:0}));
  C.forEach(w=>{
    const seen={};
    w.split("").forEach(ch=>{
      const r=rows[ALPHABET.indexOf(ch)]; r.a++;
      if(seen[ch]) r.r++; else {r.w++;seen[ch]=1;}
    });
  });
  rows.sort((x,y)=>y.w-x.w);
  const tb=tbody(`tblFreq${cap(pool)}`); tb.innerHTML="";
  rows.forEach(r=>tb.insertAdjacentHTML("beforeend",
    `<tr><td>${r.l}</td><td>${r.a}</td><td>${r.w}</td><td>${r.r}</td></tr>`));
}

/* ==================================================== */
/* =================  COMPARE ≤100  =================== */
function toggleCompareBtn(){
  const lenFull = candFull.length;
  const lenShort= candShort.length;
  $("tabCompare").disabled = !((lenFull  && lenFull <=100) ||
                               (lenShort && lenShort<=100));
}
function runCompare(){
  const poolSel=$("comparePool").value;
  const base   = poolSel==="full"?candFull:candShort;

  if(!compareSelect){
//    if(base.length>100){alert("Too many candidates (max 100)");return;}
    buildSelectionList(base,base.length<=25);
    compareSelect=true; $("runCompare").textContent="Compare selected"; return;
  }

  const chosen=[...document.querySelectorAll("#compareArea input.selWord:checked")].map(cb=>cb.value);
  if(!chosen.length){alert("Select at least one word");return;}
  if(chosen.length>25){alert("Max 25 words");return;}

  const extra=$("extraInput").value.toUpperCase()
               .split(/[^A-Z]/).filter(x=>x.length===5).slice(0,2);
  drawCompareTable([...chosen,...extra],base);

  compareSelect=false; $("runCompare").textContent="Run comparison";
}

function buildSelectionList(list,all){
  let h='<p><strong>Select up to 25 words</strong> and press “Compare selected” again:</p>';
  h+='<div style="max-height:300px;overflow:auto;columns:140px auto;">';
  list.forEach(w=>h+=`<label style="display:block;">
      <input type="checkbox" class="selWord" value="${w}" ${all?"checked":""}> ${w}</label>`);
  $("compareArea").innerHTML=h+"</div>";
}

function drawCompareTable(words,poolCands){
  const n=words.length; if(!n){$("compareArea").textContent="No words";return;}
  const isExtra=w=>!poolCands.includes(w);

  /* patterns + stats */
  const pat=words.map(g=>words.map(s=>patternKey(s,g)));
  const stats=pat.map(row=>{
    const grp={}; row.forEach((p,i)=>(grp[p]=grp[p]||[]).push(i));
    const sizes=Object.values(grp).map(a=>a.length);
    return{opt:sizes.length,max:Math.max(...sizes)};
  });

  /* order rows/cols */
  const ord=words.map((w,i)=>({w,idx:i,opt:stats[i].opt,max:stats[i].max}))
                 .sort((a,b)=>b.opt-a.opt||a.max-b.max||a.w.localeCompare(b.w));
  const orderIdx=ord.map(o=>o.idx);
  const maxOpt=ord[0].opt;
  const bestMax=Math.min(...ord.map(o=>o.max));  /* ← mínimo de la columna */

  /* build HTML */
  let html='<table style="border-collapse:collapse;font-size:12px"><thead><tr><th></th>';
  ord.forEach(o=>{
    const red=isExtra(o.w)?'color:red;':'';
    html+=`<th style="${red}">${o.w}</th>`;
  });
  html+=`<th>opt (${maxOpt})</th><th>max (${bestMax})</th></tr></thead><tbody>`;

  ord.forEach(oRow=>{
    const rowStyle=isExtra(oRow.w)?'color:red;':'';
    html+=`<tr><th style="${rowStyle}">${oRow.w}</th>`;

    /* colour groups */
    const groups={};
    orderIdx.forEach((origIdx,visCol)=>{
      const p=pat[oRow.idx][origIdx];
      (groups[p]=groups[p]||[]).push(visCol);
    });
    let c=0; Object.values(groups).forEach(g=>{ if(g.length>1) g.clr=palette[c++%palette.length]; });

    orderIdx.forEach((origIdx,visCol)=>{
      const p=pat[oRow.idx][origIdx], g=groups[p], bg=g.clr||"#f2f2f2";
      const next=g.find(x=>x>visCol); const jump=next?next-visCol:0;
      html+=`<td style="text-align:center;background:${bg};${rowStyle}">${p}-${jump}</td>`;
    });

    html+=`<td style="text-align:center;font-weight:bold;${rowStyle}">${oRow.opt}</td>`;
    html+=`<td style="text-align:center;font-weight:bold;${rowStyle}">${oRow.max}</td></tr>`;
  });

  $("compareArea").innerHTML=html+"</tbody></table>";
}

/* ==================================================== */
/* ===================  FINDER  ======================= */
function runFinder(){
  const raw=$("lettersInput").value.toUpperCase().replace(/[^A-Z]/g,"");
  if(!raw){alert("Enter letters");return;}
  const letters=[...new Set(raw.split(""))]; if(letters.length>10){alert("Max 10 letters");return;}

  /* combinations helper */
  const combos=(arr,k)=>{const out=[],rec=(s,a)=>{
    if(a.length===k){out.push(a.slice());return;}
    for(let i=s;i<arr.length;i++){a.push(arr[i]);rec(i+1,a);a.pop();}
  };rec(0,[]);return out;};

  let res={};
  for(let k=letters.length;k>=1;k--){
    combos(letters,k).forEach(c=>{
      const hits=DICT_FULL.filter(w=>c.every(ch=>w.includes(ch)));
      if(hits.length) res[c.join("")]=hits;
    });
    if(Object.keys(res).length) break;
  }

  $("finderResults").innerHTML = Object.entries(res).length
    ? Object.entries(res)
        .sort((a,b)=>b[0].length-a[0].length||a[0].localeCompare(b[0]))
        .map(([c,ws])=>`<h4>Using ${c} (${ws.length})</h4><pre>${ws.join(", ")}</pre>`)
        .join("")
    : "<p>No words found</p>";
}
