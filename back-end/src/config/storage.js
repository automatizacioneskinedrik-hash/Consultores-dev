import { Storage } from "@google-cloud/storage";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const BUCKET_NAME = process.env.GCS_BUCKET_NAME;

let storage;
let bucket;

if (BUCKET_NAME) {
  const storageOptions = {
    projectId: process.env.GCP_PROJECT_ID,
  };

  try {
    const serviceAccount = require("../../serviceAccountKey.json");
    storageOptions.credentials = serviceAccount;
    console.log("Storage: Usando serviceAccountKey.json local");
  } catch (err) {
    console.log("Storage: Usando Application Default Credentials del entorno");
  }

  storage = new Storage(storageOptions);
  bucket = storage.bucket(BUCKET_NAME);
} else {
  console.warn("ADVERTENCIA: GCS_BUCKET_NAME no detectado.");
}

export { storage, bucket, BUCKET_NAME };
