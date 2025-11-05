export type UrlType = "subdomain" | "gitlab" | "unknown";
export type MinimalRepoData = {
  namespace: string | null;
  project: string | null;
};

export type RepoData = MinimalRepoData & {
  host: string;
  urlType: UrlType;
};
export type RequestData = {
  requestHost: string;
  requestUrl?: string;
};
export type LogData = RepoData & RequestData;

export function getRepoData(requestData: RequestData): RepoData {
  const { requestHost, requestUrl } = requestData;

  // Parse the URL if provided
  const logData: LogData = {
    namespace: null,
    project: null,
    host: requestHost,
    urlType: "unknown",
    requestUrl,
    requestHost,
  };
  const protocol = requestHost.includes("localhost") ? "http" : "https";
  let fullUrl = new URL(`${protocol}://${requestHost}`);
  if (requestUrl) {
    if (requestUrl.startsWith("/")) {
      fullUrl = new URL(`${protocol}://${requestHost}${requestUrl}`);
    } else if (requestUrl.startsWith("http")) {
      fullUrl = new URL(requestUrl);
    } else {
      fullUrl = new URL(`${protocol}://${requestUrl}`);
    }
  }
  const path = fullUrl.pathname.split("/").filter(Boolean).join("/");

  // Check for subdomain pattern: {namespace}.gitmcp.io/{project}
  if (requestHost.includes(".gitmcp.io")) {
    const subdomain = requestHost.split(".")[0];
    logData.namespace = subdomain;
    logData.project = path;
    logData.urlType = "subdomain";
    log("getRepoDataLog", JSON.stringify(logData, null, 2));

    if (!subdomain && !path) {
      console.error("Invalid repository data:", logData);
      throw new Error(
        `Invalid repository data: ${JSON.stringify(logData, null, 2)}`,
      );
    }

    return {
      namespace: subdomain,
      project: path || null,
      host: requestHost,
      urlType: "subdomain",
    };
  }
  // Check for gitlab repo pattern: gitmcp.io/{namespace}/{project}, HOST_TEMP_URL/{namespace}/{project}
  // Note: GitLab supports nested namespaces (group/subgroup/project)
  // For simplicity, we'll treat the last segment as project and everything before as namespace
  else if (
    requestHost === "gitmcp.io" ||
    requestHost === HOST_TEMP_URL ||
    requestHost === "git-mcp.idosalomon.workers.dev" ||
    requestHost === "git.esempla.systems" ||
    requestHost.includes("localhost")
  ) {
    // Extract namespace/project from path
    // GitLab supports nested groups, so namespace can be multi-level
    const splitPath = path.split("/");

    // We need at least 2 segments for namespace/project
    if (splitPath.length < 2) {
      // Handle special case for docs
      const namespace = splitPath.at(0) ?? null;
      let project = null;

      // FIXME: this is a hack to support the chat page
      if (namespace == "docs") {
        project = null;
      }

      logData.namespace = namespace;
      logData.project = project;
      logData.urlType = "gitlab";
      log("getRepoDataLog", JSON.stringify(logData, null, 2));

      if (!namespace && !project) {
        console.error("Invalid repository data:", logData);
        throw new Error(
          `Invalid repository data: ${JSON.stringify(logData, null, 2)}`,
        );
      }

      return {
        namespace,
        project,
        host: requestHost,
        urlType: "gitlab",
      };
    }

    // Last segment is the project, everything before is the namespace
    const project = splitPath.pop() ?? null;
    const namespace = splitPath.join("/");

    logData.namespace = namespace;
    logData.project = project;
    logData.urlType = "gitlab";
    log("getRepoDataLog", JSON.stringify(logData, null, 2));

    if (!namespace && !project) {
      console.error("Invalid repository data:", logData);
      throw new Error(
        `Invalid repository data: ${JSON.stringify(logData, null, 2)}`,
      );
    }

    return {
      namespace,
      project,
      host: requestHost,
      urlType: "gitlab",
    };
  }

  logData.urlType = "unknown";
  log("getRepoDataLog", JSON.stringify(logData, null, 2));

  return {
    namespace: null,
    project: null,
    host: requestHost,
    urlType: "unknown",
  };
}

function log(...args: any[]) {
  console.log(...args);
}

export const HOST_TEMP_URL = "remote-mcp-server-cf.idosalomon.workers.dev";

export function getRepoDataFromUrl(url: string): MinimalRepoData {
  // Handle simple namespace/project format
  if (!url.includes("/") && !url.includes(".")) {
    return { namespace: null, project: null };
  }

  // Remove protocol if present
  const urlWithoutProtocol = url.replace(/^https?:\/\//, "");

  const urlReference = urlWithoutProtocol
    .replace(".gitlab.io", ".gitmcp.io")
    .replace(/^gitlab\.com/, "gitmcp.io")
    .replace(/^git\.esempla\.systems/, "gitmcp.io")
    .replace(HOST_TEMP_URL, "gitmcp.io")
    .replace("git-mcp.idosalomon.workers.dev", "gitmcp.io")
    .replace(/^localhost:?[0-9]+/, "gitmcp.io");

  // Different URL patterns
  const patterns = [
    // gitmcp.io/namespace/project (also supports nested: gitmcp.io/group/subgroup/project)
    /^(?:www\.)?gitmcp\.io\/(.+)\/([^\/]+)$/,
    // namespace.gitmcp.io/project
    /^(?:www\.)?([^\/]+)\.gitmcp\.io\/([^\/]+)/,
    // namespace.gitmcp.io
    /^(?:www\.)?([^\/]+)\.gitmcp\.io$/,
    // gitmcp.io/docs
    /^(?:www\.)?gitmcp\.io\/(docs)$/,
    // Simple namespace/project format (supports nested: group/subgroup/project)
    /^(.+)\/([^\/]+)$/,
  ];

  for (const pattern of patterns) {
    const match = urlReference.match(pattern);
    if (match) {
      // For patterns with 2 capture groups
      if (match[2] !== undefined) {
        return { namespace: match[1], project: match[2] };
      }
      // For patterns with 1 capture group (like docs)
      return { namespace: match[1], project: null };
    }
  }

  // Default fallback
  return { namespace: null, project: null };
}
