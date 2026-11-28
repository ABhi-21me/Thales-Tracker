/**
 * Derive a clean human-readable source label from a resource URL
 * without exposing raw URLs in the UI.
 */
export function getSourceLabel(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (host === 'docs.google.com') {
      if (path.includes('/presentation')) return 'Google Slides';
      if (path.includes('/document')) return 'Google Docs';
      if (path.includes('/spreadsheets')) return 'Google Sheets';
      return 'Google Docs';
    }

    if (host === 'drive.google.com') {
      if (path.includes('/folders')) return 'Drive folder';
      return 'Drive file';
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
      return 'YouTube';
    }

    return host || 'Link';
  } catch {
    return 'Link';
  }
}

/**
 * Strip markdown syntax (#, -, *, backticks, links) to plain text for list previews.
 */
export function stripMarkdownSyntax(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}
