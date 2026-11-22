import {StrictMode,useState,useEffect} from "react";
import {createRoot} from "react-dom/client";
import {ClerkProvider} from "@clerk/clerk-react";
import {Capacitor} from "@capacitor/core";
import Session from "./components/Session";
import {base} from "./lib/runtimeConfig";
import "./index.css";

function Bootstrap(){
 const [key,setKey]=useState<string>(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY||""),[error,E]=useState(""),[host,H]=useState("");
 const needsHost=Capacitor.isNativePlatform()&&!base;
 useEffect(()=>{if(key||needsHost)return;const c=new AbortController();fetch(base+"/public-config",{signal:c.signal}).then(r=>r.json()).then(d=>{if(!d.publishableKey)throw Error("Set VITE_CLERK_PUBLISHABLE_KEY on the Sahva server.");setKey(d.publishableKey)}).catch(e=>{if(!c.signal.aborted)E(e.message)});return()=>c.abort()},[key,needsHost]);
 if(needsHost)return <main className="entry"><form className="entry-card" onSubmit={e=>{e.preventDefault();try{const url=new URL(host);if(url.protocol!=="https:"||url.username||url.password)throw Error("Enter your HTTPS deployment URL.");localStorage.setItem("sahva:test-server",url.origin);location.reload()}catch(e:any){E(e.message)}}}><h1>Connect to Sahva</h1><label>Test server URL<input type="url" required placeholder="https://sahva.example.com" value={host} onChange={e=>H(e.target.value)}/></label><button>Connect</button>{error&&<p role="alert">{error}</p>}</form></main>;
 if(!key)return <main className="entry"><section className="entry-card"><h1>Sahva</h1><p>{error||"Connecting…"}</p>{error&&<button onClick={()=>{if(Capacitor.isNativePlatform())localStorage.removeItem("sahva:test-server");location.reload()}}>Try again</button>}</section></main>;
 return <ClerkProvider publishableKey={key}><Session/></ClerkProvider>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Bootstrap/></StrictMode>);

