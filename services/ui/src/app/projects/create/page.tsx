"use client";
import {ToastContainer, Provider, defaultTheme, Breadcrumbs, Item} from '@adobe/react-spectrum'
import { ProjectConfigForm } from "../components/project_config";

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

export const ProjectCreateForm = () => {

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
              <ProjectConfigForm />
            </div>
            </Provider>
        </div>
      </div>
    </div>
  )
}
