import {useEffect,useRef,useState} from "react";
import { SUPPORTED_LANGUAGES } from "../data/languages";
import { bridge,native,request } from "../lib/runtimeConfig";
import type {User} from "../db/schema";
const greetings:Record<string,string>={en:"Hello",te:"నమస్కారం",hi:"नमस्ते",es:"Hola",ja:"こんにちは",fr:"Bonjour",de:"Hallo","zh-CN":"你好",ta:"வணக்கம்",ar:"مرحباً",bn:"নমস্কার",ko:"안녕하세요",pt:"Olá",it:"Ciao",ru:"Привет",tr:"Merhaba","zh-TW":"你好",mr:"नमस्कार",gu:"નમસ્તે",kn:"ನಮಸ್ಕಾರ",ml:"നമസ്കാരം",ur:"سلام",nl:"Hallo",pl:"Cześć",vi:"Xin chào",th:"สวัสดี",id:"Halo",sv:"Hej",no:"Hei",da:"Hej",fi:"Hei",el:"Γεια",he:"שלום",cs:"Ahoj",ro:"Salut",hu:"Szia",uk:"Привіт",sw:"Habari"};
export default function OnboardingFlow({user,done}:{user:User;done:(u:User)=>void}){
  const [step,S]=useState(1),[name,N]=useState(user.displayName),[photo,P]=useState(user.avatarUrl),[tone,T]=useState(user.voiceTone),[lang,L]=useState("English"),[search,Q]=useState(""),[muted,M]=useState(false),[level,V]=useState(0),[busy,B]=useState(false),[error,E]=useState("");
  const stop=useRef(()=>{}),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;stop.current()}},[]);
  const choice=SUPPORTED_LANGUAGES.find(l=>l.name===lang)!;
  async function testMic(){
    stop.current();const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    if(!alive.current){stream.getTracks().forEach(t=>t.stop());return}
    const ctx=new AudioContext(),meter=ctx.createAnalyser(),source=ctx.createMediaStreamSource(stream);
    source.connect(meter);const data=new Uint8Array(meter.fftSize);
    const tick=setInterval(()=>{meter.getByteTimeDomainData(data);V(Math.min(100,Math.max(...data.map(v=>Math.abs(v-128)))*3))},80);
    const end=()=>{clearInterval(tick);clearTimeout(timer);stream.getTracks().forEach(t=>t.stop());void ctx.close();V(0);stop.current=()=>{}};
    const timer=setTimeout(end,5000);stop.current=end;
  }
  async function run(fn:()=>Promise<unknown>){B(true);E("");try{await fn()}catch(e:any){E(e.message)}finally{B(false)}}
  return <main className="entry"><section className="entry-card"><div className="step-indicator" aria-label={`Step ${step} of 3`}>{[1,2,3].map(i=><i key={i} className={i<=step?"filled":""}/>)}</div><h1>{["Your profile","Your language","Set up calls"][step-1]}</h1>
  {step===1&&<><label className="photo">{photo?<img src={photo} alt="Profile"/>:<b>{name.trim().slice(0,1)}</b>}<span>Choose photo</span><input type="file" accept="image/jpeg,image/png" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void run(async()=>{if(f.size>5*1024*1024)throw Error("Choose a photo under 5 MB.");const data=await new Promise<string>((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(",")[1]);r.onerror=no;r.readAsDataURL(f)});P((await request("/api/me/avatar","POST",{data})).avatarUrl)})}}/></label><label>Display name<input value={name} maxLength={80} onChange={e=>N(e.target.value)}/></label><label>Voice tone<select value={tone} onChange={e=>T(e.target.value as typeof tone)}><option value="female">Female — Kore</option><option value="male">Male — Charon</option></select></label></>}
  {step===2&&<><label>Search languages<input type="search" value={search} onChange={e=>Q(e.target.value)}/></label><div className="language-list">{SUPPORTED_LANGUAGES.filter(l=>(l.name+l.nativeName+l.code).toLowerCase().includes(search.toLowerCase())).map(l=><button key={l.code} className={lang===l.name?"selected":"secondary"} onClick={()=>L(l.name)}>{l.name} · {l.nativeName}</button>)}</div><p>{choice.code} · {greetings[choice.code]}</p></>}
  {step===3&&<><label>Audio mix<select value={muted?"only":"stack"} onChange={e=>M(e.target.value==="only")}><option value="stack">100% / 15% Stack</option><option value="only">Translated Only</option></select></label><button className="secondary" disabled={busy} onClick={()=>run(testMic)}>Test microphone</button><meter min="0" max="100" value={level} aria-label="Microphone level"/>
  {native?<><button className="secondary" onClick={()=>run(()=>bridge.requestPermissions())}>Allow microphone and notifications</button><button className="secondary" onClick={()=>run(()=>bridge.requestBatteryOptimizationExemption())}>Allow background listening</button><p>Lets Sahva ring your phone even when minimized.</p></>:"Notification" in window&&<button className="secondary" onClick={()=>run(async()=>{if(await Notification.requestPermission()!=="granted")throw Error("Enable notifications in your browser settings to receive call alerts.")})}>Enable call notifications</button>}</>}
  {error&&<p role="alert">{error}</p>}<div className="entry-actions"><button disabled={busy||!name.trim()} onClick={()=>step<3?S(step+1):run(async()=>done((await request("/api/me/onboarding","PATCH",{displayName:name,preferredLanguageName:lang,voiceTone:tone,audioMixOriginalMuted:muted})).user))}>{step===3?"Enter Sahva":"Continue"}</button>{step>1&&<button className="secondary" onClick={()=>{stop.current();S(step-1)}}>Back</button>}</div></section></main>;
}

