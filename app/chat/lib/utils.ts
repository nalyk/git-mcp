import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getRepoData(url: string): {
  namespace: string | null;
  project: string | null;
} {
  // Handle simple namespace/project format
  if (!url.includes("/") && !url.includes(".")) {
    return { namespace: null, project: null };
  }

  // Remove protocol if present
  const urlWithoutProtocol = url.replace(/^https?:\/\//, "");

  // Different URL patterns
  const patterns = [
    // gitlab.com/namespace/project
    /^(?:www\.)?github\.com\/([^\/]+)\/([^\/]+)/,
    // namespace.gitlab.io/project
    /^(?:www\.)?([^\/]+)\.github\.io\/([^\/]+)/,
    // gitmcp.io/namespace/project
    /^(?:www\.)?gitmcp\.io\/([^\/]+)\/([^\/]+)/,
    // namespace.gitmcp.io/project
    /^(?:www\.)?([^\/]+)\.gitmcp\.io\/([^\/]+)/,
    // namespace.gitmcp.io
    /^(?:www\.)?([^\/]+)\.gitmcp\.io/,
    // namespace.gitlab.io
    /^(?:www\.)?([^\/]+)\.github\.io/,
    // gitmcp.io/docs
    /^(?:www\.)?gitmcp\.io\/(docs)/,
    // Simple namespace/project format
    /^([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = urlWithoutProtocol.match(pattern);
    if (match) {
      return { namespace: match[1], project: match[2] };
    }
  }

  // Default fallback
  return { namespace: null, project: null };
}
