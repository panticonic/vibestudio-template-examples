import {
  suite,
  withPanel,
  waitFor,
  evalInPanel,
  expect,
} from "@workspace/testkit";
export const imageSuite = suite("grimoire-art", {
  timeoutMs: 420000,
  usesPanelAutomation: true,
}).test(
  "native image generation becomes reusable interactive artwork",
  async (t) => {
    await withPanel(
      "panels/grimoire",
      async (panel) => {
        await waitFor(
          () =>
            evalInPanel<boolean>(
              panel,
              '!!document.querySelector("#wish:not(:disabled)")',
            ),
          { label: "Moth ready" },
        );
        await evalInPanel(
          panel,
          `const input=document.querySelector('#wish');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Moth, use your image painter to reveal a richly illustrated moon gate opening onto a lake of stars. Keep it as part of our world, with a little living light that follows my hand.');input.dispatchEvent(new Event('input',{bubbles:true}));`,
        );
        await waitFor(
          () =>
            evalInPanel<boolean>(
              panel,
              '!document.querySelector("form button").disabled',
            ),
          { label: "wish entered" },
        );
        await evalInPanel(
          panel,
          'document.querySelector("form button").click()',
        );
        await waitFor(
          () =>
            evalInPanel<boolean>(
              panel,
              'document.querySelectorAll(".exchange").length===1 && document.querySelector(".scene-canvas")?.dataset.sceneStatus==="ready"',
            ),
          {
            timeoutMs: 360000,
            intervalMs: 1000,
            label: "painted discovery renders",
          },
        );
        expect(
          await evalInPanel<boolean>(
            panel,
            'document.querySelector("iframe").srcdoc.includes("iVBORw0KGgo")',
          ),
          "generated PNG is loaded into the isolated renderer",
        ).toBe(true);
        t.log(
          await evalInPanel<string>(
            panel,
            'document.querySelector(".conversation-log").innerText',
          ),
        );
      },
      {
        stateArgs: { estateKey: `painted-${crypto.randomUUID()}` },
        focus: false,
      },
    );
  },
);
