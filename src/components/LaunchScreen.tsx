import { useState,type FormEvent } from "react";
import { useSignIn,useSignUp } from "@clerk/clerk-react";
import { Browser } from "@capacitor/browser";
import { Preferences } from "@capacitor/preferences";
import { native,webOrigin } from "../lib/runtimeConfig";

export async function google(signIn:ReturnType<typeof useSignIn>["signIn"]) {
  if(!signIn)return;
  if(!native){
    await signIn.authenticateWithRedirect({strategy:"oauth_google",redirectUrl:"/sso-callback",redirectUrlComplete:sessionStorage.getItem("sahva:oauthReturn")||"/"});
    return;
  }
  const keys=await crypto.subtle.generateKey({name:"RSA-OAEP",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["encrypt","decrypt"]);
  const state=crypto.randomUUID();
  await Preferences.set({key:"oauth",value:JSON.stringify({state,key:await crypto.subtle.exportKey("jwk",keys.privateKey),expires:Date.now()+600000})});
  const url=new URL("/native-login",webOrigin);
  url.searchParams.set("state",state);url.searchParams.set("pub",JSON.stringify(await crypto.subtle.exportKey("jwk",keys.publicKey)));
  await Browser.open({url:url.href});
}
export default function LaunchScreen(){
  const {signIn,setActive}=useSignIn(),{signUp}=useSignUp();
  const [step,setStep]=useState<"welcome"|"email"|"code">("welcome"),[email,setEmail]=useState(""),[code,setCode]=useState(""),[signup,setSignup]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function submit(e:FormEvent){
    e.preventDefault();if(!signIn||!signUp||busy)return;setBusy(true);setError("");
    try{
      if(step==="code"){
        const result=signup?await signUp.attemptEmailAddressVerification({code}):await signIn.attemptFirstFactor({strategy:"email_code",code});
        if(result.status!=="complete")throw Error("Your account needs further verification.");
        await setActive({session:result.createdSessionId});return;
      }
      try{
        const attempt=await signIn.create({identifier:email});
        const factor=attempt.supportedFirstFactors?.find(f=>f.strategy==="email_code");
        if(factor?.strategy!=="email_code")throw Error("Email codes are unavailable for this account.");
        await attempt.prepareFirstFactor({strategy:"email_code",emailAddressId:factor.emailAddressId});setSignup(false);
      }catch(e:any){
        if(e.errors?.[0]?.code!=="form_identifier_not_found")throw e;
        await signUp.create({emailAddress:email});await signUp.prepareEmailAddressVerification({strategy:"email_code"});setSignup(true);
      }
      setStep("code");
    }catch(e:any){setError(e.errors?.[0]?.longMessage||e.message)}finally{setBusy(false)}
  }
  return <main className="entry"><section className="entry-card"><div className="tracks" aria-hidden="true"><i/><i/></div><h1>Sahva</h1><p>Speak your language. Hear theirs in yours.</p>
  {step==="welcome"?<div className="entry-actions"><button disabled={!signIn||busy} onClick={()=>{setBusy(true);google(signIn).catch(e=>setError(e.message)).finally(()=>setBusy(false))}}>Continue with Google</button><button className="secondary" onClick={()=>setStep("email")}>Continue with Email</button></div>:
  <form onSubmit={submit}><label>{step==="email"?"Email address":"Verification code"}<input autoFocus key={step} type={step==="email"?"email":"text"} inputMode={step==="email"?"email":"numeric"} autoComplete={step==="email"?"email":"one-time-code"} pattern={step==="code"?"[0-9]{6}":undefined} maxLength={step==="code"?6:254} required value={step==="email"?email:code} onChange={e=>step==="email"?setEmail(e.target.value):setCode(e.target.value)}/></label>{step==="code"&&<p>Enter the six-digit code sent to {email}.</p>}<button disabled={busy}>{step==="email"?"Send code":"Verify code"}</button><button type="button" className="secondary" onClick={()=>setStep(step==="code"?"email":"welcome")}>Back</button></form>}
  {error&&<p role="alert">{error}</p>}</section></main>;
}

