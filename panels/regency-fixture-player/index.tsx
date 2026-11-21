import { useState, type FormEvent } from "react";
import { useStateArgs } from "@workspace/react";
import { workers } from "@workspace/runtime";
import { regencyRealmRpcMethods } from "@workspace-workers/regency-realm/contract";

type Command = { ticket: string } & (
  | { kind: "seat"; channelId: string }
  | { kind: "advance"; id: string; months: number }
  | { kind: "cancel" }
);
type Realm = ReturnType<typeof bindRealm>;

function bindRealm(realm: string) {
  if (!/^natlang-realm-[a-f0-9-]{36}$/u.test(realm))
    throw new Error("The fixture requires its own local Regency realm.");
  return workers.durableObjectService("examples.regency.v1", regencyRealmRpcMethods, realm);
}

export async function applyRegencyFixtureCommand(owner: Realm, command: Command): Promise<void> {
  switch (command.kind) {
    case "seat": {
      if (!/^natlang-channel-[a-f0-9-]{36}$/u.test(command.channelId))
        throw new Error("Only the disposable inert test channel may sit in this realm.");
      await owner.call("registerParticipant", {
        role: "storyteller",
        targetId: `do:workers/pubsub-channel:PubSubChannel:${command.channelId}`,
        channelId: command.channelId,
      });
      return;
    }
    case "advance":
      if (!/^(?:settlement|paired-settlement)-[a-f0-9-]{36}$/u.test(command.id) ||
          !Number.isInteger(command.months) || command.months < 1 || command.months > 12)
        throw new Error("Expected one identified local fixture settlement advance.");
      await owner.call("advance", {id:command.id, months:command.months});
      return;
    case "cancel":
      await owner.call("cancel");
      return;
    default:
      throw new Error("Unrecognized local fixture command.");
  }
}

export default function RegencyFixturePlayer() {
  const {realm} = useStateArgs<{realm?:string}>();
  const [busy,setBusy] = useState(false);
  const [result,setResult] = useState<{ticket:string;error:string|null} | null>(null);

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !realm) return;
    const raw = new FormData(event.currentTarget).get("command");
    let ticket = "";
    setBusy(true);
    try {
      const command = JSON.parse(String(raw)) as Command;
      if (!/^[a-f0-9-]{36}$/u.test(command.ticket)) throw new Error("Missing exact fixture request ticket.");
      ticket = command.ticket;
      await applyRegencyFixtureCommand(bindRealm(realm),command);
      setResult({ticket,error:null});
    } catch (error) {
      setResult({ticket,error:error instanceof Error ? error.message : String(error)});
    } finally {
      setBusy(false);
    }
  }

  return <main>
    <h1>Regency fixture player</h1>
    <form data-regency-fixture-player={realm} onSubmit={event=>void run(event)}>
      <label>Local fixture command<textarea name="command" /></label>
      <button type="submit" disabled={!realm || busy}>Apply fixture command</button>
      <output>{result ? JSON.stringify(result) : ""}</output>
    </form>
  </main>;
}
