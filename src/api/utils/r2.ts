export async function fetchFileFromR2(
  namespace: string,
  project: string,
  filename: string,
  env: CloudflareEnvironment,
): Promise<string | null> {
  if (namespace && project && env.DOCS_BUCKET) {
    try {
      const obj = await env.DOCS_BUCKET.get(
        namespace + "/" + project + "/" + filename,
      );
      if (obj) {
        return await new Response(obj.body).text();
      } else {
        console.log("Didn't find docs file in r2");
      }
    } catch (error) {
      console.error("Failed to fetch docs file from r2", error);
    }
  }

  return null;
}
