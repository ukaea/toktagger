import {
  Provider,
  defaultTheme,
  ComboBox,
  Item,
  Flex,
  ActionButton,
  Button,
  ButtonGroup,
  Content,
  Dialog,
  DialogTrigger,
  Divider,
  Footer,
  Heading,
  Text,
  Tabs,
  TabList,
  TabPanels,
  Key,
  TextField,
  ProgressCircle,
  TooltipTrigger,
  Tooltip,
} from "@adobe/react-spectrum";
import type { Project } from "@/types";

import { ModelTrainModal } from "@/app/components/tools/modelTrain";
import { ModelLoadModal } from "@/app/components/tools/modelLoad";
import { ModelPredictModal } from "@/app/components/tools/modelPredict";

export function ModelToolbar({ project }: { project: Project }) {
  return (
    <Provider theme={defaultTheme}>
      <Flex direction="row" gap={"size-100"}>
        <ModelTrainModal project={project}></ModelTrainModal>
        <ModelLoadModal project={project}></ModelLoadModal>
        <ModelPredictModal project={project}></ModelPredictModal>
      </Flex>
    </Provider>
  );
}
