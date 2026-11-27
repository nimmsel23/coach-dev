import { marked } from 'marked'
import DOMPurify from 'dompurify'

export function renderMarkdown(value) {
  return DOMPurify.sanitize(marked.parse(String(value || ''), { gfm: true }), {
    USE_PROFILES: { html: true },
    FORBID_ATTR: ['style', 'id', 'name'],
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'img'],
  })
}
