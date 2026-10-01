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
export const playSuite = suite("grimoire-play", {
  timeoutMs: 360000,
  usesPanelAutomation: true,
}).test(
  "a living conversation invents creatures and a home that residents can choose",
  async (t) => {
    await withPanel(
      "panels/grimoire",
      async (panel) => {
        await waitForText(panel, "Begin a new story");
        await panel.click("main.story-entry button");
        await waitFor(
          () =>
            evalInPanel<boolean>(
              panel,
              '!!document.querySelector("#wish:not(:disabled)")',
            ),
          { timeoutMs: 120000, label: "first-use world is ready" },
        );
        await evalInPanel(
          panel,
          `const input=document.querySelector('#wish');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Please make a cool, mossy leaf shelter for Sol beside the stream, and bring a few red ladybugs with black spots to crawl over its roof. I want him to feel at home there.');input.dispatchEvent(new Event('input',{bubbles:true}));`,
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
        await waitFor(
          () =>
            evalInPanel<boolean>(
              panel,
              'document.querySelectorAll(".exchange").length===1 && document.querySelector(".scene-canvas")?.dataset.sceneStatus==="ready"',
            ),
          {
            timeoutMs: 180000,
            intervalMs: 1000,
            label: "generated creature program renders",
          },
        );
        const description = await evalInPanel<string>(
          panel,
          'document.querySelector("iframe").title',
        );
        expect(
          /ladyb(ug|ird)/i.test(description),
          "actual requested creature",
        ).toBe(true);
        for (let i = 0; i < 4; i++) {
          await waitFor(
            () =>
              evalInPanel<boolean>(
                panel,
                '!document.querySelector(".garden-observations button").disabled',
              ),
            { label: "garden ready to linger" },
          );
          const day = await evalInPanel<string>(
            panel,
            'document.querySelector(".garden-caption .eyebrow").textContent',
          );
          await evalInPanel(
            panel,
            'document.querySelector(".garden-observations button").click()',
          );
          await waitFor(
            () =>
              evalInPanel<boolean>(
                panel,
                `document.querySelector(".garden-caption .eyebrow").textContent!==${JSON.stringify(day)}`,
              ),
            { timeoutMs: 30000, label: "garden life advances" },
          );
        }
        expect(
          await evalInPanel<boolean>(
            panel,
            '/Sol has chosen a home/.test(document.querySelector(".garden-keepsakes")?.textContent??"")',
          ),
          "a resident settles and leaves a discovery",
        ).toBe(true);
        await setViewport(panel, { width: 390, height: 844, mobile: true });
        expect((await audit(panel)).horizontalOverflow, "phone layout").toBe(
          false,
        );
        const identity = (await panel.stateArgs.get<Record<string, string>>())[
          "estateKey"
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
          (await panel.stateArgs.get<Record<string, string>>())["estateKey"],
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
      {
        focus: false,
      },
    );
  },
);
