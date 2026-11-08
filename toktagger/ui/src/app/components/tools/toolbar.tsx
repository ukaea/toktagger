"use client";
import {
  Provider,
  defaultTheme,
  Flex,
  View,
  Header,
  Accordion,
  Disclosure,
  DisclosureTitle,
  DisclosurePanel,
  Heading,
  InlineAlert,
} from "@adobe/react-spectrum";
import { getAnnotationsForSample } from "@/app/core";
import { ModelPredictTool } from "@/app/components/tools/modelPredictSample";
import { ShotLabels } from "../annotators/labels";
import { ExportTool } from "./export";
import { ImportButton } from "./import";
import { NavigationBar } from "./nav";
import { ToolAccordion, ToolEntry } from "./toolAccordion";
import { useSample } from "@/app/contexts/SampleContext";
import { useWorkspace } from "@/app/contexts/WorkspaceContext";
import { useServerHealth } from "@/app/contexts/healthContext";

function AnnotationStatusAlert({ isValidated }: { isValidated: boolean }) {
  return (
    <Flex justifyContent="center" width="100%" marginTop="size-200">
      <InlineAlert
        variant={isValidated ? "positive" : "notice"}
        UNSAFE_style={{
          paddingTop: "5px",
          paddingBottom: "5px",
          paddingLeft: "10px",
          paddingRight: "10px",
        }}
      >
        <Heading>
          {isValidated ? "Annotations Validated" : "Annotations Not Validated"}
        </Heading>
      </InlineAlert>
    </Flex>
  );
}

export default function ToolBar() {
  const { project, sample, setAnnotations, isValidated } = useSample();
  const { setToolSlot } = useWorkspace();
  const { modelsEnabled } = useServerHealth();

  if (!project || !sample) {
    console.warn("Project or sample not found in ToolBar");
    return null;
  }

  const project_id = project._id;
  const sample_id = sample._id;

  if (project_id == null || sample_id == null) {
    console.warn("Invalid project_id or sample_id in ToolBar");
    return null;
  }

  const sampleTools: ToolEntry[] = [
    {
      name: "Shot Labels",
      component: (
        <ShotLabels
          labels={project.shot_labels || ["Valid Shot", "Invalid Shot"]}
        />
      ),
    },
  ];
  const modelTools: ToolEntry[] = modelsEnabled
    ? [
        {
          name: "Model Prediction",
          component: (
            <ModelPredictTool project_id={project_id} sample_id={sample_id} />
          ),
        },
      ]
    : [];

  const refreshAnnotations = async () => {
    const dbAnnotations = await getAnnotationsForSample(project_id, sample_id);
    setAnnotations(() => dbAnnotations);
  };

  return (
    <Provider theme={defaultTheme} height="100vh">
      <View overflow="auto" height="100vh" width="18vw">
        <Flex
          direction="column"
          alignItems="center"
          justifyContent="center"
          gap="size-100"
          width="100%"
        >
          {isValidated !== null && (
            <AnnotationStatusAlert isValidated={isValidated} />
          )}
          <Flex
            direction="column"
            alignItems="center"
            justifyContent="center"
            gap="size-100"
          >
            <Header height="size-300" marginBottom="size-100">
              <span style={{ fontSize: "1.2rem" }}>Controls</span>
            </Header>
            <NavigationBar project_id={project_id} sample_id={sample_id} />
            <Accordion allowsMultipleExpanded={true} width="100%">
              <Disclosure>
                <DisclosureTitle>
                  <span style={{ fontSize: "0.8rem" }}>Export Annotations</span>
                </DisclosureTitle>
                <DisclosurePanel>
                  <ExportTool project={project} sample={sample} />
                </DisclosurePanel>
              </Disclosure>
              <Disclosure>
                <DisclosureTitle>
                  <span style={{ fontSize: "0.8rem" }}>Import Annotations</span>
                </DisclosureTitle>
                <DisclosurePanel>
                  <ImportButton
                    project={project}
                    sample={sample}
                    refreshAnnotations={refreshAnnotations}
                  />
                </DisclosurePanel>
              </Disclosure>
            </Accordion>
          </Flex>
          <Flex justifyContent="center" alignItems="center">
            <Header height="size-300" marginBottom="size-100">
              <span style={{ fontSize: "1.2rem" }}>Toolbox</span>
            </Header>
          </Flex>
          <ToolAccordion tools={sampleTools} />
          {/* The active panel renders its own tools here, inside its own providers. */}
          <div
            ref={setToolSlot}
            data-testid="panel-tools"
            style={{ width: "100%" }}
          />
          <ToolAccordion tools={modelTools} />
        </Flex>
      </View>
    </Provider>
  );
}
