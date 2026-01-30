import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
  forcePathStyle: false, // Use virtual-hosted-style URLs
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET || "";

export interface UploadResult {
  url: string;
  key: string;
}

/**
 * Upload a file to S3
 */
export async function uploadToS3(
  buffer: Buffer,
  mimetype: string,
  originalName: string,
  userEmail: string,
): Promise<UploadResult> {
  // Determine environment folder (dev or prod)
  const env = process.env.NODE_ENV === "production" ? "prod" : "dev";

  // Generate unique filename
  const ext = originalName.split(".").pop();
  const filename = `${randomUUID()}.${ext}`;

  // Organize by: env/user-email/filename
  const key = `${env}/${userEmail}/${filename}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
  });

  await s3Client.send(command);

  // Construct the public URL using the regional endpoint format
  const region = process.env.AWS_REGION || "us-east-1";
  const url =
    region === "us-east-1"
      ? `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`
      : `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${key}`;

  return { url, key };
}

/**
 * Delete a file from S3 (optional - for cleanup)
 */
export async function deleteFromS3(key: string): Promise<void> {
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");

  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
}
