"use client";
import { z } from "zod/v4";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {Form, Flex, Button, ToastQueue, ListView, View, TextField, Text, ComboBox, RadioGroup, NumberField, Radio, Item} from '@adobe/react-spectrum'
import { Project, Sample, SamplesSummary } from '@/types';

const Tasks = [
  {'key': 'ELM', 'value': 'ELM'},
  {'key': 'disruption', 'value': 'Disruption'},
  {'key': 'MHD', 'value': 'MHD'},
]

const DataLoaders = [
  {'key': 'file', 'value': 'Local File'},
  {'key': 'uda', 'value': 'UDA'},
];

const QueryStrategies = [
  {'key': 'random', 'value': 'Random'},
  {'key': 'sequential', 'value': 'Sequential'},
];

const FileTypes = [
  {'key': 'parquet', 'value': 'Parquet'},
];

const DataLoaderOptionsSchema = z.object({
  name: z.string(),
  signal_names: z.array(z.string()),
});
type DataLoaderOptions = z.infer<typeof DataLoaderOptionsSchema>;

const UDADataLoaderOptionsSchema = DataLoaderOptionsSchema.extend({
  shot_min: z.number(),
  shot_max: z.number(),
});
type UDADataLoaderOptions = z.infer<typeof UDADataLoaderOptionsSchema>;

const FileDataLoaderOptionsSchema = DataLoaderOptionsSchema.extend({
  file_type: z.string(),
  file_names: z.array(z.string()),
});
type FileDataLoaderOptions = z.infer<typeof FileDataLoaderOptionsSchema>;

const SignalNamesUI = ({displayName, signalNames, setSignalNames} : {displayName: string, signalNames: string[], setSignalNames: (items: string[]) => void}) => {
  const [items, setItems] = useState<string[]>(signalNames);
  const [input, setInput] = useState('');

  const handleAddItem = () => {
    if (input.trim()) {
      setItems((prev: string[]) => {
        const newItems = [...prev, input.trim()];
        return newItems;
      });
      setInput('');
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
  }, [items]);


  return (
    <>
      <Flex direction="column" gap="size-200" marginBottom="size-200">
        <Flex direction="row" alignItems="end" gap="size-200">
          <TextField
            label={displayName}
            value={input}
            onChange={setInput}
          />

          <Button variant="primary" onPress={handleAddItem} marginTop="size-100">
            Add
          </Button>
        </Flex>

        <ListView aria-label="Dynamic List" marginTop="size-200">
          {items.map((item, index) => (
            <Item key={index} textValue={item}>
              <Flex direction="row" alignItems="center" gap="size-200" wrap="nowrap">
                <Text>{item}</Text>              
                <Button
                  variant="negative"
                  onClick={() => handleRemoveItem(index)}
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
}

const UDADataLoaderOptionsUI = ({dataLoaderOptions, setDataLoaderOptions} : {dataLoaderOptions: UDADataLoaderOptions, setDataLoaderOptions: (options: DataLoaderOptions) => void}) => {
  const [shotMin, setShotMin] = useState<number | null>(dataLoaderOptions?.shot_min || null);
  const [shotMax, setShotMax] = useState<number | null>(dataLoaderOptions?.shot_max || null);
  const [signalNames, setSignalNames] = useState<string[]>(dataLoaderOptions?.signal_names || []);


  useEffect(() => { 
    const options = UDADataLoaderOptionsSchema.safeParse({
      name: 'uda',
      signal_names: signalNames,
      shot_min: shotMin,
      shot_max: shotMax
    });

    if (options.success) {
      setDataLoaderOptions(options.data);
    }
  }, [shotMin, shotMax, signalNames]);

  return (
    <View
      label="UDA Data Loader Options"
      borderWidth="thin"
      borderColor="dark"
      borderRadius="medium"
      padding="size-250">
        <Flex direction='column'>
          <Flex direction="row" gap="size-200" alignItems="center">
            <NumberField label="Shot Min" isRequired value={shotMin} onChange={setShotMin}/>
            <NumberField label="Shot Max" isRequired value={shotMax} onChange={setShotMax} />
          </Flex>
        <SignalNamesUI displayName={'UDA Signal Names'} signalNames={signalNames} setSignalNames={setSignalNames} />
        </Flex>
    </View>
  );
}

const FileDataLoaderOptionsUI = ({dataLoaderOptions, setDataLoaderOptions} : {dataLoaderOptions: FileDataLoaderOptions, setDataLoaderOptions: (options: DataLoaderOptions) => void}) => {
  const [filePath, setFilePath] = useState<string>(dataLoaderOptions?.file_name || '' );
  const [fileType, setFileType] = useState<string>(dataLoaderOptions?.protocol || FileTypes[0].key);
  const [signalNames, setSignalNames] = useState<string[]>(dataLoaderOptions?.signal_names || []);
  const [fileNames, setFileNames] = useState<string[]>([]);

  useEffect(() => { 
    const options = FileDataLoaderOptionsSchema.safeParse({
      name: 'file',
      signal_names: signalNames,
      file_type: fileType,
      file_names: fileNames
    });

    if (options.success) {
      setDataLoaderOptions(options.data);
    }
  }, [signalNames, fileNames]);

  useEffect(() => {
    async function fetchFileList() { 
      if (filePath) {
        try {
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/files?file_path=${filePath}&file_type=${fileType}`);
          if (response.ok) {
            const fileList = await response.json();
            setFileNames(fileList);
          } else {
            ToastQueue.negative(`Error fetching files from ${filePath}`, {timeout: 3000});
          }
        } catch (error) {
          ToastQueue.negative(`Error fetching files: ${error}`, {timeout: 3000});
        }
      }
    }
    fetchFileList();
  }, [filePath])

  return (
    <View
      label="File Data Loader Options"
      borderWidth="thin"
      borderColor="dark"
      borderRadius="medium"
      padding="size-250">
      <Flex direction="column" gap="size-200">
        <ComboBox label="File Type" items={FileTypes} selectedKey={fileType} onSelectionChange={setFileType} isRequired>
          {(item: Record<string, string>) => <Item key={item.key}>{item.value}</Item>}
        </ComboBox>
        <Flex direction="row" gap="size-200" alignItems="end">
          <TextField
            label="File Path"
            value={filePath}
            onChange={setFilePath}
            isRequired
          >
          </TextField>
          <Text>{fileNames.length} {fileType} files found.</Text>
        </Flex>
        <SignalNamesUI displayName={'File Columns'} signalNames={signalNames} setSignalNames={setSignalNames} />
      </Flex>
    </View>
  );
}

const DataLoaderForm = ({dataLoaderOptions, setDataLoaderOptions} : {dataLoaderOptions: DataLoaderOptions, setDataLoaderOptions: (options: DataLoaderOptions) => void}) => {
  const name = dataLoaderOptions ? dataLoaderOptions.name : null;
  console.log(`DataLoaderForm: name=${name}`);
  const [selectedKey, setSelectedKey] = useState<string | null>(name || null);

  useEffect(() => {
    if (name !== selectedKey) {
      setSelectedKey(name);
    }
  }, [name, selectedKey]);

  return (
    <>
      <ComboBox label="Data Loader" items={DataLoaders} isRequired onSelectionChange={setSelectedKey} selectedKey={selectedKey}>
        {(item: Record<string, string>) => <Item key={item.key}>{item.value}</Item>}
      </ComboBox>
      {name === 'uda' && (<UDADataLoaderOptionsUI dataLoaderOptions={dataLoaderOptions} setDataLoaderOptions={setDataLoaderOptions} />)}
      {name === 'file' && (<FileDataLoaderOptionsUI dataLoaderOptions={dataLoaderOptions} setDataLoaderOptions={setDataLoaderOptions} />)}
    </>
  );
}

const TaskLoaderForm = ({taskName, setTaskName} : {taskName: string, setTaskName: (selection: string) => void}) => {
  return (
    <>
      <ComboBox label="Task" items={Tasks} onSelectionChange={setTaskName} isRequired selectedKey={taskName}>
        {(item: Record<string, string>) => <Item key={item.key}>{item.value}</Item>}
      </ComboBox>
    </>
  );
}

export const ProjectConfigForm = ({project, samplesSummary} : {project?: Project | null, samplesSummary?: SamplesSummary | null}) => {
  const editMode = project !== undefined && project !== null;
  const router = useRouter();
  const [projectName, setProjectName] = useState<string>('');
  const [queryStrategy, setQueryStrategy] = useState<string>(QueryStrategies[0].key);
  const [taskSelection, setTaskSelection] = useState<string | null>(null);
  const [dataLoaderOptions, setDataLoaderOptions] = useState<DataLoaderOptions | null>(null);

  useEffect(() => {
    if (project && samplesSummary !== null) {
      samplesSummary = samplesSummary as SamplesSummary;

      const dataLoaderName = samplesSummary?.data?.protocol;
      console.log(`Data loader name`, samplesSummary);

      if (dataLoaderName === 'uda') {
        setDataLoaderOptions({
          name: dataLoaderName,
          signal_names: samplesSummary.data.signal_names || [],
          shot_min: samplesSummary.shot_min || null,
          shot_max: samplesSummary.shot_max || null,
        } as UDADataLoaderOptions);
      } else if (dataLoaderName === 'file') {
        setDataLoaderOptions({
          name: dataLoaderName,
          signal_names: samplesSummary.data.column_names || [],
          file_type: dataLoaderName,
          file_names: [],
          file_name: samplesSummary.data.file_name || [],
        } as FileDataLoaderOptions);
      } else {
        setDataLoaderOptions(null);
      }

      setProjectName(project.name);
      setQueryStrategy(project.query_strategy);
      setTaskSelection(project.task);
    }
  }, [project, samplesSummary]);

  const setupProject = async (e) => {
    e.preventDefault();

    if (dataLoaderOptions === null) {
      return;
    }


    if (editMode) {
      const projectId = project._id;
      let updatedProject = createProject();
      updatedProject.data_loader = project.data_loader;
      updatedProject.task = project.task;
      console.log(`Editing project ${projectId}`, updatedProject);
      await editProject(projectId, updatedProject);
    } else {
      const project = createProject();
      const projectId = await makeProject(project);
      const samples = createSamples(projectId, dataLoaderOptions);
      await makeSamples(projectId, samples);
    }
    
    const url = `${process.env.NEXT_PUBLIC_API_URL}/projects`;
    router.push(url);
  }

  const createProject = (): Project => {
    const project: Project = {
      name: projectName,
      data_loader: dataLoaderOptions.name,
      task: taskSelection,
      query_strategy: queryStrategy,
    };
    return project;
  }

  const makeProject = async (project: Project): Promise<string | null> => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(project),
    });

    if (!response.ok) {
      const error = await response.json();
      ToastQueue.negative(`Error creating project: ${error}`, {timeout: 3000})
      return null;
    }

    const projectId = (await response.json())["_id"];
    return projectId;
  }

  const editProject = async (projectId: string, project: Project): Promise<string | null> => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${projectId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(project),
    });

    if (!response.ok) {
      const error = await response.json();
      ToastQueue.negative(`Error editing project ${projectId}: ${error}`, {timeout: 3000})
      return null;
    }

    return projectId;
  }

  const createSamples = (projectId: string | null, dataLoaderOptions: DataLoaderOptions): Sample[] | null => {
    if (projectId === null) {
      return null;
    }

    const fileTypes = FileTypes.map((item) => item.key);

    if (dataLoaderOptions.name === 'uda') {
      return createUDASamples();
    } else if (fileTypes.includes(dataLoaderOptions.name)) {
      return createFileSamples();
    } else {
      ToastQueue.negative(`Unknown data loader ${dataLoaderOptions.name}`, {timeout: 3000});
      return null;
    }
  }

  const createUDASamples = () => {
      const { shot_min, shot_max } = dataLoaderOptions as UDADataLoaderOptions;
      const shots = Array.from({length: shot_max - shot_min + 1}, (_, i) => i + shot_min);
      const samples: Sample[] = shots.map((shot_id: number) => ({
        shot_id: shot_id,
        data: {
          signal_names: dataLoaderOptions.signal_names,
          protocol: 'uda',
        }
      }));
      return samples;
  }
  const createFileSamples = () => {
      const options = dataLoaderOptions as FileDataLoaderOptions;
      const fileNames = options.file_names;

      // Assumption!: the file name must be the shot number.
      const shots = fileNames.map((name: string) => {
        const lastDotIndex = name.lastIndexOf('.');
        const lastSlashIndex = name.lastIndexOf('/');
        let shotName = name.substring(lastSlashIndex+1, lastDotIndex);
        const shotId = parseInt(shotName, 10);
        return shotId;
      });

      const samples: Sample[] = shots.map((shot_id: number, index: number) => ({
        shot_id: shot_id,
        data: {
          file_name: fileNames[index],
          type: options.file_type,
          protocol: 'file',
          column_names: dataLoaderOptions.signal_names,
        }
      }));
      return samples;
  };

  const makeSamples = async (projectId: string | null, samples: Sample[] | null) => {
    if (projectId === null) {
      return;
    }

    if (samples === null || samples.length === 0) {
      return;
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${projectId}/samples`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(samples),
    });

    if (!response.ok) {
      const error = await response.json();
      ToastQueue.negative(`Error creating samples: ${error}`, {timeout: 3000})
    }
  }

  return (
    <Form maxWidth="size-6000" onSubmit={setupProject}>
      <TextField label="Project Name" isRequired value={projectName} onChange={setProjectName} />

      {!editMode && (
        <>
        <DataLoaderForm dataLoaderOptions={dataLoaderOptions} setDataLoaderOptions={setDataLoaderOptions}/>
        <TaskLoaderForm taskName={taskSelection} setTaskName={setTaskSelection}/>
        </>
      )}

      <RadioGroup label="Query Strategy" isRequired value={queryStrategy} onChange={setQueryStrategy}>
        {QueryStrategies.map((item: Record<string, string>) => <Radio key={item.key} value={item.key}>{item.value}</Radio>)}
      </RadioGroup>
      <Button variant="primary" type="submit">{
        project ? 'Edit' : 'Create'  
      }</Button>
    </Form>
  );
}