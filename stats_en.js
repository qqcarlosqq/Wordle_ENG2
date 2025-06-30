/* =========================================================
   Stats module 2.4-en  –  International-aware numbers, XLS,
   mail + tabs.  Plug & play for English version.
   ========================================================= */
(()=>{
  const $ = id=>document.getElementById(id);

  /* ----- locale helpers ----- */
  const locale = navigator.language || "en-US";
  const nfInt  = new Intl.NumberFormat(locale);
  const nf2    = new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:2});
  const nf5    = new Intl.NumberFormat(locale,{minimumFractionDigits:5,maximumFractionDigits:5});
  const pct    = (n,t)=> nf2.format(n*100/t)+"%";

  /* ----- localStorage keys ----- */
  const K_ACT="ws_stats_en_actual", K_OH="ws_stats_en_hist", K_OT="ws_stats_en_tool";
  const load=k=>{try{const a=JSON.parse(localStorage.getItem(k)||"[]");return Array.isArray(a)&&a.length===7?a:Array(7).fill(0);}catch{return Array(7).fill(0);} };
  const save=(k,a)=>localStorage.setItem(k,JSON.stringify(a));

  let A = load(K_ACT), OH = load(K_OH), OT = load(K_OT);

  /* ----- paint tables ----- */
  const tbody=a=>{
    const tot=a.reduce((s,n)=>s+n,0)||1;
    const rows=a.map((n,i)=>`<tr><td>${i+1}</td><td>${nfInt.format(n)}</td><td>${pct(n,tot)}</td></tr>`).join("");
    return rows+
      `<tr><th>Total</th><th>${nfInt.format(tot)}</th><th></th></tr>`+
      `<tr><th>Average</th><th colspan="2">${nf5.format(a.reduce((s,n,j)=>s+n*(j+1),0)/tot)}</th></tr>`;
  };
  const paint=()=>{
    $("statsActualBody").innerHTML = tbody(A);
    $("statsHistBody").innerHTML   = tbody(A.map((v,i)=>v+OH[i]));
    $("statsToolBody").innerHTML   = tbody(A.map((v,i)=>v+OT[i]));
  };

  /* ----- listen game end ----- */
  document.addEventListener("ws:gameEnd",e=>{
    const b=e.detail.bucket;
    (b>=1&&b<=6)?A[b-1]++:A[6]++;
    save(K_ACT,A); paint();
  });

  /* ----- manual edit ----- */
  function ask(which){
    const txt=prompt("Enter 7 numbers comma-separated:");
    if(!txt) return;
    const arr=txt.split(",").map(s=>parseInt(s,10));
     if(arr.length!==7||arr.some(n=>isNaN(n)||(which!=="TOOL"&&which!=="HIST"&&n<0))){
      alert("Invalid input");return;
    }
    if(which==="ACT")  A = arr, save(K_ACT,A);
    if(which==="HIST") OH= arr, save(K_OH ,OH);
    if(which==="TOOL") OT= arr, save(K_OT ,OT);
    paint();
  }

  /* ----- Excel + e-mail ----- */
  function downloadExcelAndMail(){
    const build=(title,arr)=>{
      const tot=arr.reduce((s,n)=>s+n,0)||1;
      let h=`<table border="1"><tr><th colspan="3">${title}</th></tr><tr><th>Guesses</th><th>Count</th><th>%</th></tr>`;
      arr.forEach((n,i)=>h+=`<tr><td>${i+1}</td><td>${nfInt.format(n)}</td><td>${pct(n,tot)}</td></tr>`);
      h+=`<tr><th>Total</th><th>${nfInt.format(tot)}</th><th></th></tr><tr><th>Average</th><th colspan="2">${nf5.format(arr.reduce((s,n,j)=>s+n*(j+1),0)/tot)}</th></tr></table>`;
      return h;
    };
    const html="\uFEFF<html><meta charset=utf-8><body>"+
      build("CURRENT",A)+"<br/>"+
      build("HISTORICAL",A.map((v,i)=>v+OH[i]))+"<br/>"+
      build("POST TOOL",A.map((v,i)=>v+OT[i]))+"</body></html>";

    const d=new Date(), fn=`${d.getFullYear()}_${String(d.getMonth()+1).padStart(2,"0")}_${String(d.getDate()).padStart(2,"0")}_Wordle_ENG_stats.xls`;
    const blob=new Blob([html],{type:"application/vnd.ms-excel"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=fn;document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},1e3);

    const line=(lab,arr)=>lab+"\t"+arr.join("\t");
    const body=[line("CURRENT",A),line("HISTORICAL",A.map((v,i)=>v+OH[i])),line("POST_TOOL",A.map((v,i)=>v+OT[i]))].join("\n");
    location.href="mailto:qqcarlosqq@gmail.com?subject="+
      encodeURIComponent("Wordle ENG stats")+
      "&body="+encodeURIComponent(body);
  }

  /* ----- init ----- */
  window.addEventListener("DOMContentLoaded",()=>{
    $("btnResetActual").onclick=()=>ask("ACT");
    $("btnResetHist").onclick  =()=>ask("HIST");
    $("btnResetTool").onclick  =()=>ask("TOOL");
    $("btnSendStats").onclick  =downloadExcelAndMail;
    paint();
  });
})();
