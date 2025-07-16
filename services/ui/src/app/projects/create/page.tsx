"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {Form, FileTrigger, Button, ToastQueue, ToastContainer, View, TextField, Text, ComboBox, RadioGroup, ContextualHelp, NumberField, Radio, Provider, defaultTheme, Breadcrumbs, Item} from '@adobe/react-spectrum'
import { Project } from '@/types';

const Tasks = [
  {'key': 'ELM', 'value': 'ELM'},
  {'key': 'disruption', 'value': 'Disruption'},
  {'key': 'MHD', 'value': 'MHD'},
]

const DataLoaders = [
  {'key': 'local_file', 'value': 'Local File'},
  {'key': 'uda', 'value': 'UDA'},
];

const QueryStrategies = [
  {'key': 'random', 'value': 'Random'},
  {'key': 'sequential', 'value': 'Sequential'},
];

const FileTypes = [
  {'key': 'parquet', 'value': 'Parquet'},
];

const ProjectCreateBreadCrumbs = () => {
  return (
      <Provider theme={defaultTheme}>
        <Breadcrumbs>
          <Item key="projects" href={`${process.env.NEXT_PUBLIC_API_URL}/projects/`}>Projects</Item>
          <Item key="create">Create</Item>
        </Breadcrumbs>
      </Provider>
  );
};

const DisruptionTaskOptions = () => {
  return (
    <View
      label="Disruption Task Options"
      borderWidth="thin"
      borderColor="dark"
      borderRadius="medium"
      padding="size-250">
        <ContextualHelp variant='info'>
          <Text>These are the relevant signal names passed to UDA/SAL etc. or columns to read from a file.</Text>
        </ContextualHelp>
        <TextField label="Ip Field Name" isRequired />
        <TextField label="Density Field Name" isRequired/>
    </View>
  );
}

const ELMTaskOptions = () => {
  return (
    <View
      label="ELM Task Options"
      borderWidth="thin"
      borderColor="dark"
      borderRadius="medium"
      padding="size-250">
        <ContextualHelp variant='info'>
          <Text>These are the relevant signal names passed to UDA/SAL etc. or columns to read from a file.</Text>
        </ContextualHelp>
        <TextField label="Ip Field Name" isRequired />
        <TextField label="Density Field Name" isRequired/>
        <TextField label="Te Field Name" isRequired/>
        <TextField label="Dalpha Field Name" isRequired/>
        <TextField label="NBI Power Field Name" isRequired/>
    </View>
  );
}

const MHDTaskOptions = () => {
  return (
    <View
      label="MHD Task Options"
      borderWidth="thin"
      borderColor="dark"
      borderRadius="medium"
      padding="size-250">
        <ContextualHelp variant='info'>
          <Text>These are the relevant signal names passed to UDA/SAL etc. or columns to read from a file.</Text>
        </ContextualHelp>
        <TextField label="Signal Name" isRequired />
    </View>
  );
}

const UDADataLoaderOptions = () => {
  return (
    <View
      label="UDA Data Loader Options"
      borderWidth="thin"
      borderColor="dark"
      borderRadius="medium"
      padding="size-250">
        <NumberField label="Shot Min" isRequired/>
        <NumberField label="Shot Max" isRequired/>
    </View>
  );
}

const FileDataLoaderOptions = () => {
  const [fileType, setFileType] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);

  return (
    <View
      label="File Data Loader Options"
      borderWidth="thin"
      borderColor="dark"
      borderRadius="medium"
      padding="size-250">
      <ComboBox label="File Type" items={FileTypes} selectedKey={FileTypes[0].key} onSelectionChange={setFileType} isRequired>
        {(item: Record<string, string>) => <Item key={item.key}>{item.value}</Item>}
      </ComboBox>

      <FileTrigger
        acceptDirectory
        onSelect={setFiles}
      >
        <div className="p-4 items-center justify-center">
          <Button variant="primary">Select Directory</Button>
        </div>
      </FileTrigger>
      {files.length > 0 && (
        <Text>{files.length}</Text>
      )}
    </View>
  );
}

const DataLoaderForm = ({dataLoader, setDataLoaderSelection} : {dataLoader: string | null, setDataLoaderSelection: (selection: string) => void}) => {
  return (
    <>
      <ComboBox label="Data Loader" items={DataLoaders} onSelectionChange={setDataLoaderSelection} isRequired>
        {(item: Record<string, string>) => <Item key={item.key}>{item.value}</Item>}
      </ComboBox>
      {dataLoader === 'uda' && (<UDADataLoaderOptions />)}
      {dataLoader === 'local_file' && (<FileDataLoaderOptions />)}
    </>
  );
}

const TaskLoaderForm = ({task, setTaskSelection} : {task: string | null, setTaskSelection: (selection: string) => void}) => {
  return (
    <>
      <ComboBox label="Task" items={Tasks} onSelectionChange={setTaskSelection} isRequired>
        {(item: Record<string, string>) => <Item key={item.key}>{item.value}</Item>}
      </ComboBox>
      {task === 'disruption' && (<DisruptionTaskOptions />)}
      {task === 'elm' && (<ELMTaskOptions />)}
      {task === 'mhd' && (<MHDTaskOptions />)}
    </>
  );
}

const ProjectCreateForm = () => {
  const [projectName, setProjectName] = useState<string>('');
  const [queryStrategy, setQueryStrategy] = useState<string>(QueryStrategies[0].key);
  const [dataLoaderSelection, setDataLoaderSelection] = useState<String | null>(null);
  const [taskSelection, setTaskSelection] = useState<String | null>(null);
  const router = useRouter();

  const createProject = async (e) => {
    e.preventDefault();

    const project: Project = {
      name: projectName,
      data_loader: dataLoaderSelection,
      task: taskSelection,
      query_strategy: queryStrategy,
    };

    console.log('Creating project:', project);
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
      return;
    }
    
    const url = `${process.env.NEXT_PUBLIC_API_URL}/projects`;
    router.push(url);
  }

  return (
    <Form  maxWidth="size-3000" onSubmit={createProject}>
      <TextField label="Project Name" isRequired value={projectName} onChange={setProjectName} />

      <DataLoaderForm dataLoader={dataLoaderSelection} setDataLoaderSelection={setDataLoaderSelection} />
      <TaskLoaderForm task={taskSelection} setTaskSelection={setTaskSelection} />

      <RadioGroup label="Query Strategy" isRequired value={queryStrategy} onChange={setQueryStrategy}>
        {QueryStrategies.map((item: Record<string, string>) => <Radio key={item.key} value={item.key}>{item.value}</Radio>)}
      </RadioGroup>
      <Button variant="primary" type="submit">Create</Button>
    </Form>
  );
}

export default function ProjectCreate() {

  return (
    <div>
      <ProjectCreateBreadCrumbs />
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-gray-200 via-gray-300 to-gray-400">
        <div className="w-full md:w-4/5 p-6 bg-white/60 text-gray-800 rounded-lg shadow-lg backdrop-blur-sm">
          <h1 className="text-2xl font-bold mb-4">
            Create Project
          </h1>
            <Provider theme={defaultTheme}>
            <ToastContainer placement="top" />
            <div className="mb-4 p-4">
              <ProjectCreateForm />
            </div>
            </Provider>
        </div>
      </div>
    </div>
  )
}
