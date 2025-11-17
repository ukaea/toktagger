"use client";
import { z } from "zod/v4";
import { useState, useEffect } from "react";
import {
  Form,
  Flex,
  Button,
  ToastQueue,
  ListView,
  View,
  TextField,
  Text,
  ComboBox,
  RadioGroup,
  NumberField,
  Radio,
  Item,
  DialogTrigger,
  Dialog,
  Divider,
  Heading,
  Content,
  ButtonGroup,
} from "@adobe/react-spectrum";
import {
  Project,
  Sample,
  SamplesSummary,
  FileData,
  ShotData,
  ProjectUpdate,
} from "@/types";
import AddCircle from "@spectrum-icons/workflow/AddCircle";
import Edit from "@spectrum-icons/workflow/EditCircle";
import { getSamplesSummary } from "@/app/core";

const Tasks = [
  { key: "ELM", value: "ELM" },
  { key: "disruption", value: "Disruption" },
  { key: "MHD", value: "MHD" },
];

const DataLoaders = [
  { key: "file", value: "Local File" },
  { key: "uda", value: "UDA" },
];

const QueryStrategies = [
  { key: "sequential", value: "Sequential" },
  { key: "random", value: "Random" },
];

const FileTypes = [{ key: "parquet", value: "Parquet" }];

const DataLoaderOptionsSchema = z.object({
  name: z.string(),
  signal_names: z.array(z.string()),
});
type DataLoaderOptions = z.infer<typeof DataLoaderOptionsSchema>;

const UDADataLoaderOptionsSchema = DataLoaderOptionsSchema.extend({
  shot_min: z.number(),
  shot_max: z.number(),
}).refine(
  (data) =>
    data.shot_max == null ||
    data.shot_min == null ||
    data.shot_min <= data.shot_max,
  {
    message: "shot min must be less than or equal to shot max",
    path: ["shot_max"], // attach error to `max`
  },
);
type UDADataLoaderOptions = z.infer<typeof UDADataLoaderOptionsSchema>;

const FileDataLoaderOptionsSchema = DataLoaderOptionsSchema.extend({
  file_type: z.string(),
  file_names: z.array(z.string()),
  dir_name: z.string().optional(),
  protocol: z.string().optional(),
});
type FileDataLoaderOptions = z.infer<typeof FileDataLoaderOptionsSchema>;

const SignalNamesUI = ({
  displayName,
  signalNames,
  setSignalNames,
}: {
  displayName: string;
  signalNames: string[];
  setSignalNames: (items: string[]) => void;
}) => {
  const [items, setItems] = useState<string[]>(signalNames);
  const [input, setInput] = useState("");

  const handleAddItem = () => {
    if (input.trim()) {
      setItems((prev: string[]) => {
        const newItems = [...prev, input.trim()];
        return newItems;
      });
      setInput("");
    }
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev: string[]) => {
      const newItems = prev.filter((_, i) => i !== index);
      return newItems;
    });
  };

  useEffect(() => {
    setSignalNames(items);
  }, [items, setSignalNames]);

  return (
    <>
      <Flex direction="column" gap="size-200" marginBottom="size-200">
        <Flex direction="row" alignItems="end" gap="size-200">
          <TextField label={displayName} value={input} onChange={setInput} />

          <Button
            variant="primary"
            onPress={handleAddItem}
            marginTop="size-100"
          >
            Add
          </Button>
        </Flex>

        <ListView aria-label="Dynamic List" marginTop="size-200">
          {items.map((item, index) => (
            <Item key={index} textValue={item}>
              <Flex
                direction="row"
                alignItems="center"
                gap="size-200"
                wrap="nowrap"
              >
                <Text>{item}</Text>
                <Button
                  variant="negative"
                  onPress={() => handleRemoveItem(index)}
                >
                  Remove
                </Button>
              </Flex>
            </Item>
          ))}
        </ListView>
      </Flex>
    </>
  );
};

const UDADataLoaderOptionsUI = ({
  dataLoaderOptions,
  setDataLoaderOptions,
}: {
  dataLoaderOptions: UDADataLoaderOptions;
  setDataLoaderOptions: (options: DataLoaderOptions) => void;
}) => {
  const [shotMin, setShotMin] = useState<number | null>(
    dataLoaderOptions?.shot_min || null,
  );
  const [shotMax, setShotMax] = useState<number | null>(
    dataLoaderOptions?.shot_max || null,
  );
  const [signalNames, setSignalNames] = useState<string[]>(
    dataLoaderOptions?.signal_names || [],
  );

  useEffect(() => {
    const options = UDADataLoaderOptionsSchema.safeParse({
      name: "uda",
      signal_names: signalNames,
      shot_min: shotMin,
      shot_max: shotMax,
    });

    if (options.success) {
      setDataLoaderOptions(options.data);
    }
  }, [shotMin, shotMax, signalNames, setDataLoaderOptions]);

  return (
    <View
      borderWidth="thin"
      borderColor="dark"
      borderRadius="medium"
      padding="size-250"
    >
      <Flex direction="column">
        <Flex direction="row" gap="size-200" alignItems="center">
          <NumberField
            label="Shot Min"
            isRequired
            value={shotMin ?? undefined}
            onChange={setShotMin}
            validate={(value: number) => {
              if (Number.isNaN(value)) {
                return "Shot Min is required";
              } else if (
                !Number.isNaN(shotMax) &&
                shotMax &&
                value >= shotMax
              ) {
                return "Must be less than Shot Max";
              } else {
                return true;
              }
            }}
            formatOptions={{
              maximumFractionDigits: 0,
            }}
          />
          <NumberField
            label="Shot Max"
            isRequired
            value={shotMax ?? undefined}
            onChange={setShotMax}
            validate={(value: number) => {
              if (Number.isNaN(value)) {
                return "Shot Max is required";
              } else if (
                !Number.isNaN(shotMin) &&
                shotMin &&
                value <= shotMin
              ) {
                return "Must be greater than Shot Min";
              } else {
                return true;
              }
            }}
            formatOptions={{
              maximumFractionDigits: 0,
            }}
          />
        </Flex>
        <SignalNamesUI
          displayName={"UDA Signal Names"}
          signalNames={signalNames}
          setSignalNames={setSignalNames}
        />
      </Flex>
    </View>
  );
};

const FileDataLoaderOptionsUI = ({
  dataLoaderOptions,
  setDataLoaderOptions,
}: {
  dataLoaderOptions: FileDataLoaderOptions;
  setDataLoaderOptions: (options: DataLoaderOptions) => void;
}) => {
  const [filePath, setFilePath] = useState<string>(
    dataLoaderOptions?.dir_name || "",
  );
  const [fileType, setFileType] = useState<string>(
    dataLoaderOptions?.protocol || FileTypes[0].key,
  );
  const [signalNames, setSignalNames] = useState<string[]>(
    dataLoaderOptions?.signal_names || [],
  );
  const [fileNames, setFileNames] = useState<string[]>([]);

  useEffect(() => {
    const options = FileDataLoaderOptionsSchema.safeParse({
      name: "file",
      signal_names: signalNames,
      file_type: fileType,
      file_names: fileNames,
    });

    if (options.success) {
      setDataLoaderOptions(options.data);
    }
  }, [signalNames, fileNames, fileType, setDataLoaderOptions]);

  useEffect(() => {
    async function fetchFileList() {
      if (filePath) {
        try {
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/backend-api/files?dir_path=${filePath}&file_type=${fileType}`,
          );
          if (response.ok) {
            const fileList = await response.json();
            setFileNames(fileList);
          } else {
            ToastQueue.negative(`Error fetching files from ${filePath}`, {
              timeout: 3000,
            });
          }
        } catch (error) {
          ToastQueue.negative(`Error fetching files: ${error}`, {
            timeout: 3000,
          });
        }
      }
    }
    fetchFileList();
  }, [filePath, fileType]);

  return (
    <View
      borderWidth="thin"
      borderColor="dark"
      borderRadius="medium"
      padding="size-250"
    >
      <Flex direction="column" gap="size-200">
        <ComboBox
          label="File Type"
          items={FileTypes}
          selectedKey={fileType}
          onSelectionChange={(key) => setFileType(key ? String(key) : "")}
          isRequired
        >
          {(item: Record<string, string>) => (
            <Item key={item.key}>{item.value}</Item>
          )}
        </ComboBox>
        <Flex direction="row" gap="size-200" alignItems="end">
          <TextField
            label="File Path"
            value={filePath}
            onChange={setFilePath}
            isRequired
          ></TextField>
          <Text>
            {fileNames.length} {fileType} files found.
          </Text>
        </Flex>
        <SignalNamesUI
          displayName={"File Columns"}
          signalNames={signalNames}
          setSignalNames={setSignalNames}
        />
      </Flex>
    </View>
  );
};

const DataLoaderForm = ({
  dataLoaderOptions,
  setDataLoaderOptions,
}: {
  dataLoaderOptions: DataLoaderOptions | null;
  setDataLoaderOptions: (options: DataLoaderOptions) => void;
}) => {
  const name = dataLoaderOptions?.name ? dataLoaderOptions.name : null;
  const [selectedKey, setSelectedKey] = useState<string | null>(name || null);

  let ui = null;
  if (selectedKey === "uda") {
    const udaOptions = dataLoaderOptions as UDADataLoaderOptions;
    ui = (
      <UDADataLoaderOptionsUI
        dataLoaderOptions={udaOptions}
        setDataLoaderOptions={setDataLoaderOptions}
      />
    );
  } else if (selectedKey === "file") {
    const fileOptions = dataLoaderOptions as FileDataLoaderOptions;
    ui = (
      <FileDataLoaderOptionsUI
        dataLoaderOptions={fileOptions}
        setDataLoaderOptions={setDataLoaderOptions}
      />
    );
  }

  return (
    <>
      <ComboBox
        label="Data Loader"
        items={DataLoaders}
        isRequired
        onSelectionChange={(key) => setSelectedKey(key ? String(key) : null)}
        selectedKey={selectedKey}
      >
        {(item: Record<string, string>) => (
          <Item key={item.key}>{item.value}</Item>
        )}
      </ComboBox>
      {ui}
    </>
  );
};

const TaskLoaderForm = ({
  taskName,
  setTaskName,
}: {
  taskName: string;
  setTaskName: (selection: string) => void;
}) => {
  const handleSelectionChange = (key: React.Key | null) => {
    setTaskName(key ? String(key) : Tasks[0].key);
  };

  return (
    <>
      <ComboBox
        label="Task"
        items={Tasks}
        defaultInputValue={taskName}
        onSelectionChange={handleSelectionChange}
        isRequired
        selectedKey={taskName}
      >
        {(item: Record<string, string>) => (
          <Item key={item.key}>{item.value}</Item>
        )}
      </ComboBox>
    </>
  );
};

const editProject = async (
  projectId: string,
  project: ProjectUpdate,
): Promise<string> => {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${projectId}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(project),
    },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Error editing project ${projectId}: ${error.message}`);
  }

  return projectId;
};

const createProject = async (project: Project): Promise<string> => {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(project),
    },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Error creating project: ${error.message}`);
  }

  const projectId = (await response.json())["_id"];
  return projectId;
};

const buildSamples = (dataLoaderOptions: DataLoaderOptions): Sample[] => {
  if (dataLoaderOptions.name === "uda") {
    return createUDASamples(dataLoaderOptions);
  } else if (dataLoaderOptions.name === "file") {
    return createFileSamples(dataLoaderOptions);
  } else {
    throw new Error(`Unknown data loader ${dataLoaderOptions.name}`);
  }
};

const createUDASamples = (dataLoaderOptions: DataLoaderOptions) => {
  const { shot_min, shot_max } = dataLoaderOptions as UDADataLoaderOptions;

  const shots = Array.from(
    { length: shot_max - shot_min + 1 },
    (_, i) => i + shot_min,
  );
  const shotData = {
    signal_names: dataLoaderOptions.signal_names,
    protocol: "uda",
  } as ShotData;

  const samples: Sample[] = shots.map((shot_id: number) => ({
    timestamp: new Date().toISOString(),
    shot_id: shot_id,
    data: shotData,
  }));
  return samples;
};

const createFileSamples = (dataLoaderOptions: DataLoaderOptions) => {
  const options = dataLoaderOptions as FileDataLoaderOptions;
  const fileNames = options.file_names;

  if (!fileNames || fileNames.length === 0) {
    throw new Error("Directory must contain at least one file.");
  }

  // Assumption!: the file name must be the shot number.
  const shots = fileNames.map((name: string) => {
    const lastDotIndex = name.lastIndexOf(".");
    const lastSlashIndex = name.lastIndexOf("/");
    const shotName = name.substring(lastSlashIndex + 1, lastDotIndex);
    const shotId = parseInt(shotName, 10);
    return shotId;
  });

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    if (Number.isNaN(shot)) {
      throw new Error(`Invalid shot ID: ${shot} for file ${fileNames[i]}`);
    }
  }

  const dataInfo = {
    file_name: fileNames[0],
    type: options.file_type,
    protocol: options.protocol || "file",
    column_names: options.signal_names,
  } as FileData;

  const samples: Sample[] = shots.map((shot_id: number) => ({
    shot_id: shot_id,
    timestamp: new Date().toISOString(),
    data: dataInfo,
  }));

  return samples;
};

const createSamples = async (projectId: string, samples: Sample[]) => {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${projectId}/samples`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(samples),
    },
  );

  if (!response.ok) {
    const error = await response.json();
    if (error.message) {
      throw new Error(`Error creating samples: ${error.message}`);
    } else {
      // Input data validation error
      throw new Error(`Error creating samples: ${error.detail.msg}`);
    }
  }
};

const buildProject = (
  projectName: string,
  dataLoaderOptions: DataLoaderOptions,
  task: string,
  queryStrategy: string,
): Project => {
  if (projectName === "") {
    throw new Error("Project name cannot be empty");
  }

  if (dataLoaderOptions.name === "") {
    throw new Error("Data loader name cannot be empty");
  }

  if (task === "") {
    throw new Error("Task cannot be empty");
  }

  let dataLoaderType = dataLoaderOptions.name;
  if (dataLoaderOptions.name === "file") {
    const options = dataLoaderOptions as FileDataLoaderOptions;
    dataLoaderType = options.protocol ?? "parquet";
  }
  const project: Project = {
    name: projectName,
    data_loader: dataLoaderType,
    task: task,
    query_strategy: queryStrategy,
    timestamp: new Date().toISOString(),
  };

  return project;
};

export const ProjectConfigEditor = ({
  project,
  onModify,
}: {
  project?: Project | null;
  onModify?: () => void;
}) => {
  const editMode = project !== undefined && project !== null;
  const text = editMode ? "Edit" : "Create";
  const icon = editMode ? <Edit /> : <AddCircle />;
  const [projectName, setProjectName] = useState<string>(project?.name || "");
  const [queryStrategy, setQueryStrategy] = useState<string>(
    project?.query_strategy || QueryStrategies[0].key,
  );
  const [taskSelection, setTaskSelection] = useState<string>(Tasks[0].key);
  const [dataLoaderOptions, setDataLoaderOptions] =
    useState<DataLoaderOptions | null>(null);
  const [samplesSummary, setSamplesSummary] = useState<SamplesSummary | null>(
    null,
  );

  useEffect(() => {
    const run = async () => {
      if (!project || !project._id) {
        return;
      }
      const summary = await getSamplesSummary(project._id);
      setSamplesSummary(summary);
    };
    run();
  }, [project]);

  const doEditProject = async (project: Project) => {
    const projectId = project._id;

    if (!projectId) {
      throw new Error(`Cannot edit a project with missing Project ID.`);
    }

    project.name = projectName;
    project.query_strategy = queryStrategy;
    project.task = taskSelection || "";

    const updatedProject = {
      name: project.name,
      query_strategy: project.query_strategy,
      task: project.task,
    };

    await editProject(projectId, updatedProject);
    if (onModify) onModify();
  };

  const doCreateProject = async (dataLoaderOptions: DataLoaderOptions) => {
    const project = buildProject(
      projectName,
      dataLoaderOptions,
      taskSelection || "",
      queryStrategy,
    );

    const samples = buildSamples(dataLoaderOptions);

    const projectId = await createProject(project);
    await createSamples(projectId, samples);
    if (onModify) onModify();
  };

  const updateDataLoaderOptions = (samplesSummary: SamplesSummary) => {
    const dataLoaderName = samplesSummary?.data?.protocol;

    if (dataLoaderName === "uda") {
      // UDA data loader
      const dataInfo = samplesSummary.data as ShotData;
      setDataLoaderOptions({
        name: dataLoaderName,
        signal_names: dataInfo.signal_names || [],
        shot_min: samplesSummary.shot_min || null,
        shot_max: samplesSummary.shot_max || null,
      } as UDADataLoaderOptions);
    } else if (dataLoaderName === "file") {
      // File data loader
      const dataInfo = samplesSummary.data as FileData;
      setDataLoaderOptions({
        name: dataLoaderName,
        signal_names: dataInfo.column_names || [],
        file_type: dataLoaderName,
        file_names: [],
        file_name: dataInfo.file_name || [],
      } as FileDataLoaderOptions);
    } else {
      // Unknown data loader
      setDataLoaderOptions(null);
    }
  };

  useEffect(() => {
    if (project && samplesSummary !== null) {
      updateDataLoaderOptions(samplesSummary);
      setProjectName(project.name);
      setQueryStrategy(project.query_strategy);
      setTaskSelection(project.task);
    }
  }, [project, samplesSummary]);

  const onCreatePress = async (close: () => void) => {
    if (editMode && project?._id) {
      try {
        await doEditProject(project);
        close();
      } catch (error) {
        ToastQueue.negative(`${error}`, { timeout: 3000 });
      }
    } else {
      try {
        if (dataLoaderOptions === null) {
          return;
        }
        await doCreateProject(dataLoaderOptions);
        close();
      } catch (error) {
        ToastQueue.negative(`${error}`, { timeout: 3000 });
      }
    }
  };

  return (
    <DialogTrigger>
      <Button variant={editMode ? "accent" : "primary"}>
        {icon}
        {!editMode ? <Text>{text}</Text> : <></>}
      </Button>
      {(close) => (
        <Dialog>
          <Heading>{text} Project</Heading>
          <Divider />
          <Content>
            <Form maxWidth="size-6000">
              <TextField
                label="Project Name"
                isRequired
                value={projectName}
                onChange={setProjectName}
              />

              <>
                {!editMode && (
                  <>
                    <DataLoaderForm
                      dataLoaderOptions={dataLoaderOptions}
                      setDataLoaderOptions={setDataLoaderOptions}
                    />
                    <TaskLoaderForm
                      taskName={taskSelection}
                      setTaskName={setTaskSelection}
                    />
                  </>
                )}
              </>

              <RadioGroup
                label="Query Strategy"
                isRequired
                value={queryStrategy}
                onChange={setQueryStrategy}
              >
                {QueryStrategies.map((item: Record<string, string>) => (
                  <Radio key={item.key} value={item.key}>
                    {item.value}
                  </Radio>
                ))}
              </RadioGroup>
            </Form>
          </Content>
          <ButtonGroup>
            <Button variant="primary" onPress={close}>
              Close
            </Button>
            <Button variant="primary" onPress={() => onCreatePress(close)}>
              {text}
            </Button>
          </ButtonGroup>
        </Dialog>
      )}
    </DialogTrigger>
  );
};
