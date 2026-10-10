import { workers } from "@workspace/runtime";
import { regencyRealmRpcMethods } from "@workspace-workers/regency-realm/contract";
import {
  suite,
  withPanel,
  waitForText,
  waitFor,
  evalInPanel,
  setViewport,
  audit,
  expect,
} from "@workspace/testkit";
export const playSuite = suite("regency-play", {
  timeoutMs: 480000,
  usesPanelAutomation: true,
}).test(
  "advisors forecast code, the regent enacts it, and time runs it",
  async (t) => {
    await withPanel(
      "panels/regency",
      async (panel) => {
        await waitForText(panel, "Begin a new story");
        await panel.click("main.story-entry button");
        async function say(text: string, turn: number) {
          await waitFor(
            () =>
              evalInPanel<boolean>(
                panel,
                '!!document.querySelector("#words:not(:disabled)") && document.querySelector("main")?.getAttribute("aria-busy")==="false"',
              ),
            { timeoutMs: 180000, label: "council ready" },
          );
          await evalInPanel(
            panel,
            `{const input=document.querySelector('#words');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}));}`,
          );
          await waitFor(
            () =>
              evalInPanel<boolean>(
                panel,
                '!document.querySelector("form button").disabled',
              ),
            { label: "message entered" },
          );
          await evalInPanel(
            panel,
            'document.querySelector("form button").click()',
          );
          try {
            await waitFor(
              () =>
                evalInPanel<boolean>(
                  panel,
                  `document.querySelectorAll('.exchange').length===${turn} && document.querySelector('.regency').getAttribute('aria-busy')==='false' && document.querySelector('.scene-canvas')?.dataset.sceneStatus==='ready'`,
                ),
              {
                timeoutMs: 180000,
                intervalMs: 1000,
                label: "council completes conversation",
              },
            );
          } catch (error) {
            const state = await evalInPanel(
              panel,
              `({busy:document.querySelector('.regency')?.getAttribute('aria-busy'),exchanges:document.querySelectorAll('.exchange').length,scene:document.querySelector('.scene-canvas')?.dataset.sceneStatus,drawing:document.querySelector('.scene-recovery')?.textContent,connection:document.querySelector('.recovery')?.textContent})`,
            );
            throw new Error(String(error) + " " + JSON.stringify(state));
          }
        }
        await say(
          "Ivo, propose a temporary ferry subsidy costing 5 crowns a month for three months. Show me the cost before we enact anything.",
          1,
        );
        await panel.click(".realm-atlas > summary");
        expect(
          await evalInPanel<string>(
            panel,
            'document.querySelector(".realm-signals").innerText',
          ),
          "discussion preserves treasury",
        ).toContain("120");
        expect(
          await evalInPanel<boolean>(
            panel,
            '!!document.querySelector(".policy-proposal")',
          ),
          "advisor authored executable proposal",
        ).toBe(true);
        await evalInPanel(
          panel,
          'document.querySelector(".policy-proposal button").click()',
        );
        await waitFor(
          () =>
            evalInPanel<boolean>(
              panel,
              'document.querySelectorAll(".exchange").length===2 && document.querySelector("main").getAttribute("aria-busy")==="false"',
            ),
          {
            timeoutMs: 180000,
            label: "direct decree receives advisor replies",
          },
        );
        expect(
          await evalInPanel<boolean>(
            panel,
            '!!document.querySelector(".enacted-policies")',
          ),
          "policy enacted",
        ).toBe(true);
        await evalInPanel(
          panel,
          'document.querySelector(".realm-moment button").click()',
        );
        await waitFor(
          () =>
            evalInPanel<boolean>(
              panel,
              '!!document.querySelector(".account-line")',
            ),
          { timeoutMs: 30000, label: "economy settles before commentary" },
        );
        await panel.click(
          "details.realm-evidence:has(.account-line) > summary",
        );
        const gameKey = (await panel.stateArgs.get<{ gameKey: string }>())
          .gameKey;
        const accepted = await workers
          .durableObjectService("examples.regency.v1", regencyRealmRpcMethods, gameKey)
          .call("getGame");
        expect(
          accepted.game.world.economy.routes.find(
            (route) => route.id === "east-ferry",
          )?.subsidy,
          "accepted ferry subsidy is five crowns",
        ).toBe(5);
        // The seeded realm also pays three watch companies two crowns each.
        expect(
          accepted.game.world.economy.accounts.services,
          "core charges ferry service plus the existing watch payroll",
        ).toBe(11);
        expect(
          await evalInPanel<string>(
            panel,
            'document.querySelector(".account-line").innerText',
          ),
          "visible accounts match accepted service spending",
        ).toContain("Services 11");
        await waitFor(
          () =>
            evalInPanel<boolean>(
              panel,
              'document.querySelectorAll(".exchange").length===3 && document.querySelector("main").getAttribute("aria-busy")==="false"',
            ),
          { timeoutMs: 180000, label: "council interprets consequences" },
        );
        await setViewport(panel, { width: 390, height: 844, mobile: true });
        expect((await audit(panel)).horizontalOverflow, "phone layout").toBe(
          false,
        );
        const identity = (await panel.stateArgs.get<Record<string, string>>())[
          "gameKey"
        ];
        expect(Boolean(identity), "first-use world identity is saved").toBe(
          true,
        );
        const conversation = await evalInPanel<string>(
          panel,
          'document.querySelector(".conversation-log").innerText',
        );
        const exchanges = await evalInPanel<number>(
          panel,
          'document.querySelectorAll(".exchange").length',
        );
        await panel.reload();
        await waitFor(
          () =>
            evalInPanel<boolean>(
              panel,
              `document.querySelectorAll(".exchange").length===${exchanges}`,
            ),
          { label: "accepted progress returns after reload" },
        );
        expect(
          (await panel.stateArgs.get<Record<string, string>>())["gameKey"],
          "same owned world after reload",
        ).toBe(identity);
        expect(
          await evalInPanel<string>(
            panel,
            'document.querySelector(".conversation-log").innerText',
          ),
          "conversation survives reload",
        ).toBe(conversation);
        t.log(conversation);
      },
      { focus: false },
    );
  },
);
