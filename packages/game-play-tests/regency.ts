import {
  suite,
  withPanel,
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
              '!!document.querySelector(".realm-evidence")',
            ),
          { timeoutMs: 30000, label: "economy settles before commentary" },
        );
        expect(
          await evalInPanel<string>(
            panel,
            'document.querySelector(".account-line").textContent',
          ),
          "core charges actual ferry service",
        ).toContain("Services 5");
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
        t.log(
          await evalInPanel<string>(
            panel,
            'document.querySelector(".conversation-log").innerText',
          ),
        );
      },
      { stateArgs: { gameKey: `realm-${crypto.randomUUID()}` }, focus: false },
    );
  },
);
