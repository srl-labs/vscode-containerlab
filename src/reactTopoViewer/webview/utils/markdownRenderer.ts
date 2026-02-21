/**
 * Markdown renderer utility for React TopoViewer
 * Uses markdown-it with syntax highlighting and emoji support
 */
import MarkdownIt from "markdown-it";
import { full as markdownItEmoji } from "markdown-it-emoji";
import hljs from "highlight.js";
import DOMPurify from "dompurify";

/**
 * Escape HTML entities for safe display
 */
function escapeHtml(text: string): string {
  const escapeMap: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };
  return text.replace(/[&<>"']/g, (char) => escapeMap[char] || char);
}

/**
 * Configured markdown-it instance with:
 * - Syntax highlighting via highlight.js
 * - Emoji support via markdown-it-emoji
 * - Security: HTML disabled, linkify enabled
 */
const markdownRenderer = new MarkdownIt({
  html: false, // Disable raw HTML for security
  linkify: true, // Auto-convert URLs to links
  typographer: true, // Smart quotes and dashes
  breaks: false, // Don't convert \n to <br> (like GitHub)
  langPrefix: "hljs language-",
  highlight(code: string, lang: string): string {
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    } catch {
      return escapeHtml(code);
    }
  }
}).use(markdownItEmoji);

/**
 * Post-process HTML to fix common markdown rendering issues
 * - Merges consecutive badge/image paragraphs into single line (like GitHub)
 * - Removes paragraph wrappers inside list items (fixes bullet alignment)
 */
function postProcessHtml(html: string): string {
  let result = html;

  // 1. Merge consecutive paragraphs containing only image links (badges)
  // Match: </a></p> + any whitespace + <p><a (with or without space before href)
  result = result.replace(/<\/a><\/p>\s*<p><a(?=\s|>)/g, "</a> <a");

  // 2. Remove <p> tags wrapping list item content to fix bullet alignment
  // <li><p>content</p></li> -> <li>content</li>
  result = result.replace(/<li>\s*<p>/g, "<li>");
  result = result.replace(/<\/p>\s*<\/li>/g, "</li>");

  // 3. For list items with multiple paragraphs, replace intermediate </p><p> with <br>
  result = result.replace(/<li>([\s\S]*?)<\/li>/g, (match) => {
    return match.replace(/<\/p>\s*<p>/g, "<br>");
  });

  return result;
}

/**
 * Render markdown text to sanitized HTML
 * @param text - Raw markdown text
 * @returns Sanitized HTML string
 */
export function renderMarkdown(text: string): string {
  if (text.trim().length === 0) {
    return "";
  }
  const rendered = markdownRenderer.render(text);
  const processed = postProcessHtml(rendered);
  return DOMPurify.sanitize(processed);
}
