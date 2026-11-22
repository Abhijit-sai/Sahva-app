import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
const client = new S3Client({region:process.env.AWS_REGION});
function bucket() {
  if (!process.env.AWS_S3_BUCKET) throw new Error("AWS_S3_BUCKET is required");
  return process.env.AWS_S3_BUCKET;
}
export async function uploadMedia(key:string, body:Buffer, mime:string) {
  await client.send(new PutObjectCommand({Bucket:bucket(),Key:key,Body:body,ContentType:mime}));
  return key;
}
export function mediaUrl(key:string, download=false) {
  return getSignedUrl(client,new GetObjectCommand({Bucket:bucket(),Key:key,ResponseContentDisposition:download ? 'attachment' : 'inline'}),{expiresIn:900});
}

