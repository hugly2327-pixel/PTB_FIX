export type TemplatePresetRecord = {
  name: string;
  png: Blob;
  size: [number, number];
  slots: unknown[];
  updatedAt: number;
};

const DB_NAME = "lh-ptb-template-library-v4";
const STORE = "templates";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "name" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, payload] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/png";
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Unable to read template"));
    reader.readAsDataURL(blob);
  });
}

export async function listTemplatePresets(): Promise<string[]> {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).getAllKeys();
      request.onsuccess = () => resolve((request.result as string[]).sort((a, b) => a.localeCompare(b)));
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function saveTemplatePreset(record: Omit<TemplatePresetRecord, "png" | "updatedAt"> & { png: string }): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({
        ...record,
        png: dataUrlToBlob(record.png),
        updatedAt: Date.now(),
      } satisfies TemplatePresetRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Template save aborted"));
    });
  } finally { db.close(); }
}

export async function getTemplatePreset(name: string): Promise<TemplatePresetRecord | undefined> {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(name);
      request.onsuccess = () => resolve(request.result as TemplatePresetRecord | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function deleteTemplatePreset(name: string): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
