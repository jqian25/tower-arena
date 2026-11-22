export const htmlToDom = (html: string) => {
  const templateDom = document.createElement('template')
  templateDom.innerHTML = html
  window.document.body.appendChild(templateDom.content)
}

// iPadOS reports a Macintosh user agent and a fine pointer, but it still has touch points.
export const isMobile =
  navigator.maxTouchPoints > 0 ||
  window.matchMedia('(pointer: coarse)').matches ||
  /Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent)

if (isMobile) document.documentElement.classList.add('touch-device')
