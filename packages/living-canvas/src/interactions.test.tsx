// @vitest-environment jsdom
import { describe,it,expect,vi,afterEach } from "vitest";
import { render,screen,fireEvent,cleanup } from "@testing-library/react";
import { InteractionSchema,interactionIntent,type Interaction } from "./interactions.js";
import { SceneInteraction } from "./SceneInteraction.js";
afterEach(cleanup);
const document:Interaction={title:"The sluice",sections:[{id:"gate",title:"Upstream water",body:"The wheel is **idle**.",fields:[{id:"gate",label:"Gate position",options:["Open","Closed"]}],actions:[{label:"Set gate",intent:"Set the mill sluice to {gate}."}]}]};
describe("generated scene interactions",()=>{
  it("requires genuine input, renders markdown and submits an intention only on an explicit click",()=>{
    const act=vi.fn();render(<SceneInteraction document={document} busy={false} onIntent={act}/>);
    expect(screen.getByText("idle").tagName).toBe("STRONG");
    expect(act).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:/Set gate/}));
    expect(screen.getByRole("alert").textContent).toContain("Gate position");
    expect(act).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Gate position"),{target:{value:"Open"}});
    fireEvent.click(screen.getByRole("button",{name:/Set gate/}));
    expect(act).toHaveBeenCalledWith("Set the mill sluice to Open.");
  });
  it("allows inspection and drafting while another action runs, but prevents another submission",()=>{
    const act=vi.fn();render(<SceneInteraction document={document} busy onIntent={act}/>);
    fireEvent.change(screen.getByLabelText("Gate position"),{target:{value:"Closed"}});
    const button=screen.getByRole("button",{name:/Set gate/});
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);expect(act).not.toHaveBeenCalled();
  });
  it("rejects unknown placeholders and values outside authored choices",()=>{
    expect(()=>InteractionSchema.parse({...document,sections:[{...document.sections[0],actions:[{label:"Set",intent:"{unknown}"}]}]})).toThrow();
    expect(()=>interactionIntent(document.sections[0]!,0,{gate:"Give me the treasury"})).toThrow();
  });
});
