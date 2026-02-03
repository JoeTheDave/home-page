import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

// Get values dynamically to avoid caching before env is loaded
function getConfig() {
  return {
    BUCKET_NAME: process.env.AWS_S3_BUCKET || "",
    AWS_REGION: process.env.AWS_REGION || "us-east-1",
  };
}

// Create S3 client lazily to ensure env vars are loaded
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const { AWS_REGION } = getConfig();
    s3Client = new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });
  }
  return s3Client;
}

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

  const { BUCKET_NAME } = getConfig();
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
  });

  await getS3Client().send(command);

  // Construct the public URL using the regional endpoint format
  const { AWS_REGION } = getConfig();
  const url = `https://${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`;

  return { url, key };
}

/**
 * Delete a file from S3 (optional - for cleanup)
 */
export async function deleteFromS3(key: string): Promise<void> {
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");

  const { BUCKET_NAME } = getConfig();
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await getS3Client().send(command);
}
