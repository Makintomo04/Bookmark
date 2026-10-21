// Some in-app browsers and webviews refuse the async clipboard; the old selection copy still works there.
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const field = document.createElement("textarea")
    field.value = text
    field.setAttribute("readonly", "")
    field.style.position = "fixed"
    field.style.opacity = "0"
    document.body.appendChild(field)
    field.select()
    const ok = document.execCommand("copy")
    field.remove()
    if (!ok) throw new Error("copy failed")
  }
}
