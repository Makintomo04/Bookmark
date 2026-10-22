import { useEffect, useState } from "react"
import { notify } from "@/lib/notify"
import { useUploadThing } from "@/utils/uploadthing"

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

// Uploads one image, showing the local file straight away so the preview doesn't wait on the network.
export default function useImageUpload(onDone: (url: string) => void) {
  const [preview, setPreview] = useState<string | null>(null)
  const { startUpload, isUploading } = useUploadThing("imageUploader", {
    onUploadError: (e) => notify.error(e.message || "Upload failed. Try another image."),
  })

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const upload = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      notify.error("Choose an image file.")
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      notify.error("That image is over 4MB.", { description: "Choose a smaller one." })
      return
    }
    setPreview(URL.createObjectURL(file))
    const res = await startUpload([file]).catch(() => undefined)
    if (res?.[0]?.url) onDone(res[0].url)
    setPreview(null)
  }

  return { upload, preview, isUploading }
}
