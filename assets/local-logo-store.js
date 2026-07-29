(function () {
  "use strict";

  const DB_NAME = "pepslive-local-logo-v1";
  const DB_VERSION = 1;
  const ASSET_STORE = "assets";
  const META_STORE = "meta";
  const MAX_SOURCE_FILES = 500;
  const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
  const MAX_SOURCE_PIXELS = 40_000_000;
  const MAX_THUMBNAIL_BYTES = 52000;
  const IMAGE_NAME = /\.(png|jpe?g|webp|svg|gif)$/i;

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("indexeddb_unavailable"));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(ASSET_STORE)) {
          database.createObjectStore(ASSET_STORE, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(META_STORE)) {
          database.createObjectStore(META_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("indexeddb_open_failed"));
    });
  }

  async function databaseTransaction(storeNames, mode, operation) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeNames, mode);
      let result;
      try {
        result = operation(transaction);
      } catch (error) {
        database.close();
        reject(error);
        return;
      }
      transaction.oncomplete = () => {
        database.close();
        resolve(result);
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error || new Error("indexeddb_transaction_failed"));
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error || new Error("indexeddb_transaction_aborted"));
      };
    });
  }

  function requestValue(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("indexeddb_request_failed"));
    });
  }

  async function getMeta(key) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(META_STORE, "readonly");
      const record = await requestValue(transaction.objectStore(META_STORE).get(key));
      return record ? record.value : null;
    } finally {
      database.close();
    }
  }

  async function setMeta(key, value) {
    await databaseTransaction([META_STORE], "readwrite", (transaction) => {
      transaction.objectStore(META_STORE).put({ key, value });
    });
  }

  function imageDimensionsFromBytes(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const ascii = (offset, length) => String.fromCharCode(...bytes.slice(offset, offset + length));
    if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(1, 3) === "PNG") {
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (bytes.length >= 10 && /^GIF8[79]a$/.test(ascii(0, 6))) {
      return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
    }
    if (bytes.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
      const chunk = ascii(12, 4);
      if (chunk === "VP8X") {
        const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
        const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
        return { width, height };
      }
      if (chunk === "VP8L" && bytes[20] === 0x2f) {
        return {
          width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
          height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10)
        };
      }
      if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
        return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
      }
    }
    if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      let offset = 2;
      const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
      while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = bytes[offset + 1];
        if (sof.has(marker)) {
          return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
        }
        if (marker === 0xd8 || marker === 0xd9) {
          offset += 2;
          continue;
        }
        const length = view.getUint16(offset + 2);
        if (length < 2) break;
        offset += length + 2;
      }
    }
    return null;
  }

  async function preflightImageDimensions(file) {
    if (/\.svg$/i.test(file.name || "") || file.type === "image/svg+xml") {
      const source = await file.slice(0, Math.min(file.size, 1024 * 1024)).text();
      const svg = source.match(/<svg\b[^>]*>/i)?.[0] || "";
      const viewBox = svg.match(/\bviewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
      const width = Number.parseFloat(svg.match(/\bwidth\s*=\s*["']\s*([\d.]+)/i)?.[1] || viewBox?.[1] || "300");
      const height = Number.parseFloat(svg.match(/\bheight\s*=\s*["']\s*([\d.]+)/i)?.[1] || viewBox?.[2] || "150");
      return { width, height };
    }
    let header = new Uint8Array(await file.slice(0, Math.min(file.size, 512 * 1024)).arrayBuffer());
    let dimensions = imageDimensionsFromBytes(header);
    if (!dimensions && header[0] === 0xff && header[1] === 0xd8 && file.size > header.length) {
      header = new Uint8Array(await file.arrayBuffer());
      dimensions = imageDimensionsFromBytes(header);
    }
    return dimensions;
  }

  async function decodeImage(file, dimensions) {
    if (typeof createImageBitmap === "function") {
      try {
        const largest = Math.max(Number(dimensions?.width || 0), Number(dimensions?.height || 0));
        const scale = largest > 256 ? 256 / largest : 1;
        const options = largest
          ? {
              resizeWidth: Math.max(1, Math.round(dimensions.width * scale)),
              resizeHeight: Math.max(1, Math.round(dimensions.height * scale)),
              resizeQuality: "high"
            }
          : undefined;
        const bitmap = options ? await createImageBitmap(file, options) : await createImageBitmap(file);
        return {
          width: bitmap.width,
          height: bitmap.height,
          draw(context, width, height) {
            context.drawImage(bitmap, 0, 0, width, height);
          },
          close() {
            if (typeof bitmap.close === "function") bitmap.close();
          }
        };
      } catch (_) {}
    }

    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
        draw(context, width, height) {
          context.drawImage(image, 0, 0, width, height);
        },
        close() {
          URL.revokeObjectURL(url);
        }
      });
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("logo_decode_failed"));
      };
      image.src = url;
    });
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  async function thumbnailRecord(file, relativePath) {
    if (Number(file?.size || 0) > MAX_SOURCE_BYTES) throw new Error("logo_source_too_large");
    const dimensions = await preflightImageDimensions(file);
    if (!dimensions) throw new Error("logo_dimensions_unreadable");
    if (dimensions && (!dimensions.width || !dimensions.height)) throw new Error("logo_dimensions_invalid");
    if (dimensions && dimensions.width * dimensions.height > MAX_SOURCE_PIXELS) throw new Error("logo_dimensions_too_large");
    const decoded = await decodeImage(file, dimensions);
    try {
      if (!decoded.width || !decoded.height) throw new Error("logo_dimensions_invalid");
      if (decoded.width * decoded.height > MAX_SOURCE_PIXELS) throw new Error("logo_dimensions_too_large");
      let edge = 256;
      let quality = 0.86;
      let blob = null;
      let width = 0;
      let height = 0;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const scale = Math.min(1, edge / Math.max(decoded.width, decoded.height));
        width = Math.max(1, Math.round(decoded.width * scale));
        height = Math.max(1, Math.round(decoded.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: true });
        if (!context) throw new Error("logo_canvas_unavailable");
        context.clearRect(0, 0, width, height);
        decoded.draw(context, width, height);
        blob = await canvasBlob(canvas, "image/webp", quality);
        if (!blob) blob = await canvasBlob(canvas, "image/png");
        if (blob && blob.size <= MAX_THUMBNAIL_BYTES) break;
        edge = Math.max(96, Math.round(edge * 0.78));
        quality = Math.max(0.62, quality - 0.08);
      }

      if (!blob || blob.size > MAX_THUMBNAIL_BYTES) throw new Error("logo_thumbnail_too_large");
      const thumbnail = new File([blob], file.name, {
        type: blob.type || "image/webp",
        lastModified: Number(file.lastModified || Date.now())
      });
      return {
        id: String(relativePath || file.name).toLocaleLowerCase("en-US"),
        name: String(file.name || "logo"),
        relativePath: String(relativePath || file.name),
        type: thumbnail.type,
        width,
        height,
        bytes: thumbnail.size,
        file: thumbnail
      };
    } finally {
      decoded.close();
    }
  }

  async function buildRecords(files) {
    const records = [];
    const rejected = [];
    const candidates = Array.from(files || []).filter((entry) => {
      const file = entry && entry.file ? entry.file : entry;
      return Boolean(file && (String(file.type || "").startsWith("image/") || IMAGE_NAME.test(file.name || "")));
    }).slice(0, MAX_SOURCE_FILES);
    for (const entry of candidates) {
      const file = entry && entry.file ? entry.file : entry;
      const relativePath = String(entry?.relativePath || file?._pepsRelativePath || file?.webkitRelativePath || file?.name || "");
      try {
        records.push(await thumbnailRecord(file, relativePath));
      } catch (error) {
        rejected.push({ name: String(file.name || relativePath), error: String(error?.message || error) });
      }
    }
    return { records, rejected };
  }

  function filesFromRecords(records) {
    return (records || []).map((record) => {
      const file = record.file instanceof File
        ? record.file
        : new File([record.file], record.name, { type: record.type || record.file?.type || "image/webp" });
      try {
        Object.defineProperty(file, "_pepsRelativePath", {
          configurable: true,
          enumerable: false,
          value: record.relativePath || record.name
        });
        Object.defineProperty(file, "_pepsLogoBytes", {
          configurable: true,
          enumerable: false,
          value: Number(record.bytes || file.size || 0)
        });
      } catch (_) {}
      return file;
    });
  }

  async function replaceRecords(records, metadata = {}) {
    await databaseTransaction([ASSET_STORE, META_STORE], "readwrite", (transaction) => {
      const assetStore = transaction.objectStore(ASSET_STORE);
      const metaStore = transaction.objectStore(META_STORE);
      assetStore.clear();
      for (const record of records) assetStore.put(record);
      metaStore.put({ key: "catalog", value: {
        folderName: String(metadata.folderName || ""),
        source: String(metadata.source || "picker"),
        count: records.length,
        rejectedCount: Number(metadata.rejectedCount || 0),
        updatedAt: Date.now()
      } });
      if (metadata.directoryHandle) {
        metaStore.put({ key: "directoryHandle", value: metadata.directoryHandle });
      } else if (metadata.clearDirectoryHandle) {
        metaStore.delete("directoryHandle");
      }
    });
  }

  async function readRecords() {
    const database = await openDatabase();
    try {
      const transaction = database.transaction([ASSET_STORE, META_STORE], "readonly");
      const recordsRequest = requestValue(transaction.objectStore(ASSET_STORE).getAll());
      const catalogRequest = requestValue(transaction.objectStore(META_STORE).get("catalog"));
      const [records, catalog] = await Promise.all([recordsRequest, catalogRequest]);
      return {
        files: filesFromRecords(records),
        metadata: catalog?.value || { folderName: "", source: "", count: records.length, rejectedCount: 0 }
      };
    } finally {
      database.close();
    }
  }

  async function collectDirectoryFiles(directoryHandle) {
    const files = [];
    async function walk(handle, prefix, depth) {
      if (depth > 4 || files.length >= MAX_SOURCE_FILES) return;
      for await (const entry of handle.values()) {
        if (files.length >= MAX_SOURCE_FILES) break;
        if (entry.kind === "directory") {
          await walk(entry, `${prefix}${entry.name}/`, depth + 1);
        } else if (entry.kind === "file" && IMAGE_NAME.test(entry.name)) {
          files.push({ file: await entry.getFile(), relativePath: `${prefix}${entry.name}` });
        }
      }
    }
    await walk(directoryHandle, `${directoryHandle.name}/`, 0);
    return files;
  }

  async function scanHandle(directoryHandle) {
    const sourceFiles = await collectDirectoryFiles(directoryHandle);
    const built = await buildRecords(sourceFiles);
    if (!built.records.length) throw new Error("logo_folder_has_no_valid_images");
    await replaceRecords(built.records, {
      folderName: directoryHandle.name,
      source: "directory-handle",
      rejectedCount: built.rejected.length,
      directoryHandle
    });
    return {
      files: filesFromRecords(built.records),
      folderName: directoryHandle.name,
      rejected: built.rejected,
      persistent: true
    };
  }

  async function pickDirectory() {
    if (typeof window.showDirectoryPicker !== "function") return null;
    const handle = await window.showDirectoryPicker({ mode: "read", id: "pepslive-logos" });
    return scanHandle(handle);
  }

  async function cacheFileList(fileList) {
    const files = Array.from(fileList || []);
    const firstPath = String(files[0]?.webkitRelativePath || files[0]?.name || "");
    const folderName = firstPath.includes("/") ? firstPath.split("/")[0] : "Local logos";
    const built = await buildRecords(files);
    if (!built.records.length) throw new Error("logo_folder_has_no_valid_images");
    await replaceRecords(built.records, {
      folderName,
      source: "folder-input",
      rejectedCount: built.rejected.length,
      clearDirectoryHandle: true
    });
    return {
      files: filesFromRecords(built.records),
      folderName,
      rejected: built.rejected,
      persistent: true
    };
  }

  async function reconnect() {
    const handle = await getMeta("directoryHandle");
    if (!handle || typeof handle.requestPermission !== "function") return null;
    const permission = await handle.requestPermission({ mode: "read" });
    if (permission !== "granted") throw new Error("logo_folder_permission_denied");
    return scanHandle(handle);
  }

  async function restore() {
    try {
      return await readRecords();
    } catch (_) {
      return { files: [], metadata: { folderName: "", source: "", count: 0, rejectedCount: 0 } };
    }
  }

  async function forget() {
    await databaseTransaction([ASSET_STORE, META_STORE], "readwrite", (transaction) => {
      transaction.objectStore(ASSET_STORE).clear();
      transaction.objectStore(META_STORE).clear();
    });
  }

  window.PepsLiveLocalLogoStore = Object.freeze({
    supported: () => Boolean(window.indexedDB),
    directoryPickerSupported: () => typeof window.showDirectoryPicker === "function",
    pickDirectory,
    cacheFileList,
    reconnect,
    restore,
    forget
  });
})();
