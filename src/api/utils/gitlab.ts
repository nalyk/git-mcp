import { cacheFilePath, getCachedFilePath } from "./cache.js";
import {
  searchFileByName,
  gitlabApiRequest,
  fetchRawFile,
  getGitLabApiBaseUrl,
  getGitLabBaseUrl,
} from "./gitlabClient.js";

/**
 * Fetch file content from a specific path in a GitLab repository
 * @param namespace - Repository namespace (can be nested like group/subgroup)
 * @param project - Project name
 * @param branch - Branch name (main, master, etc.)
 * @param path - File path within the repository
 * @param env - Environment for GitLab token
 * @param useAuth - Whether to use authentication
 * @returns File content or null if not found
 */
export async function fetchFileFromGitLab(
  namespace: string,
  project: string,
  branch: string,
  path: string,
  env: Env,
  useAuth = false,
): Promise<string | null> {
  return await fetchRawFile(namespace, project, branch, path, env, useAuth);
}

export interface GitLabFile {
  path: string;
  content: string;
}

/**
 * Search for a file in a GitLab repository using the GitLab Search API
 */
export async function searchGitLabRepo(
  namespace: string,
  project: string,
  filename: string,
  branch: string,
  env: Env,
  ctx: ExecutionContext,
): Promise<GitLabFile | null> {
  try {
    const cachedFile = await getCachedFilePath(namespace, project, env);
    let filePath = cachedFile?.path || "";

    if (!filePath) {
      // Use the centralized GitLab client to search for the file
      const data = await searchFileByName(filename, namespace, project, env);

      // Handle search failure
      if (!data) {
        return null;
      }

      // Check if we found any matches
      if (data.total_count === 0 || !data.items || data.items.length === 0) {
        return null;
      }

      // Get the first matching file's path
      filePath = data.items[0]?.path;
    }

    const content = await fetchFileFromGitLab(
      namespace,
      project,
      branch,
      filePath,
      env,
    );

    if (content) {
      ctx.waitUntil(
        cacheFilePath(namespace, project, filename, filePath, branch, env),
      );
      return { content, path: filePath };
    }

    return null;
  } catch (error) {
    console.error(
      `Error searching GitLab repo ${namespace}/${project} for ${filename}:`,
      error,
    );
    return null;
  }
}

/**
 * Construct a GitLab raw file URL
 * Supports both gitlab.com and self-hosted instances
 */
export function constructGitlabUrl(
  namespace: string,
  project: string,
  branch: string,
  path: string,
  env?: CloudflareEnvironment,
) {
  const baseUrl = env ? getGitLabBaseUrl(env) : "https://gitlab.com";
  return `${baseUrl}/${namespace}/${project}/-/raw/${branch}/${path}`;
}

/**
 * Encode project path for GitLab API (namespace/project)
 */
function encodeProjectPath(namespace: string, project: string): string {
  return encodeURIComponent(`${namespace}/${project}`);
}

/**
 * Determines the default branch of a GitLab repository.
 * First tries to get the actual default branch using GitLab API,
 * then falls back to checking if 'main' or 'master' branches exist.
 *
 * @param namespace - Repository namespace (can be nested like group/subgroup)
 * @param project - Project name
 * @param env - Environment with API tokens and cache configuration
 * @returns The default branch name
 * @throws Error if the default branch cannot be determined
 */
export async function getRepoBranch(
  namespace: string,
  project: string,
  env: CloudflareEnvironment,
): Promise<string> {
  try {
    // First try to get the actual default branch using GitLab API
    const baseUrl = getGitLabApiBaseUrl(env);
    const projectPath = encodeProjectPath(namespace, project);
    const apiUrl = `${baseUrl}/projects/${projectPath}`;
    const response = await gitlabApiRequest(apiUrl, {}, env);

    if (response && response.ok) {
      const data = (await response.json()) as { default_branch?: string };
      if (data && data.default_branch) {
        console.log("Default branch found", data.default_branch);
        return data.default_branch;
      }
    }

    console.error(
      "No default branch found, falling back to main/master check",
      response,
    );

    // Fall back to the main/master check if API request fails
    // Try 'main' branch
    const mainUrl = constructGitlabUrl(namespace, project, "main", "README.md", env);
    const mainResponse = await gitlabApiRequest(
      mainUrl,
      { method: "HEAD" },
      env,
    );

    if (mainResponse && mainResponse.ok) {
      return "main";
    }

    // If 'main' branch doesn't exist, try 'master'
    const masterUrl = constructGitlabUrl(namespace, project, "master", "README.md", env);
    const masterResponse = await gitlabApiRequest(
      masterUrl,
      { method: "HEAD" },
      env,
    );

    if (masterResponse && masterResponse.ok) {
      return "master";
    }

    // If neither branch exists, throw an error
    throw new Error(
      `Could not determine default branch for ${namespace}/${project}. Neither 'main' nor 'master' branches found.`,
    );
  } catch (error) {
    console.error(
      `Error determining default branch for ${namespace}/${project}:`,
      error,
    );
    // Default to 'main' in case of network errors or other issues
    // This is a fallback to maintain compatibility with existing code
    return "main";
  }
}
