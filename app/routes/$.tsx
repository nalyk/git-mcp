import { getRepoData } from "../../src/shared/repoData";
import Content from "../components/content";
import ChatPageServer from "../components/chatPage";
import type { MetaFunction } from "react-router";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data) {
    return [];
  }
  const { namespace, project, url } = data;
  const repoDescription = project ? `${namespace}/${project}` : "any GitLab project";
  if (isChatPage({ namespace, project, url })) {
    return [
      { title: "GitMCP Chat" },
      {
        name: "description",
        content: `Chat with the documentation for ${repoDescription}`,
      },
    ];
  }
  return [
    { title: `GitMCP` },
    {
      name: "description",
      content: `Get the documentation for ${repoDescription}`,
    },
  ];
};

export const loader = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const host = url.host;
  const pathname = url.pathname;

  const { urlType, namespace, project } = getRepoData({
    requestHost: host,
    requestUrl: pathname,
  });

  return { urlType, namespace, project, url: url.toString() };
};

export function HydrateFallback() {
  return <p>Skeleton rendered during SSR</p>; // (2)
}

export default function ContentPage({
  loaderData,
}: {
  loaderData: Awaited<ReturnType<typeof loader>>;
}) {
  const { urlType, namespace, project, url } = loaderData;

  if (isChatPage({ namespace, project, url })) {
    return <ChatPageServer namespace={namespace} project={project} />;
  }

  return <Content urlType={urlType} namespace={namespace} project={project} url={url} />;
}

function isChatPage({
  namespace,
  project,
  url,
}: {
  namespace: string | null;
  project: string | null;
  url: string;
}) {
  // is a valid project
  const isValid = (namespace && project) || (!project && namespace == "docs");
  if (!isValid) {
    return false;
  }
  // is a chat page
  return namespace != "chat" && project != "chat" && url.endsWith("/chat");
}
