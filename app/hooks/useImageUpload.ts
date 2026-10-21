import { useEffect, useState } from "react"
import { toast } from "react-toastify"
import { useUploadThing } from "@/utils/uploadthing"

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

// Uploads one image, showing the local file straight away so the preview doesn't wait on the network.
export default function useImageUpload(onDone: (url: string) => void) {
  const [preview, setPreview] = useState<string | null>(null)
  const { startUpload, isUploading } = useUploadThing("imageUploader", {
    onUploadError: (e) => toast.error(e.message || "Upload failed. Try another image.", { position: "bottom-center" }),
  })

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const upload = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file.", { position: "bottom-center" })
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("That image is over 4MB. Choose a smaller one.", { position: "bottom-center" })
      return
    }
    setPreview(URL.createObjectURL(file))
    const res = await startUpload([file]).catch(() => undefined)
    if (res?.[0]?.url) onDone(res[0].url)
    setPreview(null)
  }

  return { upload, preview, isUploading }
}
