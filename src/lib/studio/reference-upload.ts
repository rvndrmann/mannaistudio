/** Browser-side normalization keeps reference uploads compatible with image providers. */
export async function prepareReferenceUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || ["image/png", "image/jpeg", "image/webp"].includes(file.type)) return file
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement("canvas")
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Could not convert this reference image. Please upload PNG, JPEG or WebP.")
    context.drawImage(bitmap, 0, 0)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not convert this reference image.")), "image/png"))
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".png", { type: "image/png" })
  } finally { bitmap.close() }
}
