/* Wordle Solver — English  v9.4-en  (2025-07-03)
   • Diccionario:
       - Si ya existe DICTIONARY (lo define diccionario_en.js) NO se vuelve
         a declarar.
       - Si no existe, se crea a partir de diccionario_en (compatibilidad).
   • Coherencia de pistas = misma lógica que la versión española
     (solo verde contradictorio y gris→no-gris).
*/

/* ---------- Diccionario ---------- */
if (typeof DICTIONARY === "undefined") {
  const raw = (typeof diccionario_en !== "undefined") ? diccionario_en : [];
  window.DICTIONARY = raw.map(w => w.toUpperCase());
}

/* ---------- Constantes ---------- */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const COLORS   = ["gray","Yellow","GREEN"];
const FAST_LIMIT = 2000;

const palette = [
  "#ffcc00","#4da6ff","#66cc66","#ff6666","#c58aff","#ffa64d",
  "#4dd2ff","#99ff99","#ff80b3","#b3b3ff","#ffd24d","#3399ff",
  "#77dd77","#ff4d4d","#c299ff","#ffb84d","#00bfff","#99e699",
  "#ff99c2","#9999ff","#ffe066","#0080ff","#66ffb3","#ff4da6","#8080ff"
];

/* ---------- Estado ---------- */
let history=[], patterns=[], version=0;
let candidates=[], entCache=new Map(), rapido=null;
let compareSelect=false, lastFilter=null;

/* ---------- Helper DOM ---------- */
const $=id=>document.getElementById(id);
const on=(id,fn)=>$(id).addEventListener("click",fn);
const tbody=id=>$(id).tBodies[0]||$(id).appendChild(document.createElement("tbody"));

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded",()=>{
  buildColorSelectors();
  on("saveGuess",saveGuess); on("reset",resetAll);
  on("suggest",generateLists); on("findBtn",runFinder);
  on("runCompare",runCompare);
  on("tabSolver",()=>showTab("solver"));
  on("tabFinder",()=>showTab("finder"));
  on("tabCompare",()=>showTab("compare"));
  showTab("solver"); renderFreq();
});

/* ---------- Tabs ---------- */
function showTab(t){
  ["Solver","Finder","Compare"].forEach(p=>{
    $(`panel${p}`).hidden = (p.toLowerCase()!==t);
    $(`tab${p}`).classList.toggle("active",p.toLowerCase()===t);
  });
}

/* ---------- Colour selectors ---------- */
function buildColorSelectors(){
  const box=$("colorSelects"); box.innerHTML="";
  for(let i=0;i<5;i++){
    const s=document.createElement("select");
    ["Gray","Yellow","Green"].forEach((txt,val)=>{
      const o=document.createElement("option");
      o.value=val; o.textContent=txt; s.appendChild(o);
    });
    box.appendChild(s);
  }
}
const readColors=()=>[...$("colorSelects").children].map(sel=>+sel.value);

/* ================= SAVE GUESS ================= */
function saveGuess(){
  const word=$("wordInput").value.toUpperCase().trim();
  if(!/^[A-Z]{5}$/.test(word)){ alert("Enter a 5-letter word"); return; }

  if(!DICTIONARY.includes(word) &&
     !confirm(`"${word}" is not in the dictionary.\nContinue anyway?`)) return;

  const pat=readColors();

  /* ---------- coherencia estilo ES ---------- */
  const greenPos=Array(5).fill(null); const absent=new Set();

  history.forEach((w,i)=>{
    patterns[i].forEach((c,pos)=>{ if(c===2) greenPos[pos]=w[pos]; });
  });
  history.forEach((w,i)=>{
    w.split("").forEach((ch,idx)=>{
      const col=patterns[i][idx];
      if(col!==0) absent.delete(ch);
      else if(!absent.has(ch) && !greenPos.includes(ch)
              && !patterns[i].includes(1)) absent.add(ch);
    });
  });
  for(let i=0;i<5;i++){
    if(pat[i]===2 && greenPos[i] && greenPos[i]!==word[i]){
      alert(`Conflict: position ${i+1} already green '${greenPos[i]}'.`); return;
    }
  }
  for(let i=0;i<5;i++){
    const ch=word[i]; if(absent.has(ch) && pat[i]!==0){
      alert(`Conflict: letter '${ch}' was gray before and now is ${COLORS[pat[i]]}.`); return;
    }
  }
  /* ---------- fin coherencia ---------- */

  history.push(word); patterns.push(pat);
  $("wordInput").value=""; buildColorSelectors(); updateHistory();
  candidates=[]; entCache.clear(); rapido=null; version++; lastFilter=null;
  $("compareArea").innerHTML=""; compareSelect=false; toggleCompareBtn();
}

/* ---------- Reset ---------- */
function resetAll(){
  history=[]; patterns=[]; candidates=[]; entCache.clear(); rapido=null;
  version++; lastFilter=null; compareSelect=false;
  ["history","compareArea"].forEach(id=>$(id).innerHTML="");
  ["tblCands","tblDiscard","tblGreen","tblFreq"].forEach(id=>tbody(id).innerHTML="");
  $("candCount").textContent="0"; buildColorSelectors(); toggleCompareBtn();
}

/* ---------- History textarea ---------- */
function updateHistory(){
  $("history").textContent = history.map((w,i)=>
    `${w} → ${patterns[i].map(c=>COLORS[c]).join(", ")}`).join("\n");
}

/* ================= FILTER (min/max) ================= */
function buildFilter(hist,patArr){
  const pPos=Array(5).fill("."), G=new Set(),Y=new Set(),X=new Set(),posNo=[];
  const min={},max={}; ALPHABET.forEach(ch=>{min[ch]=0;max[ch]=5;});

  patArr.forEach((p,i)=>{
    const w=hist[i], gC={},yC={},xC={}; ALPHABET.forEach(ch=>gC[ch]=yC[ch]=xC[ch]=0);
    p.forEach((c,pos)=>{
      const ch=w[pos];
      if(c===2){ pPos[pos]=ch; G.add(ch); gC[ch]++; }
      else if(c===1){ Y.add(ch); posNo.push({ch,pos}); yC[ch]++; }
      else xC[ch]++;
    });
    ALPHABET.forEach(ch=>{
      const col=gC[ch]+yC[ch];
      if(col>0) min[ch]=Math.max(min[ch],col);
      if(xC[ch]>0) max[ch]=Math.min(max[ch],col);
    });
  });
  ALPHABET.forEach(ch=>{
    if(min[ch]===0 && max[ch]===5 && hist.some(w=>w.includes(ch))) max[ch]=0;
    if(max[ch]===0) X.add(ch);
  });
  return {regexp:new RegExp("^"+pPos.join("")+"$"),G,Y,X,posNo,min,max};
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

/* ================= LISTAS PRINCIPALES ================= */
function generateLists(){
  if(!candidates.length) updateCandidates();
  renderAll();
  toggleCompareBtn();
}
function updateCandidates(){
  lastFilter = buildFilter(history,patterns);
  candidates = filterList(DICTIONARY,lastFilter);
  entCache.clear(); rapido=null; version++;
}
function renderAll(){
  $("candCount").textContent=candidates.length;
  renderCandidates(); renderDiscard(); renderGreen(); renderFreq();
}

/* ---------- heurística rápida ---------- */
function buildRapido(list){
  const f=new Map(), pos=Array.from({length:5},()=>new Map());
  list.forEach(w=>w.split("").forEach((ch,i)=>{
    f.set(ch,(f.get(ch)||0)+1);
    pos[i].set(ch,(pos[i].get(ch)||0)+1);
  }));
  const raw=w=>{
    let a=0; new Set(w).forEach(ch=>a+=(f.get(ch)||0));
    let b=0; w.split("").forEach((ch,i)=>b+=(pos[i].get(ch)||0));
    return .3*a+.7*b;
  };
  let mx=0; list.forEach(w=>mx=Math.max(mx,raw(w)));
  const k=(list.length-1)/mx, map=new Map();
  list.forEach(w=>map.set(w, +(raw(w)*k).toFixed(2)));
  return {map,calc:w=>+(raw(w)*k).toFixed(2)};
}
function H(word){
  if(candidates.length>FAST_LIMIT){
    if(!rapido) rapido=buildRapido(candidates);
    return rapido.map.get(word)||rapido.calc(word);
  }
  /* entropía exacta en cache */
  const c=entCache.get(word);
  if(c&&c.v===version) return c.h;
  const m=new Map();
  candidates.forEach(sol=>{
    const k=patternKey(sol,word);
    m.set(k,(m.get(k)||0)+1);
  });
  const n=candidates.length;
  const h=n - [...m.values()].reduce((a,x)=>a+x*x,0)/n;
  entCache.set(word,{v:version,h});
  return h;
}

/* ---------- patternKey (sin cambios) ---------- */
function patternFromWords(sol,gu){
  const out=Array(5).fill(0), S=sol.split(""), G=gu.split("");
  for(let i=0;i<5;i++) if(G[i]===S[i]){ out[i]=2; S[i]=G[i]=null; }
  for(let i=0;i<5;i++) if(G[i]){
    const j=S.indexOf(G[i]); if(j!==-1){ out[i]=1; S[j]=null; }
  }
  return out;
}
const patternKey=(s,g)=>patternFromWords(s,g).join("");

/* ---------- helpers sets ---------- */
const greens = ()=>{const s=new Set();patterns.forEach((p,i)=>p.forEach((c,idx)=>{if(c===2)s.add(history[i][idx]);}));return s;};
const yellows= ()=>{const s=new Set();patterns.forEach((p,i)=>p.forEach((c,idx)=>{if(c===1)s.add(history[i][idx]);}));return s;};
const knownSet= ()=>new Set([...greens(),...yellows()]);

/* ---------- marca de grises ---------- */
const markGrays = w=>{
  if(!lastFilter) return w;
  let out=""; for(const ch of w) out += lastFilter.X.has(ch) ? ch+"*" : ch;
  return out;
};

/* ---------- tabla Candidates ---------- */
function renderCandidates(){
  const list=candidates.slice().sort((a,b)=>H(b)-H(a));
  const tb=tbody("tblCands"); tb.innerHTML="";
  list.forEach(w=>tb.insertAdjacentHTML("beforeend",
    `<tr><td>${w}</td><td>${H(w).toFixed(2)}</td></tr>`));
}

/* ---------- tabla Best discard ---------- */
function renderDiscard(){
  const kSet=knownSet();
  const base = kSet.size ? DICTIONARY.filter(w=>!containsAny(w,kSet)) : DICTIONARY;
  const list=base.slice().sort((a,b)=>H(b)-H(a)).slice(0,20);
  const tb=tbody("tblDiscard"); tb.innerHTML="";
  list.forEach(w=>tb.insertAdjacentHTML("beforeend",
    `<tr><td>${markGrays(w)}</td><td>${H(w).toFixed(2)}</td></tr>`));
}

/* ---------- tabla Green repetition ---------- */
function greenPos(){
  const g=Array(5).fill(null);
  patterns.forEach((p,i)=>p.forEach((c,idx)=>{if(c===2) g[idx]=history[i][idx];}));
  return g;
}
function isGreenRep(w,g){ return g.every((ch,i)=>!ch||(w.includes(ch)&&w[i]!==ch)); }
function containsAny(w,set){ for(const ch of set) if(w.includes(ch)) return true; return false; }

function renderGreen(){
  const g=greenPos(); if(g.every(x=>!x)){ tbody("tblGreen").innerHTML=""; return; }
  const ySet=yellows();
  const pool = DICTIONARY.filter(w=>isGreenRep(w,g)&&!containsAny(w,ySet));
  const list=pool.slice().sort((a,b)=>H(b)-H(a)).slice(0,20);
  const tb=tbody("tblGreen"); tb.innerHTML="";
  list.forEach(w=>tb.insertAdjacentHTML("beforeend",
    `<tr><td>${markGrays(w)}</td><td>${H(w).toFixed(2)}</td></tr>`));
}

/* ---------- frecuencias ---------- */
function renderFreq(){
  const rows=ALPHABET.map(l=>({l,a:0,w:0,r:0}));
  for(const w of candidates){
    const seen={};
    for(const ch of w){
      const r=rows[ALPHABET.indexOf(ch)]; r.a++;
      if(seen[ch]) r.r++; else { r.w++; seen[ch]=1; }
    }
  }
  rows.sort((x,y)=>y.w-x.w);
  const tb=tbody("tblFreq"); tb.innerHTML="";
  rows.forEach(r=>tb.insertAdjacentHTML("beforeend",
    `<tr><td>${r.l}</td><td>${r.a}</td><td>${r.w}</td><td>${r.r}</td></tr>`));
}

/* ================= COMPARE ≤100 ================= */
function toggleCompareBtn(){
  $("tabCompare").disabled = candidates.length===0 || candidates.length>100;
}

function runCompare(){
  if(!compareSelect){
    if(candidates.length>100){ alert("Too many candidates (max 100)"); return; }
    buildSelectionList(candidates,candidates.length<=25);
    compareSelect=true; $("runCompare").textContent="Compare selected"; return;
  }
  const sel=[...document.querySelectorAll("#compareArea input.selWord:checked")]
              .map(cb=>cb.value);
  if(!sel.length){ alert("Select at least one word"); return; }
  if(sel.length>25){ alert("Max 25 words"); return; }

  const extra=$("extraInput").value.toUpperCase()
               .split(/[^A-Z]/).filter(x=>x.length===5).slice(0,2);
  drawCompareTable([...sel,...extra]);
  compareSelect=false; $("runCompare").textContent="Run comparison";
}

function buildSelectionList(list,all){
  let h='<p><strong>Select up to 25 words</strong> and press “Compare selected” again:</p>';
  h+='<div style="max-height:300px;overflow:auto;columns:140px auto;">';
  list.forEach(w=>h+=`<label style="display:block;">
      <input type="checkbox" class="selWord" value="${w}" ${all?"checked":""}> ${w}</label>`);
  $("compareArea").innerHTML=h+"</div>";
}

function drawCompareTable(words){
  const n=words.length; if(!n){ $("compareArea").textContent="No words"; return; }
  /* patrones entre cada par ---------------------------------------- */
  const pat=words.map(g=>words.map(s=>patternKey(s,g)));
  /* estadística por fila */
  const stats=pat.map(row=>{
    const grp={}; row.forEach((p,i)=>(grp[p]=grp[p]||[]).push(i));
    const sizes=Object.values(grp).map(a=>a.length);
    return {opt:sizes.length, max:Math.max(...sizes)};
  });
  /* orden filas / columnas */
  const ord=words.map((w,i)=>({w,idx:i,opt:stats[i].opt,max:stats[i].max}))
                 .sort((a,b)=>b.opt-a.opt || a.max-b.max || a.w.localeCompare(b.w));
  const orderIdx=ord.map(o=>o.idx);
  const maxOpt=ord[0].opt, maxMax=Math.min(...ord.map(o=>o.max));

  /* construir tabla ------------------------------------------------ */
  let html='<table style="border-collapse:collapse;font-size:12px"><thead><tr><th></th>';
  ord.forEach(o=>{
    const red = candidates.includes(o.w) ? "" : "color:red;";
    html+=`<th style="${red}">${o.w}</th>`;
  });
  html+=`<th>opt (${maxOpt})</th><th>max (${maxMax})</th></tr></thead><tbody>`;

  ord.forEach(oRow=>{
    const extra = !candidates.includes(oRow.w);
    const rowStyle = extra ? "color:red;" : "";
    html+=`<tr><th style="${rowStyle}">${oRow.w}</th>`;

    /* agrupar celdas iguales (para colorear) */
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

/* ================= FINDER (≤10 letras) ================= */
function runFinder(){
  const raw=$("lettersInput").value.toUpperCase().replace(/[^A-Z]/g,"");
  if(!raw){ alert("Enter letters"); return; }
  const letters=[...new Set(raw.split(""))]; if(letters.length>10){
    alert("Enter 1-10 letters"); return;
  }
  /* combinaciones ↓ */
  const combos=(arr,k)=>{const out=[],rec=(s,a)=>{
    if(a.length===k){ out.push(a.slice()); return; }
    for(let i=s;i<arr.length;i++){ a.push(arr[i]); rec(i+1,a); a.pop(); }
  };rec(0,[]);return out;};
  let res={};
  for(let k=letters.length;k>=1;k--){
    combos(letters,k).forEach(c=>{
      const hits=DICTIONARY.filter(w=>c.every(l=>w.includes(l)));
      if(hits.length) res[c.join("")]=hits;
    });
    if(Object.keys(res).length) break;
  }
  $("finderResults").innerHTML = Object.entries(res).length
    ? Object.entries(res).sort((a,b)=>b[0].length-a[0].length||a[0].localeCompare(b[0]))
        .map(([c,w])=>`<h4>Using ${c} (${w.length})</h4>
            <pre style="white-space:pre-wrap">${w.join(", ")}</pre>`).join("")
    : "No words found";
}

/* ================= UTILS ================= */
function containsAny(w,set){ for(const ch of set) if(w.includes(ch)) return true; return false; }
function toggleCompareBtn(){ $("tabCompare").disabled = candidates.length===0||candidates.length>100; }
