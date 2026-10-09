import { Button, Card, Flex, Grid, Heading, Text } from "@radix-ui/themes";
import { buildPanelLink } from "@workspace/runtime";
import { AboutPage, AboutThemeRoot } from "@workspace/about-shared/ui";
const worlds = [
  {
    source: "panels/grimoire",
    title: "Grimoire",
    description:
      "Grow an estate where your wishes change the garden and its residents.",
  },
  {
    source: "panels/regency",
    title: "Regency",
    description:
      "Explore a living realm, hear your advisors, and discover the consequences of your decisions.",
  },
  {
    source: "panels/wandering-house",
    title: "The House That Crosses the World",
    description:
      "Travel in a wandering house through an illustrated world shaped by your choices.",
  },
  {
    source: "panels/missing-country",
    title: "The Missing Country",
    description:
      "Follow clues into a country that has disappeared from the map.",
  },
  {
    source: "panels/dead-letter-office",
    title: "Dead Letter Office",
    description:
      "Uncover the stories behind letters that never reached their destinations.",
  },
];
const starters = [
  { source: "panels/hello-svelte", label: "Svelte example" },
  { source: "panels/hello-vanilla", label: "JavaScript example" },
];
export default function Welcome() {
  return (
    <AboutThemeRoot>
      <AboutPage title="Choose a world">
        <Flex direction="column" gap="4">
          <Text size="2" color="gray">
            Begin a story and come back whenever you like. Your journey stays
            with its panel. The storytellers may ask you to connect a model
            provider when you first play.
          </Text>
          <Grid columns={{ initial: "1", sm: "2" }} gap="3">
            {worlds.map((world) => (
              <Card key={world.source}>
                <Flex direction="column" gap="2" height="100%">
                  <Heading size="3">{world.title}</Heading>
                  <Text size="2" color="gray">
                    {world.description}
                  </Text>
                  <Button asChild variant="soft" style={{ marginTop: "auto" }}>
                    <a href={buildPanelLink(world.source)}>
                      Begin {world.title}
                    </a>
                  </Button>
                </Flex>
              </Card>
            ))}
          </Grid>
          <details>
            <summary>Build your own panels</summary>
            <Flex direction="column" gap="2" mt="3">
              <Text size="2" color="gray">
                Explore small examples, then open a chat to build on what you
                discover.
              </Text>
              <Flex gap="2" wrap="wrap">
                {starters.map((starter) => (
                  <Button key={starter.source} asChild variant="soft">
                    <a href={buildPanelLink(starter.source)}>
                      Open {starter.label}
                    </a>
                  </Button>
                ))}
              </Flex>
              <Button asChild variant="ghost">
                <a href={buildPanelLink("about/new")}>Explore all panels</a>
              </Button>
            </Flex>
          </details>
        </Flex>
      </AboutPage>
    </AboutThemeRoot>
  );
}
