export function renderMarkdown(source: string): string {
  const escaped = source
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const blocks = escaped.split(/```/);
  const rendered = blocks.map((block, i) => {
    if (i % 2 === 1) return `<pre><code>${block.replace(/^[a-z]*\n/, "")}</code></pre>`;
    return block
      .split(/\n{2,}/)
      .map((para) => {
        const lines = para.split("\n");
        if (lines.every((l) => /^\s*[-*] /.test(l) || l.trim() === "")) {
          const items = lines
            .filter((l) => l.trim())
            .map((l) => `<li>${inline(l.replace(/^\s*[-*] /, ""))}</li>`)
            .join("");
          return `<ul>${items}</ul>`;
        }
        return `<p>${lines.map(inline).join("<br>")}</p>`;
      })
      .join("");
  });
  return rendered.join("");
}

function inline(text: string): string {
  return text
    .replace(/^#{1,4}\s+(.*)$/, "<strong>$1</strong>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}
