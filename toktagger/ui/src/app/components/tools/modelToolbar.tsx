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
  View,
} from "@adobe/react-spectrum";
import type { Project } from "@/types";

import { ModelTrainModal } from "@/app/components/tools/modelTrain";
import { ModelLoadModal } from "@/app/components/tools/modelLoad";
import { ModelPredictModal } from "@/app/components/tools/modelPredict";

export function ModelToolbar({ project }: { project: Project }) {
  return (
    <Provider theme={defaultTheme}>
      <View
        borderWidth="thick"
        borderColor={"static-black"}
        borderRadius="large"
        backgroundColor={"gray-400"}
        padding="size-100"
        position="fixed"
        top="size-200"
        right="size-200"
        zIndex={9999}
      >
        <Flex direction="row" gap={"size-100"}>
          <ModelTrainModal project={project}></ModelTrainModal>
          <ModelLoadModal project={project}></ModelLoadModal>
          <ModelPredictModal project={project}></ModelPredictModal>
        </Flex>
      </View>
    </Provider>
  );
}
