"use client";
import { use, useState, useEffect } from 'react';
import {Form, FileTrigger, Flex, Button, ToastQueue, ListView, ToastContainer, View, TextField, Text, ComboBox, RadioGroup, ContextualHelp, NumberField, Radio, Provider, defaultTheme, Breadcrumbs, Item} from '@adobe/react-spectrum'
import { getAllSamples, getProject, getSamples, getSamplesSummary } from '@/app/core';
import { Project, Sample, SamplesSummary } from '@/types';
import { ProjectConfigForm } from '../../components/project_config';

const ProjectEditBreadCrumbs = ({project} : { project: Project | null}) => {
  if (project === null) {
    return;
  }
  return (
      <Provider theme={defaultTheme}>
        <Breadcrumbs>
          <Item key="projects" href={`${process.env.NEXT_PUBLIC_API_URL}/projects/`}>Projects</Item>
          <Item key="project" href={`${process.env.NEXT_PUBLIC_API_URL}/projects/${project._id}`}>Project: {project.name}</Item>
          <Item key="edit">Edit</Item>
        </Breadcrumbs>
      </Provider>
  );
};



type ProjectEditInfo = {
  params: Promise<{ project_id: string }>;
};
export default function ProjectEdit({params}: ProjectEditInfo) {
  const projectId = use(params).project_id;
  const [project, setProject] = useState<Project | null>(null);
  const [samplesSummary, setSamplesSummary] = useState<SamplesSummary[]>([]);

  useEffect(() => {
    const run = async () => {
        const project = await getProject(projectId);
        setProject(project);
        const summary = await getSamplesSummary(projectId);
        setSamplesSummary(summary);
    }
    run();
  }, []);

  return (
    <div>
      <ProjectEditBreadCrumbs project={project} />
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-gray-200 via-gray-300 to-gray-400">
        <div className="w-full md:w-4/5 p-6 bg-white/60 text-gray-800 rounded-lg shadow-lg backdrop-blur-sm">
          <h1 className="text-2xl font-bold mb-4">
            Edit Project
          </h1>
            <Provider theme={defaultTheme}>
                <ToastContainer placement="top" />
                <div className="mb-4 p-4">
                    <ProjectConfigForm project={project} samplesSummary={samplesSummary}/>
                </div>
            </Provider>
        </div>
      </div>
    </div>
  )
}
