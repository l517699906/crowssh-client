import { useServers } from "./hooks/useServers";
import { useTerminals } from "./hooks/useTerminals";
import { AppLayout } from "./components/layout/AppLayout";
import { UpdateNotice } from "./components/common/UpdateNotice";

export default function App() {
  const servers = useServers();
  const terminals = useTerminals();
  return (
    <>
      <AppLayout servers={servers} terminals={terminals} />
      <UpdateNotice />
    </>
  );
}
