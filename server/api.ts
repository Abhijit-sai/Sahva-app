import { Router } from "express";
import { randomUUID } from "node:crypto";
import { and, desc, eq, ilike, inArray, ne, or } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { db } from "../src/db";
import { users, conversations, calls, participants, tasks, notes, type User } from "../src/db/schema";
import { SUPPORTED_LANGUAGES } from "../src/data/languages";
import { currentUser, HttpError, route, uuid } from "./middleware/auth";
import { avatar, history, membership, noteList, threadList } from "./services/repository";
import { uploadMedia } from "./services/s3";
export const api=Router();
export async function createRoom(owner:string, ids:string[], title?:string) {
  const all=[...new Set([owner,...ids])].sort();
  const directPair=all.length===2 && !title?all.join("/"):null;
  return db.transaction(async tx=>{
    const [room]=await tx.insert(conversations).values({createdByUserId:owner,roomKey:randomUUID(),isGroup:!directPair,title:title||null,directPair}).onConflictDoUpdate({target:conversations.directPair,set:{directPair}}).returning();
    await tx.insert(participants).values(all.map(userId=>({conversationId:room.id,userId,role:userId===room.createdByUserId?"owner" as const:"member" as const}))).onConflictDoNothing();
    return room;
  });
}
const publicUser=async(u:User)=>({...u,avatarUrl:await avatar(u.avatarUrl)});
api.get("/me",route(async(_req,res)=>{const u=currentUser(res);res.json({user:await publicUser(u),onboardingCompleted:u.onboardingCompleted})}));
api.patch(["/me","/me/onboarding"],route(async(req,res)=>{
  const u=currentUser(res), b=req.body;
  const patch:Partial<typeof users.$inferInsert>={updatedAt:new Date()};
  if(b.displayName!==undefined) {
    if(typeof b.displayName!=="string" || !b.displayName.trim() || b.displayName.length>80) throw new HttpError(400,"Enter a name up to 80 characters.");
    patch.displayName=b.displayName.trim();
  }
  if(b.email && b.email!==u.email) {
    const account=await clerkClient.users.getUser(u.clerkUserId);
    const verified=account.emailAddresses.find(e=>e.emailAddress.toLowerCase()===String(b.email).toLowerCase() && e.verification?.status==="verified");
    if(!verified) throw new HttpError(400,"Verify the new email with Clerk first.");
    patch.email=verified.emailAddress.toLowerCase();
  }
  if(b.preferredLanguageName!==undefined) {
    const l=SUPPORTED_LANGUAGES.find(l=>l.name===b.preferredLanguageName);
    if(!l) throw new HttpError(400,"Choose a supported language.");
    patch.preferredLanguageCode=l.code; patch.preferredLanguageName=l.name;
  }
  for(const [key, allowed] of Object.entries({voiceTone:["female","male"],theme:["light","dark"],audioModelPreference:["auto","gemini-3.5-live-translate-preview","gemini-3.8-live"]})) {
    if(b[key]!==undefined){if(!allowed.includes(b[key])) throw new HttpError(400,"Invalid preference."); Object.assign(patch,{[key]:b[key]});}
  }
  if(typeof b.audioMixOriginalMuted==="boolean") patch.audioMixOriginalMuted=b.audioMixOriginalMuted;
  if(req.path.endsWith("/onboarding")) patch.onboardingCompleted=true;
  const [result]=await db.update(users).set(patch).where(eq(users.id,u.id)).returning();
  res.json({user:await publicUser(result),onboardingCompleted:result.onboardingCompleted});
}));
api.post("/me/avatar",route(async(req,res)=>{
  const u=currentUser(res), data=Buffer.from(String(req.body.data||""),"base64");
  const png=data.subarray(0,8).equals(Buffer.from("89504e470d0a1a0a","hex")), jpeg=data.subarray(0,3).equals(Buffer.from("ffd8ff","hex"));
  if(data.length>5*1024*1024 || !(png||jpeg)) throw new HttpError(400,"Choose a PNG or JPEG under 5 MB.");
  const key=await uploadMedia("avatars/"+u.id+"/"+randomUUID()+(png?".png":".jpg"),data,png?"image/png":"image/jpeg");
  await db.update(users).set({avatarUrl:key}).where(eq(users.id,u.id));res.json({avatarUrl:await avatar(key)});
}));
api.get("/users/search",route(async(req,res)=>{
  const q=String(req.query.q||"").trim().slice(0,100);
  if(q.length<2){res.json([]);return}
  const term="%"+q.replace(/[\\%_]/g,"\\$&")+"%";
  const rows=await db.select({id:users.id,name:users.displayName,email:users.email,language:users.preferredLanguageName,avatarUrl:users.avatarUrl}).from(users).where(and(ne(users.id,currentUser(res).id),or(ilike(users.displayName,term),ilike(users.email,term)))).limit(20);
  res.json(await Promise.all(rows.map(async u=>({...u,avatarUrl:await avatar(u.avatarUrl)}))));
}));
api.get("/conversations",route(async(_req,res)=>{res.json(await threadList(currentUser(res)))}));
api.post("/conversations",route(async(req,res)=>{
  const ids=(req.body.targetUserIds||[]).map(uuid);
  if(ids.length>24 || (!ids.length && !req.body.title)) throw new HttpError(400,"Choose a contact or enter a room name.");
  res.status(201).json(await createRoom(currentUser(res).id,ids,String(req.body.title||"").trim().slice(0,80)));
}));
api.post("/join/:invite",route(async(req,res)=>{
  const [r]=await db.select().from(conversations).where(and(eq(conversations.inviteToken,uuid(req.params.invite)),eq(conversations.isGroup,true)));
  if(!r) throw new HttpError(404,"Invite unavailable.");
  await db.insert(participants).values({conversationId:r.id,userId:currentUser(res).id}).onConflictDoNothing(); res.json({roomId:r.roomKey});
}));
api.get("/conversations/:room/messages",route(async(req,res)=>{const u=currentUser(res), r=await membership(u.id,req.params.room);res.json(await history(r.id,r.roomKey,u))}));
api.get("/notes",route(async(req,res)=>{res.json(await noteList(currentUser(res).id))}));
api.get("/tasks",route(async(_req,res)=>{res.json(await db.select().from(tasks).where(eq(tasks.userId,currentUser(res).id)).orderBy(desc(tasks.createdAt)))}));
api.post("/tasks",route(async(req,res)=>{
  const title=String(req.body.title||"").trim().slice(0,300);
  if(!title) throw new HttpError(400,"Enter a task.");
  const [t]=await db.insert(tasks).values({userId:currentUser(res).id,title}).returning();res.status(201).json(t);
}));
api.patch("/tasks/:id",route(async(req,res)=>{
  const patch:Partial<typeof tasks.$inferInsert>={updatedAt:new Date()};
  for(const key of ["completed","archived"] as const) if(typeof req.body[key]==="boolean") patch[key]=req.body[key];
  if("reminderAt" in req.body) {
    patch.reminderAt=req.body.reminderAt?new Date(req.body.reminderAt):null;
    if(patch.reminderAt && !Number.isFinite(+patch.reminderAt)) throw new HttpError(400,"Invalid reminder time.");
  }
  const [t]=await db.update(tasks).set(patch).where(and(eq(tasks.id,uuid(req.params.id)),eq(tasks.userId,currentUser(res).id))).returning();
  if(!t) throw new HttpError(404,"Task unavailable.");res.json(t);
}));
api.get("/call-log",route(async(_req,res)=>{
  const u=currentUser(res);
  const rows=await db.select({c:calls,r:conversations,n:notes.id}).from(calls).innerJoin(conversations,eq(conversations.id,calls.conversationId)).innerJoin(participants,and(eq(participants.conversationId,conversations.id),eq(participants.userId,u.id))).leftJoin(notes,and(eq(notes.callSessionId,calls.id),eq(notes.userId,u.id))).orderBy(desc(calls.createdAt)).limit(100);
  res.json(rows.map(({c,r,n})=>({id:c.id,roomId:r.roomKey,title:r.title||c.participantSnapshotJson.find(p=>p.id!==u.id)?.name||"Call",isGroup:r.isGroup,participants:c.participantSnapshotJson,languages:[...new Set(c.participantSnapshotJson.map(p=>p.language))],startedAt:c.startedAt,durationSeconds:c.durationSec||0,status:c.connectedAt?"completed":c.status==="ended"?"cancelled":"missed",noteId:n})));
}));

