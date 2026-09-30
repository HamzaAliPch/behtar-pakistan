export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function addReportPhotos(existing: File[], incoming: File[]): { files: File[]; errors: string[] } {
  const files = [...existing], errors: string[] = [];
  for (const file of incoming) {
    if (files.length >= MAX_PHOTOS) { errors.push("You can attach up to five photos. Remove one before adding another."); continue; }
    if (!TYPES.has(file.type)) { errors.push(`${file.name}: use JPEG, PNG or WebP.`); continue; }
    if (file.size === 0 || file.size > MAX_PHOTO_BYTES) { errors.push(`${file.name}: each original image must be 5 MB or less.`); continue; }
    files.push(file);
  }
  return { files, errors };
}

export function removeReportPhoto(files: File[], index: number): File[] {
  return files.filter((_, position) => position !== index);
}
