/**
 * GitLab API client with rate limiting support
 * This file contains utilities for making GitLab API requests with proper rate limiting handling
 * Supports both gitlab.com and self-hosted GitLab instances
 */

import { constructGitlabUrl } from "./gitlab";

// Default time between API requests in ms (to avoid hitting rate limits)
const DEFAULT_DELAY = 1000;
// Default number of retries for rate-limited requests
const MAX_RETRIES = 3;

/**
 * Extract repository context from a GitLab URL
 * This helps provide context for analytics metrics
 */
function extractRepoContextFromUrl(url: string): string {
  try {
    // Handle GitLab raw URLs: gitlab.com/{namespace}/{project}/-/raw/
    if (url.includes("/-/raw/")) {
      const match = url.match(/([^\/]+)\/([^\/]+)\/-\/raw\//);
      if (match) {
        return `${match[1]}/${match[2]}`;
      }
    }

    // Handle GitLab API URLs: gitlab.com/api/v4/projects/
    if (url.includes("/api/v4/projects/")) {
      const match = url.match(/\/api\/v4\/projects\/([^\/]+)/);
      if (match) {
        return decodeURIComponent(match[1]).replace(/%2F/g, "/");
      }
    }

    // Handle GitLab search URLs with scope parameter
    if (url.includes("/api/v4/projects/") && url.includes("search")) {
      const match = url.match(/\/api\/v4\/projects\/([^\/]+)/);
      if (match) {
        return decodeURIComponent(match[1]).replace(/%2F/g, "/");
      }
    }

    return "unknown/unknown";
  } catch (error) {
    console.error(`Error extracting repo context from URL: ${error}`);
    return "error/extracting";
  }
}

/**
 * Rate limiting state tracking
 */
interface RateLimitInfo {
  remaining: number;
  resetTime: Date | null;
  limit: number;
}

// Store rate limit information
let apiRateLimit: RateLimitInfo = {
  remaining: 2000, // GitLab default for authenticated requests
  resetTime: null,
  limit: 2000,
};

/**
 * Update rate limit information from GitLab API response headers
 * GitLab uses different header names than GitHub
 */
function updateRateLimitFromHeaders(headers: Headers): void {
  const remaining = headers.get("ratelimit-remaining");
  const resetTime = headers.get("ratelimit-reset");
  const limit = headers.get("ratelimit-limit");

  if (remaining) {
    apiRateLimit.remaining = parseInt(remaining, 10);
  }

  if (resetTime) {
    apiRateLimit.resetTime = new Date(parseInt(resetTime, 10) * 1000);
  }

  if (limit) {
    apiRateLimit.limit = parseInt(limit, 10);
  }

  console.log(
    `GitLab API rate limit: ${apiRateLimit.remaining}/${apiRateLimit.limit} remaining, resets at ${apiRateLimit.resetTime}`,
  );
}

/**
 * Delay execution to respect rate limits
 */
async function respectRateLimits(): Promise<void> {
  // If we have very few requests remaining, add delay
  if (apiRateLimit.remaining < 5 && apiRateLimit.resetTime) {
    const timeUntilReset = apiRateLimit.resetTime.getTime() - Date.now();

    // If reset time is in the future, delay until reset
    if (timeUntilReset > 0) {
      console.log(
        `Rate limit low (${apiRateLimit.remaining} remaining). Waiting ${timeUntilReset}ms until reset`,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(timeUntilReset + 1000, 60000)),
      ); // Max 1 minute wait
    }
  } else {
    // Add a small delay between requests to avoid hitting rate limits
    await new Promise((resolve) => setTimeout(resolve, DEFAULT_DELAY));
  }
}

/**
 * Get the GitLab API base URL from environment or use default
 */
function getGitLabApiBaseUrl(env: CloudflareEnvironment): string {
  return env.GITLAB_API_BASE_URL || "https://gitlab.com/api/v4";
}

/**
 * Get the GitLab instance base URL (without /api/v4)
 */
function getGitLabBaseUrl(env: CloudflareEnvironment): string {
  const apiBaseUrl = getGitLabApiBaseUrl(env);
  return apiBaseUrl.replace("/api/v4", "");
}

/**
 * Make a GitLab API request with rate limit handling
 * @param url - API URL to fetch
 * @param options - Fetch options
 * @param env - Environment containing GitLab token if available
 * @param retryCount - Current retry attempt (used internally)
 * @param useAuth - Whether to include authorization header if token is available (default: true)
 * @returns The API response or null if failed
 */
export async function gitlabApiRequest(
  url: string,
  options: RequestInit = {},
  env: CloudflareEnvironment,
  retryCount = 0,
  useAuth = true,
): Promise<Response | null> {
  try {
    // Extract repository context for metrics
    const repoContext = extractRepoContextFromUrl(url);

    // Track GitLab query count using Cloudflare analytics
    if (env?.CLOUDFLARE_ANALYTICS && retryCount === 0) {
      env.CLOUDFLARE_ANALYTICS.writeDataPoint({
        blobs: [url, repoContext],
        doubles: [1],
        indexes: ["gitlab_api_request"],
      });
    }

    // Wait for rate limit if necessary
    await respectRateLimits();

    // Add GitLab authentication if token is available and useAuth is true
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");
    headers.set(
      "User-Agent",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    );

    // GitLab uses PRIVATE-TOKEN header instead of Authorization
    if (useAuth && env.GITLAB_TOKEN) {
      headers.set("PRIVATE-TOKEN", env.GITLAB_TOKEN);
    }

    // Configure Cloudflare's tiered cache
    const cfCacheOptions = {
      cacheEverything: true,
      cacheTtlByStatus: {
        "200-299": 3600, // Cache successful responses for 1 hour
        "404": 60, // Cache "Not Found" responses for 60 seconds
        "500-599": 0, // Do not cache server error responses
      },
    };

    // Make the request with tiered cache
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: "omit", // Avoid CORS issues
      cf: cfCacheOptions, // Use Cloudflare's tiered cache
    });

    // Update rate limit info from response headers
    updateRateLimitFromHeaders(response.headers);

    // Handle rate limiting (status 429 for GitLab)
    if (response.status === 429) {
      const responseBody = await response.text();

      console.warn(`GitLab API rate limit exceeded`);

      // Track rate-limited requests with repository context using Cloudflare analytics
      if (env?.CLOUDFLARE_ANALYTICS) {
        const repoContext = extractRepoContextFromUrl(url);
        env.CLOUDFLARE_ANALYTICS.writeDataPoint({
          blobs: [url, repoContext, responseBody.substring(0, 100)], // First 100 chars of error message
          doubles: [1, retryCount],
          indexes: ["gitlab_rate_limited_request"],
        });
      }

      // If we haven't retried too many times, wait and retry
      if (retryCount < MAX_RETRIES) {
        // Calculate wait time (default: wait 60 seconds for rate limits to refresh)
        const waitTime = apiRateLimit.resetTime
          ? Math.max(
              1000,
              apiRateLimit.resetTime.getTime() - Date.now() + 1000,
            )
          : 60000;

        console.log(
          `Rate limited. Waiting ${waitTime}ms before retry ${retryCount + 1}/${MAX_RETRIES}`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));

        // Retry the request
        return gitlabApiRequest(url, options, env, retryCount + 1);
      }
    }

    return response;
  } catch (error) {
    console.error(`GitLab API request to ${url} failed: ${error}`);

    // Retry on network errors
    if (retryCount < MAX_RETRIES) {
      console.log(
        `Network error. Retrying ${retryCount + 1}/${MAX_RETRIES}...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
      return gitlabApiRequest(url, options, env, retryCount + 1);
    }

    return null;
  }
}

/**
 * Encode project path for GitLab API (namespace/project)
 */
function encodeProjectPath(namespace: string, project: string): string {
  return encodeURIComponent(`${namespace}/${project}`);
}

/**
 * Search for code in a GitLab repository
 * @param query - Search query
 * @param namespace - Repository namespace (can be nested like group/subgroup)
 * @param project - Project name
 * @param env - Environment for GitLab token
 * @param page - Page number (1-indexed)
 * @param perPage - Results per page (max 100)
 */
export async function searchCode(
  query: string,
  namespace: string,
  project: string,
  env: Env,
  page: number = 1,
  perPage: number = 20,
): Promise<any> {
  const baseUrl = getGitLabApiBaseUrl(env);
  const projectPath = encodeProjectPath(namespace, project);

  // GitLab API has a max per_page of 100
  const validPerPage = Math.min(Math.max(1, perPage), 100);

  // GitLab search API: /projects/{id}/search?scope=blobs&search={query}
  const searchUrl = `${baseUrl}/projects/${projectPath}/search?scope=blobs&search=${encodeURIComponent(query)}&page=${page}&per_page=${validPerPage}`;

  const response = await gitlabApiRequest(searchUrl, {}, env);

  if (!response || !response.ok) {
    console.warn(
      `GitLab API code search failed: ${response?.status} ${response?.statusText}`,
    );
    return null;
  }

  const results = await response.json();

  // Transform GitLab response to match GitHub-like structure for compatibility
  return {
    total_count: results.length, // GitLab doesn't provide total count in search
    items: results.map((item: any) => ({
      path: item.path || item.filename,
      html_url: item.project_id ? `${getGitLabBaseUrl(env)}/${namespace}/${project}/-/blob/${item.ref || 'main'}/${item.path || item.filename}` : undefined,
      repository: {
        full_name: `${namespace}/${project}`,
      },
    })),
  };
}

/**
 * Search for a specific filename in a GitLab repository
 * @param filename - Filename to search for
 * @param namespace - Repository namespace
 * @param project - Project name
 * @param env - Environment for GitLab token
 */
export async function searchFileByName(
  filename: string,
  namespace: string,
  project: string,
  env: Env,
): Promise<any> {
  const baseUrl = getGitLabApiBaseUrl(env);
  const projectPath = encodeProjectPath(namespace, project);

  // Use GitLab's search API with filename
  const searchUrl = `${baseUrl}/projects/${projectPath}/search?scope=blobs&search=${encodeURIComponent(filename)}`;
  const response = await gitlabApiRequest(searchUrl, {}, env);

  if (!response || !response.ok) {
    console.warn(
      `GitLab API filename search failed: ${response?.status} ${response?.statusText}`,
    );
    return null;
  }

  const results = await response.json();

  // Filter results to only include exact filename matches
  const exactMatches = results.filter((item: any) => {
    const itemFilename = item.filename || item.path?.split('/').pop();
    return itemFilename === filename;
  });

  // Transform to GitHub-like structure
  return {
    total_count: exactMatches.length,
    items: exactMatches.map((item: any) => ({
      path: item.path || item.filename,
      html_url: item.project_id ? `${getGitLabBaseUrl(env)}/${namespace}/${project}/-/blob/${item.ref || 'main'}/${item.path || item.filename}` : undefined,
      repository: {
        full_name: `${namespace}/${project}`,
      },
    })),
  };
}

/**
 * Fetch raw file content from GitLab
 * @param namespace - Repository namespace
 * @param project - Project name
 * @param branch - Branch name
 * @param path - File path
 * @param env - Environment for GitLab token
 * @param useAuth - Whether to use authentication
 */
export async function fetchRawFile(
  namespace: string,
  project: string,
  branch: string,
  path: string,
  env: Env,
  useAuth = false,
): Promise<string | null> {
  const url = constructGitlabUrl(namespace, project, branch, path, env);

  // GitLab raw content may need authentication for private repos
  const response = await gitlabApiRequest(url, {}, env, 0, useAuth);

  if (!response || !response.ok) {
    return null;
  }

  return response.text();
}

// Export helper functions for use in other modules
export { getGitLabApiBaseUrl, getGitLabBaseUrl };
