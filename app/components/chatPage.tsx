import { useState, useEffect } from "react";
import ChatPageClient from "./.client/chatPage.client";
export default function ChatPageServer({
  namespace,
  project,
}: {
  namespace: string | null;
  project: string | null;
}) {
  const [client, setClient] = useState(false);
  useEffect(() => {
    if (typeof document !== "undefined") {
      setClient(true);
    }
  }, []);
  if (client) {
    return <ChatPageClient namespace={namespace} project={project} />;
  } else {
    return <div></div>;
  }
}
